import logoUrl from '../assets/logo.jpeg'

export default function TitleBar() {
  return (
    <div
      className="h-10 flex items-center px-4 gap-3 border-b border-border-subtle bg-bg-secondary flex-shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div className="flex items-center gap-2.5">
        <img src={logoUrl} alt="BedrockLens" className="w-5 h-5 rounded object-cover" />
        <span className="text-[11px] font-bold tracking-wide text-text-primary">BEDROCK</span>
        <span className="text-[11px] font-bold tracking-wide text-accent-green">LENS</span>
      </div>
      <div className="flex-1" />
    </div>
  )
}
