import { OpenAPI } from '@defuse-protocol/one-click-sdk-typescript';

export interface OneClickApiConfig {
  baseUrl: string;
  token?: string;
}

const defaultOneClickBaseUrl = 'https://1click.chaindefuser.com';

export function getOneClickApiConfig(): OneClickApiConfig {
  return {
    baseUrl: process.env.ONE_CLICK_BASE_URL || defaultOneClickBaseUrl,
    token: process.env.PARTNER_JWT || undefined,
  };
}

// 1Click authentication signs a public intent for the matching environment.
export function getOneClickIntentsEnv(): 'production' | 'stage' {
  const { baseUrl } = getOneClickApiConfig();
  try {
    return new URL(baseUrl).hostname === '1click.chaindefuser.com' ? 'production' : 'stage';
  } catch {
    return 'stage';
  }
}

export function getRequiredOneClickApiConfig(): OneClickApiConfig & { token: string } {
  const config = getOneClickApiConfig();
  if (!config.token) {
    throw new Error('PARTNER_JWT is required for 1Click API requests');
  }
  return { ...config, token: config.token };
}

/**
 * Points the 1Click SDK at the configured environment and sets up authentication:
 * the partner key always goes into `X-API-Key`, and the user access token is
 * resolved lazily, only for the endpoints that need it.
 */
export function configureOneClickApi(
  config: OneClickApiConfig & { token: string },
  resolveUserToken?: () => Promise<string>,
): void {
  OpenAPI.BASE = config.baseUrl;
  OpenAPI.HEADERS = { 'X-API-Key': config.token };
  // Resolving must never recurse: authenticating itself is partner-authenticated.
  OpenAPI.TOKEN = async ({ url }) =>
    resolveUserToken && url === '/v0/account/balances' ? resolveUserToken() : '';
}
