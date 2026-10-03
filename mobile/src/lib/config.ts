/**
 * Public client configuration. EXPO_PUBLIC_* values are embedded in the app bundle, so they must
 * never contain secrets. Live mode only: a missing or malformed value is a visible configuration
 * error, never a silent switch to sample data.
 */
export interface AppConfig {
  apiBaseUrl: string;
  cognitoClientId: string;
  cognitoRegion: string;
}

export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; problems: string[] };

export function readConfig(env: {
  apiBaseUrl: string | undefined;
  cognitoClientId: string | undefined;
  cognitoRegion: string | undefined;
}): ConfigResult {
  const problems: string[] = [];
  const apiBaseUrl = env.apiBaseUrl?.trim().replace(/\/+$/, '') ?? '';
  if (!/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(apiBaseUrl) || /\/v1$/.test(apiBaseUrl)) {
    problems.push('EXPO_PUBLIC_API_BASE_URL must be the https API URL including the stage, without /v1.');
  }
  const cognitoClientId = env.cognitoClientId?.trim() ?? '';
  if (!/^[a-z0-9]{20,40}$/i.test(cognitoClientId)) problems.push('EXPO_PUBLIC_COGNITO_CLIENT_ID is missing or malformed.');
  const cognitoRegion = env.cognitoRegion?.trim() ?? '';
  if (!/^[a-z]{2}-[a-z]+-\d$/.test(cognitoRegion)) problems.push('EXPO_PUBLIC_COGNITO_REGION is missing or malformed.');

  return problems.length > 0 ? { ok: false, problems } : { ok: true, config: { apiBaseUrl, cognitoClientId, cognitoRegion } };
}

/** Expo inlines only static `process.env.EXPO_PUBLIC_*` references, so each is read explicitly. */
export const appConfig: ConfigResult = readConfig({
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  cognitoClientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID,
  cognitoRegion: process.env.EXPO_PUBLIC_COGNITO_REGION,
});
