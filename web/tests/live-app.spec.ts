import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockBackend } from './mock-api';

/**
 * The connected web app against a contract-shaped mock of the live API (amounts from the real
 * benefits engine). Nothing here is simulated by the app itself.
 */
async function signIn(page: Page, email = 'jordan@example.com') {
  await page.goto('/sign-in');
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
  // Signed out: the landing page at /, and sign-in for any app page.
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: 'Sign in' }).first(),
  ).toBeVisible();
  await page.goto('/options');
  await expect(page).toHaveURL(/\/sign-in$/);
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
  await expect(page.getByRole('alert')).toContainText('12 characters');
  await page.getByLabel('New password').fill('A-much-longer-Passw0rd');
  await page.getByLabel('Confirm password').fill('A-much-longer-Passw0rd');
  await page.getByRole('button', { name: 'Set password and continue' }).click();
  // Back to the page that was asked for before signing in.
  await expect(page).toHaveURL(/\/options$/);
  await expect(page.getByText('new@example.com')).toBeVisible();

  // Tokens never go to localStorage; the tab keeps its session across a reload.
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    'test-refresh',
  );
  await page.reload();
  await expect(page.getByText('new@example.com')).toBeVisible();
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
  const cards = page.locator('.choice-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('$1,200');
  await expect(cards.nth(1)).toContainText('$725');
  expect(api.requests.some((r) => r.path.endsWith('/scenarios'))).toBe(true);
  // Plain words first, from the calculator's numbers.
  await expect(page.locator('.meaning-card')).toContainText(
    'If you do everything as planned, you pay about $1,200 and your plan pays $300.',
  );
  await expect(page.locator('.meaning-card')).toContainText('$475 less');
  await expect(cards.nth(1)).toContainText('Save $475');
  await expect(page.locator('.benefits-left')).toContainText('$300');
  // Reminder: Google Calendar with the event filled in, or a calendar file for Apple/Outlook.
  const google = page.getByRole('link', { name: 'Add to Google Calendar' });
  await expect(google).toHaveAttribute(
    'href',
    /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=Use\+your\+dental\+benefits/,
  );
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Apple or Outlook calendar' }).click();
  expect((await download).suggestedFilename()).toBe(
    'dental-benefits-reminder.ics',
  );

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
  // One card at a time, with its quote and a one-line meaning.
  await expect(page.getByText('Is this right? · 1 of 2')).toBeVisible();
  await expect(page.locator('.understood-card .term-meaning')).toContainText(
    'Dental insurance:',
  );
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

  await page.getByRole('button', { name: 'Yes, that’s right' }).click();
  await expect(page.getByText('Is this right? · 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Not right' }).click();
  await expect(
    page.getByRole('heading', { name: 'Check before I use these' }),
  ).toBeVisible();
  await expect(page.getByText('✓ Yes, use this')).toBeVisible();
  await expect(page.getByText('✗ Not right — left out')).toBeVisible();
  // Change of mind from the summary: back to that card, then Yes.
  await page.getByRole('button', { name: /^Change: Crown/ }).click();
  await page.getByRole('button', { name: 'Yes, that’s right' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your estimate is ready' }),
  ).toBeVisible();
  await expect(page.locator('.estimate-summary')).toContainText('$1,200');
  await page.getByRole('button', { name: 'See your options' }).click();
  await expect(page.locator('.choice-card')).toHaveCount(2);

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
  await expect(page.locator('.choice-card').first()).toBeVisible();
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
  await page.getByRole('button', { name: 'Paying without insurance' }).click();
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
    await expect(page.locator('.choice-card').first()).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await noOverflow()).toBe(true);
  });
}

test('contradictory details: one request, a clear message and a way to fix it — never a retry loop', async ({
  page,
}) => {
  const api = await mockBackend(page);
  await signIn(page);
  await startSample(page);
  // The stored case says the deductible met ($60) is more than the deductible ($50).
  const [record] = [...api.cases.values()];
  record!.planYears['py-2026']!.deductibleAlreadyMetCents = 6000;
  await page.goto('/options');
  await expect(
    page.getByRole('heading', { name: 'Two details don’t add up' }),
  ).toBeVisible();
  await expect(
    page
      .getByText('Deductible already met is larger than the annual deductible.')
      .first(),
  ).toBeVisible();
  await page.waitForTimeout(1500);
  const calls = api.requests.filter((r) => r.path.endsWith('/scenarios'));
  expect(calls.length).toBeLessThanOrEqual(2);
  await page.getByRole('button', { name: 'Fix your details' }).click();
  await expect(
    page.getByText('Two details don’t add up — fix one to continue:'),
  ).toBeVisible();
});

test('voice guidance: reads each card, hears "yes" / "not right" / "continue", and moves on hands-free', async ({
  page,
}) => {
  // Simulated voice and microphone: speaking ends at once; each listen hears the next reply.
  await page.addInitScript(() => {
    const replies = ['yes', 'not right', 'continue'];
    const spoken: string[] = [];
    (window as unknown as { __spoken: string[] }).__spoken = spoken;
    const fakeSynthesis = {
      speak: (u: { text: string; onend?: () => void }) => {
        spoken.push(u.text);
        setTimeout(() => u.onend?.(), 10);
      },
      cancel: () => undefined,
    };
    try {
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        get: () => fakeSynthesis,
      });
    } catch {
      Object.assign(window.speechSynthesis, fakeSynthesis);
    }
    (
      window as unknown as { SpeechSynthesisUtterance: unknown }
    ).SpeechSynthesisUtterance = class {
      text: string;
      onend?: () => void;
      onerror?: () => void;
      constructor(text: string) {
        this.text = text;
      }
    };
    const FakeRecognition = class {
      lang = '';
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        const transcript = replies.shift() ?? '';
        setTimeout(() => {
          this.onresult?.({ results: [[{ transcript }]] });
        }, 20);
      }
      stop() {
        setTimeout(() => this.onend?.(), 5);
      }
      abort() {
        this.onend?.();
      }
    };
    // Replace both the standard and the prefixed recognizer.
    Object.assign(window, {
      SpeechRecognition: FakeRecognition,
      webkitSpeechRecognition: FakeRecognition,
    });
  });
  const api = await mockBackend(page);
  // Polly unavailable in the test: the browser voice (simulated above) is used instead.
  await page.route(/\/v1\/speech$/, (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'x',
          retryable: true,
          requestId: 'r',
        },
      },
    }),
  );
  await signIn(page);
  await page.getByRole('button', { name: 'Turn on voice guidance' }).click();
  await page.getByRole('button', { name: 'Type' }).click();
  await page
    .getByLabel('Describe your treatment and your plan')
    .fill(
      'I have dental insurance and my dentist recommends a crown at $1,000.',
    );
  await page.getByRole('button', { name: 'Analyse' }).click();

  // No taps from here: yes → not right → continue.
  await expect(
    page.getByRole('heading', { name: 'Your estimate is ready' }),
  ).toBeVisible({ timeout: 20_000 });
  const answers = api.requests.find((r) => r.path.endsWith('/answers'))!
    .body as { answers: { value: unknown }[] };
  expect(answers.answers.map((a) => a.value)).toEqual([true, false]);
  const spoken = await page.evaluate(
    () => (window as unknown as { __spoken: string[] }).__spoken,
  );
  expect(spoken[0]).toContain('Is this right?');
  expect(spoken.join(' ')).not.toMatch(/\d{4}-\d{2}-\d{2}|·/);
});
