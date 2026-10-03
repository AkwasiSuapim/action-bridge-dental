/**
 * Minimal Cognito client over HTTPS (no AWS SDK, works in Expo Go). Uses the public mobile app
 * client (no secret). USER_PASSWORD_AUTH is enabled on that client for this native sign-in form;
 * managed login with PKCE remains available for a development build (D-10, D-15).
 */
export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds when the access token expires. */
  expiresAt: number;
}

export type SignInResult =
  | { kind: 'signed_in'; tokens: Tokens }
  | { kind: 'new_password_required'; session: string };

export class CognitoError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CognitoError';
  }
}

interface Settings {
  region: string;
  clientId: string;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

const FRIENDLY: Record<string, string> = {
  NotAuthorizedException: 'Email or password is incorrect.',
  UserNotFoundException: 'Email or password is incorrect.',
  PasswordResetRequiredException: 'This account needs a password reset. Ask your team admin.',
  UserNotConfirmedException: 'This account is not confirmed yet.',
  TooManyRequestsException: 'Too many attempts. Wait a moment and try again.',
  InvalidPasswordException: 'That password does not meet the requirements (12+ characters, upper and lower case, a number).',
};

export function createCognitoClient({ region, clientId, now = Date.now, fetchImpl = fetch }: Settings) {
  async function call(target: string, body: Record<string, unknown>): Promise<Record<string, any>> {
    let response: Response;
    try {
      response = await fetchImpl(`https://cognito-idp.${region}.amazonaws.com/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new CognitoError('NETWORK', 'Can’t reach the sign-in service. Check your connection.');
    }
    const json = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      const code = String(json.__type ?? 'Unknown').split('#').pop() ?? 'Unknown';
      throw new CognitoError(code, FRIENDLY[code] ?? 'Sign-in failed. Try again.');
    }
    return json;
  }

  function tokensFrom(result: Record<string, any> | undefined, previousRefresh?: string): Tokens {
    if (!result?.AccessToken) throw new CognitoError('NO_TOKENS', 'Sign-in did not return a session.');
    return {
      accessToken: result.AccessToken,
      refreshToken: result.RefreshToken ?? previousRefresh ?? '',
      expiresAt: now() + Number(result.ExpiresIn ?? 3600) * 1000,
    };
  }

  return {
    async signIn(email: string, password: string): Promise<SignInResult> {
      const json = await call('InitiateAuth', {
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: clientId,
        AuthParameters: { USERNAME: email, PASSWORD: password },
      });
      if (json.ChallengeName === 'NEW_PASSWORD_REQUIRED') return { kind: 'new_password_required', session: json.Session };
      if (json.ChallengeName) throw new CognitoError(json.ChallengeName, 'This account needs an extra sign-in step that the app does not support yet.');
      return { kind: 'signed_in', tokens: tokensFrom(json.AuthenticationResult) };
    },

    async completeNewPassword(email: string, newPassword: string, session: string): Promise<Tokens> {
      const json = await call('RespondToAuthChallenge', {
        ChallengeName: 'NEW_PASSWORD_REQUIRED',
        ClientId: clientId,
        Session: session,
        ChallengeResponses: { USERNAME: email, NEW_PASSWORD: newPassword },
      });
      return tokensFrom(json.AuthenticationResult);
    },

    async refresh(refreshToken: string): Promise<Tokens> {
      const json = await call('InitiateAuth', {
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: clientId,
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      });
      return tokensFrom(json.AuthenticationResult, refreshToken);
    },

    async revoke(refreshToken: string): Promise<void> {
      await call('RevokeToken', { Token: refreshToken, ClientId: clientId }).catch(() => undefined);
    },
  };
}

export type CognitoClient = ReturnType<typeof createCognitoClient>;
