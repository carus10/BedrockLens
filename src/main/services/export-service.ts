import { app, dialog } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import { format } from 'date-fns'
import type { PeriodData, DailyDataPoint } from '../../shared/types'
import { DataService } from './data-service'

export class ExportService {
  private static instance: ExportService

  static getInstance(): ExportService {
    if (!ExportService.instance) {
      ExportService.instance = new ExportService()
    }
    return ExportService.instance
  }

  async exportCSV(period: string): Promise<string> {
    const data = await this.getExportData(period)
    const csv = this.buildCSV(data)
    return this.saveFile(csv, `bedrock-usage-${period}.csv`, [{ name: 'CSV', extensions: ['csv'] }])
  }

  async exportJSON(period: string): Promise<string> {
    const data = await this.getExportData(period)
    const json = JSON.stringify(data, null, 2)
    return this.saveFile(json, `bedrock-usage-${period}.json`, [{ name: 'JSON', extensions: ['json'] }])
  }

  async exportExcel(period: string): Promise<string> {
    const data = await this.getExportData(period)
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'BedrockLens'
    workbook.created = new Date()

    const summarySheet = workbook.addWorksheet('Summary')
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Value', key: 'value', width: 20 }
    ]

    const periods = data.periods
    for (const p of periods) {
      summarySheet.addRow({ metric: `--- ${p.label} ---`, value: '' })
      summarySheet.addRow({ metric: 'Requests', value: p.total.requestCount })
      summarySheet.addRow({ metric: 'Input Tokens', value: p.total.inputTokens })
      summarySheet.addRow({ metric: 'Output Tokens', value: p.total.outputTokens })
      summarySheet.addRow({ metric: 'Cache Read Tokens', value: p.total.cacheReadTokens })
      summarySheet.addRow({ metric: 'Cache Write Tokens', value: p.total.cacheWriteTokens })
      summarySheet.addRow({ metric: 'Avg Latency (ms)', value: p.total.averageLatencyMs.toFixed(0) })
      summarySheet.addRow({ metric: 'Estimated Cost ($)', value: p.total.estimatedCost.toFixed(6) })
      if (p.total.actualCost !== undefined) {
        summarySheet.addRow({ metric: 'Actual Cost ($)', value: p.total.actualCost.toFixed(6) })
      }
      summarySheet.addRow({ metric: '', value: '' })
    }

    const dailySheet = workbook.addWorksheet('Daily')
    dailySheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Requests', key: 'requestCount', width: 12 },
      { header: 'Input Tokens', key: 'inputTokens', width: 15 },
      { header: 'Output Tokens', key: 'outputTokens', width: 15 },
      { header: 'Estimated Cost', key: 'estimatedCost', width: 18 },
      { header: 'Actual Cost', key: 'totalCost', width: 15 }
    ]

    for (const d of data.daily) {
      dailySheet.addRow(d)
    }

    const tmpPath = join(app.getPath('temp'), `bedrock-usage-${period}.xlsx`)
    await workbook.xlsx.writeFile(tmpPath)
    return this.saveFile(null, `bedrock-usage-${period}.xlsx`, [{ name: 'Excel', extensions: ['xlsx'] }], tmpPath)
  }

  async exportPDF(period: string): Promise<string> {
    const data = await this.getExportData(period)
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    doc.setFontSize(20)
    doc.text('BedrockLens — Usage Report', 20, 20)
    doc.setFontSize(10)
    doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 20, 30)

    let y = 45

    for (const p of data.periods) {
      if (y > 240) { doc.addPage(); y = 20 }
      doc.setFontSize(14)
      doc.text(p.label, 20, y)
      y += 8

      doc.setFontSize(9)
      const rows = [
        ['Requests', String(p.total.requestCount)],
        ['Input Tokens', p.total.inputTokens.toLocaleString()],
        ['Output Tokens', p.total.outputTokens.toLocaleString()],
        ['Cache Read', p.total.cacheReadTokens.toLocaleString()],
        ['Cache Write', p.total.cacheWriteTokens.toLocaleString()],
        ['Avg Latency', `${p.total.averageLatencyMs.toFixed(0)}ms`],
        ['Est. Cost', `$${p.total.estimatedCost.toFixed(4)}`]
      ]

      for (const [label, value] of rows) {
        doc.text(`${label}: ${value}`, 25, y)
        y += 5
      }
      y += 5
    }

    const pdfData = doc.output('arraybuffer')
    return this.saveFile(
      Buffer.from(pdfData),
      `bedrock-usage-${period}.pdf`,
      [{ name: 'PDF', extensions: ['pdf'] }]
    )
  }

  private async getExportData(period: string) {
    const dataService = DataService.getInstance()
    const [periods, daily] = await Promise.all([
      dataService.getPeriods(),
      dataService.getDailyData(30)
    ])
    return { periods, daily, exportedAt: new Date().toISOString(), period }
  }

  private buildCSV(data: Awaited<ReturnType<typeof this.getExportData>>): string {
    const lines = ['Period,Requests,Input Tokens,Output Tokens,Cache Read,Cache Write,Avg Latency (ms),Est Cost ($),Actual Cost ($)']

    for (const p of data.periods) {
      lines.push([
        p.label,
        p.total.requestCount,
        p.total.inputTokens,
        p.total.outputTokens,
        p.total.cacheReadTokens,
        p.total.cacheWriteTokens,
        p.total.averageLatencyMs.toFixed(0),
        p.total.estimatedCost.toFixed(6),
        p.total.actualCost?.toFixed(6) ?? ''
      ].join(','))
    }

    lines.push('')
    lines.push('Date,Requests,Input Tokens,Output Tokens,Est Cost ($),Actual Cost ($)')
    for (const d of data.daily) {
      lines.push([d.date, d.requestCount, d.inputTokens, d.outputTokens, d.estimatedCost.toFixed(6), d.totalCost.toFixed(6)].join(','))
    }

    return lines.join('\n')
  }

  private async saveFile(
    content: string | Buffer | null,
    defaultName: string,
    filters: Electron.FileFilter[],
    existingPath?: string
  ): Promise<string> {
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: join(app.getPath('downloads'), defaultName),
      filters
    })

    if (!filePath) throw new Error('Export cancelled')

    if (existingPath && content === null) {
      const { copyFileSync } = await import('fs')
      copyFileSync(existingPath, filePath)
    } else if (content !== null) {
      writeFileSync(filePath, content)
    }

    return filePath
  }
}
