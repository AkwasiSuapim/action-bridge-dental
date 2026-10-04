import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockBackend } from './mock-api';

/**
 * The connected web app against a contract-shaped mock of the live API (amounts from the real
 * benefits engine). Nothing here is simulated by the app itself.
 */
async function signIn(page: Page, email = 'jordan@example.com') {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('A-long-password-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: "Let's make sense of your dental costs.",
    }),
  ).toBeVisible();
}

async function startSample(page: Page) {
  await page.getByRole('button', { name: 'Try a sample case' }).click();
  await expect(
    page.getByRole('heading', { name: "Here is what we'll use" }),
  ).toBeVisible();
}

test('sign-in errors, first-sign-in password change, and session restore after reload', async ({
  page,
}) => {
  await mockBackend(page, { newPasswordFor: 'new@example.com' });
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('jordan@example.com');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();

  await page.getByLabel('Email', { exact: true }).fill('new@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Temporary-pass-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose a new password' }),
  ).toBeVisible();
  await page.getByLabel('New password').fill('short');
  await page.getByRole('button', { name: 'Set password and continue' }).click();
  await expect(page.getByText(/at least 12 characters/)).toBeVisible();
  await page.getByLabel('New password').fill('A-much-longer-Passw0rd');
  await page.getByLabel('Confirm password').fill('A-much-longer-Passw0rd');
  await page.getByRole('button', { name: 'Set password and continue' }).click();
  await expect(page.getByText('Hi, New')).toBeVisible();

  // Tokens never go to localStorage; the tab keeps its session across a reload.
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    'test-refresh',
  );
  await page.reload();
  await expect(page.getByText('Hi, New')).toBeVisible();
});

