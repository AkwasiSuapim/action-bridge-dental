import { expect, type Page } from '@playwright/test';

export const TEST_EMAIL = 'test.user@example.com';
export const TEST_PASSWORD = 'Test-password-1';

/**
 * Stands in for the Cognito user pool (any region): the test account signs in, everything else
 * is rejected. `newPassword` makes the account ask for a new password first, like an
 * admin-created user. Returns the Cognito operations that were called.
 */
export async function mockCognito(page: Page, { newPassword = false } = {}) {
  const calls: string[] = [];
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
  await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors });
    const target = (request.headers()['x-amz-target'] ?? '').split('.').pop();
    const body = request.postDataJSON();
    calls.push(target ?? '');
    const reply = (status: number, json: object) =>
      route.fulfill({
        status,
        headers: { ...cors, 'content-type': 'application/x-amz-json-1.1' },
        body: JSON.stringify(json),
      });
    const tokens = {
      AccessToken: 'test-access',
      RefreshToken: 'test-refresh',
      ExpiresIn: 3600,
    };
    if (target === 'InitiateAuth' && body.AuthFlow === 'REFRESH_TOKEN_AUTH')
      return body.AuthParameters.REFRESH_TOKEN === 'test-refresh'
        ? reply(200, {
            AuthenticationResult: {
              AccessToken: 'test-access',
              ExpiresIn: 3600,
            },
          })
        : reply(400, { __type: 'NotAuthorizedException' });
    if (target === 'InitiateAuth') {
      const { USERNAME, PASSWORD } = body.AuthParameters;
      if (USERNAME !== TEST_EMAIL || PASSWORD !== TEST_PASSWORD)
        return reply(400, { __type: 'NotAuthorizedException' });
      return newPassword
        ? reply(200, { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 's' })
        : reply(200, { AuthenticationResult: tokens });
    }
    if (target === 'RespondToAuthChallenge')
      return reply(200, { AuthenticationResult: tokens });
    if (target === 'RevokeToken') return reply(200, {});
    return reply(400, { __type: 'UnknownOperationException' });
  });
  return calls;
}

export async function signInForm(page: Page, email: string, password: string) {
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

export async function login(page: Page) {
  await mockCognito(page);
  await page.goto('/sign-in');
  await signInForm(page, TEST_EMAIL, TEST_PASSWORD);
  await expect(
    page.getByRole('heading', {
      name: "Let's make sense of your dental costs.",
    }),
  ).toBeVisible();
}
