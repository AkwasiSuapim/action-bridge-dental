/**
 * Public client settings from `VITE_*` variables. They are embedded in the bundle, so they are
 * never secrets. A missing or malformed value disables sign-in; there is no demo fallback.
 */
export type Config =
  | { ok: true; cognitoRegion: string; cognitoClientId: string }
  | { ok: false; problems: string[] };

export function readConfig(env: ImportMetaEnv): Config {
  const region = env.VITE_COGNITO_REGION?.trim() ?? '';
  const clientId = env.VITE_COGNITO_CLIENT_ID?.trim() ?? '';
  const problems: string[] = [];
  // The region becomes part of the Cognito host name, so accept only a region-shaped value.
  if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(region))
    problems.push('VITE_COGNITO_REGION is missing or invalid.');
  if (!/^[a-z0-9]+$/i.test(clientId))
    problems.push('VITE_COGNITO_CLIENT_ID is missing or invalid.');
  return problems.length
    ? { ok: false, problems }
    : { ok: true, cognitoRegion: region, cognitoClientId: clientId };
}

export const config = readConfig(import.meta.env);
