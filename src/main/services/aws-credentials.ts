import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { fromNodeProviderChain, fromSSO } from '@aws-sdk/credential-providers'
import { loadSharedConfigFiles } from '@smithy/shared-ini-file-loader'
import type { CredentialConfig, AWSCredentialStatus } from '../../shared/types'

export async function buildCredentialProvider(config: CredentialConfig) {
  switch (config.type) {
    case 'profile':
      return fromNodeProviderChain({
        profile: config.profile
      })

    case 'sso':
      return fromSSO({
        profile: config.profile,
        ssoStartUrl: config.ssoStartUrl,
        ssoAccountId: config.ssoAccountId,
        ssoRoleName: config.ssoRoleName,
        ssoRegion: config.region
      })

    case 'accessKey':
      return async () => ({
        accessKeyId: config.accessKeyId!,
        secretAccessKey: config.secretAccessKey!,
        sessionToken: config.sessionToken
      })

    case 'env':
    case 'instanceProfile':
    default:
      return fromNodeProviderChain()
  }
}

export async function testCredentials(config: CredentialConfig): Promise<AWSCredentialStatus> {
  try {
    const credProvider = await buildCredentialProvider(config)
    const client = new STSClient({
      region: config.region,
      credentials: credProvider
    })

    const result = await client.send(new GetCallerIdentityCommand({}))

    return {
      isValid: true,
      type: config.type,
      accountId: result.Account,
      userId: result.UserId,
      arn: result.Arn
    }
  } catch (err: any) {
    return {
      isValid: false,
      type: config.type,
      error: err.message ?? String(err)
    }
  }
}

export async function detectCredentials(): Promise<CredentialConfig | null> {
  const region = process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1'

  // 1. Environment variables
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return { type: 'env', region }
  }

  // 2. Named profile from env
  if (process.env.AWS_PROFILE) {
    return { type: 'profile', profile: process.env.AWS_PROFILE, region }
  }

  // 3. Shared config files — list available profiles
  try {
    const { credentialsFile, configFile } = await loadSharedConfigFiles()
    const profiles = Object.keys({ ...credentialsFile, ...configFile })

    if (profiles.includes('default')) {
      return { type: 'profile', profile: 'default', region }
    }

    if (profiles.length > 0) {
      return { type: 'profile', profile: profiles[0], region }
    }
  } catch {
    // no config files
  }

  // 4. Instance profile / container credential provider chain
  try {
    const provider = fromNodeProviderChain()
    await provider()
    return { type: 'instanceProfile', region }
  } catch {
    // no instance profile
  }

  return null
}

export async function listAwsProfiles(): Promise<string[]> {
  try {
    const { credentialsFile, configFile } = await loadSharedConfigFiles()
    const profiles = new Set([
      ...Object.keys(credentialsFile || {}),
      ...Object.keys(configFile || {}).map((p) => p.replace('profile ', ''))
    ])
    return Array.from(profiles).sort()
  } catch {
    return []
  }
}