test('sample case: server amounts, choosing an option, saving once with retry, saved plan after reload', async ({
  page,
}) => {
  const api = await mockBackend(page);
  await signIn(page);
  await startSample(page);
  await expect(
    page.getByText('Sample case · Review before calculating'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Confirm and compare' }).click();

  await expect(
    page.getByRole('heading', {
      name: 'Two fillings and a crown',
      exact: true,
    }),
  ).toBeVisible();
  const cards = page.locator('.scenario-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('$1,200');
  await expect(cards.nth(1)).toContainText('$725');
  expect(api.requests.some((r) => r.path.endsWith('/scenarios'))).toBe(true);

  await cards.nth(1).getByRole('radio').check();
  await page.getByRole('button', { name: 'Review this plan' }).click();
  await expect(
    page.getByRole('heading', { name: 'Review this plan' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save this plan' }),
  ).toBeDisabled();
  await page.getByLabel('Save this plan and my answers in my account.').check();

  api.failNextSave = true;
  await page.getByRole('button', { name: 'Save this plan' }).click();
  await expect(page.getByText('The service is busy. Try again.')).toBeVisible();
  await page.getByRole('button', { name: 'Try saving again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your plan is saved' }),
  ).toBeVisible();

  // One idempotency key for the action and its retry; the server holds one plan.
  const saves = api.requests.filter(
    (r) => r.method === 'POST' && r.path.endsWith('/strategies'),
  );
  expect(saves).toHaveLength(2);
  expect(saves[0]!.headers['idempotency-key']).toBe(
    saves[1]!.headers['idempotency-key'],
  );
  expect(saves[1]!.body).toEqual({
    scenarioId: 'alt-1',
    expectedRevision: 1,
    consent: true,
  });
  expect([...api.strategies.values()].flat()).toHaveLength(1);
  await expect(page.getByText('Plan saved')).toBeVisible();

  await page.reload();
  await page.getByRole('link', { name: 'My plan' }).click();
  await expect(page.getByText('Saved to your account')).toBeVisible();
  await expect(page.locator('.plan-summary')).toContainText('$725');
});

test('composer: words and a page, analysed once, confirmations quote their source, then the estimate', async ({
  page,
}) => {
  const api = await mockBackend(page);
  await signIn(page);
  await page.getByRole('button', { name: 'Type' }).click();
  await expect(
    page.getByRole('heading', { name: 'Tell me about your treatment' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Analyse' })).toBeDisabled();

  await page
    .getByLabel('Describe your treatment and your plan')
    .fill(
      'I have dental insurance and my dentist recommends a crown at $1,000.',
    );
  await page.locator('input[type=file][multiple]').setInputFiles({
    name: 'estimate.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 fictional estimate'),
  });
  await expect(page.getByText('estimate.pdf')).toBeVisible();
  await expect(page.locator('.attachment-row.ready')).toHaveCount(1);
  expect(api.requests.filter((r) => r.path.endsWith('/jobs'))).toHaveLength(0);

  await page.getByRole('button', { name: 'Analyse' }).click();
  await expect(
    page.getByRole('heading', { name: 'Here’s what I understood' }),
  ).toBeVisible();
  const job = api.requests.find((r) => r.path.endsWith('/jobs'))!;
  expect(job.body).toMatchObject({
    operation: 'interpret',
    input: {
      text: expect.stringContaining('crown'),
      documentIds: [expect.any(String)],
    },
  });
  await expect(page.locator('.understood-card').first()).toContainText(
    'From your words',
  );

  await page.getByRole('button', { name: 'Looks right — continue' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your estimate is ready' }),
  ).toBeVisible();
  await expect(page.locator('.estimate-summary')).toContainText('$1,200');
  await page.getByRole('button', { name: 'See your options' }).click();
  await expect(page.locator('.scenario-card')).toHaveCount(2);

  await page.getByRole('button', { name: 'Edit details' }).click();
  await expect(
    page.locator('.facts-aside').getByText('From your words').first(),
  ).toBeVisible();
});

test('editing a fact saves it to the server as provided by you, and stale results are never shown', async ({
  page,
}) => {
  const api = await mockBackend(page);
  await signIn(page);
  await startSample(page);
  await page
    .getByRole('button', { name: 'Edit insurer already paid this year' })
    .click();
  await page.getByLabel('Insurer payments this year').fill('600');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const patch = api.requests.find((r) => r.method === 'PATCH')!;
  expect(patch.body).toMatchObject({
    expectedRevision: 1,
    changes: { planYears: expect.any(Object) },
  });
  const facts = (
    patch.body as {
      changes: { sourceFacts: { origin: string; fieldPath: string }[] };
    }
  ).changes.sourceFacts;
  expect(
    facts.some(
      (f) =>
        f.origin === 'user_entered' &&
        f.fieldPath.endsWith('insurerAlreadyPaidCents'),
    ),
  ).toBe(true);
  await expect(page.getByText('Provided by you').first()).toBeVisible();

  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await expect(page.locator('.scenario-card').first()).toBeVisible();
  // Results shown after the edit are for the new revision only.
  const latest = api.requests
    .filter((r) => r.path.endsWith('/scenarios'))
    .at(-1)!;
  expect((latest.body as { expectedRevision: number }).expectedRevision).toBe(
    2,
  );
});

test('self-pay quotes need every scope confirmation and come back from the server comparison', async ({
  page,
}) => {
  await mockBackend(page);
  await signIn(page);
  await startSample(page);
  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await page.getByRole('button', { name: 'Self-pay' }).click();
  await expect(
    page.getByRole('heading', { name: 'Add a self-pay quote' }),
  ).toBeVisible();
  const prices = page.locator('.form-grid input');
  await prices.nth(0).fill('200');
  await page
    .getByLabel('Each quote covers the same service as the treatment estimate.')
    .uncheck();
  await page.getByRole('button', { name: 'Save quotes' }).click();
  await expect(
    page.getByText(
      'Confirm each quote covers the same service as the estimate.',
    ),
  ).toBeVisible();
  await page
    .getByLabel('Each quote covers the same service as the treatment estimate.')
    .check();
  await page.getByRole('button', { name: 'Save quotes' }).click();
  // One of three prices: the server can't compare yet and says which are missing.
  await expect(
    page.getByText(/Add a cash price for Filling two, Crown to compare/),
  ).toBeVisible();
  await page.locator('.form-grid input').nth(1).fill('200');
  await page.locator('.form-grid input').nth(2).fill('900');
  await page.getByRole('button', { name: 'Save quotes' }).click();
  await expect(
    page.getByRole('heading', { name: 'Self-pay compared with your plan' }),
  ).toBeVisible();
  await expect(page.locator('.cash-comparison')).toContainText('$1,300');
  await expect(page).toHaveURL(/view=self-pay/);
});

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`layout and accessibility at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000); // Four full accessibility scans per width.
    await page.setViewportSize({ width, height: 900 });
    await mockBackend(page);
    await signIn(page);
    const noOverflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await noOverflow()).toBe(true);

    await page.getByRole('button', { name: 'Type' }).click();
    await expect(page.getByRole('button', { name: 'Analyse' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await noOverflow()).toBe(true);

    await page.goto('/');
    await startSample(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Confirm and compare' }).click();
    await expect(page.locator('.scenario-card').first()).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await noOverflow()).toBe(true);
  });
}
