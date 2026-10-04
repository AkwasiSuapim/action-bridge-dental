import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function login(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Fill demo credentials' }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: "Let's make sense of your dental costs.",
    }),
  ).toBeVisible();
}
async function compare(page: Page) {
  await page.getByRole('button', { name: 'Try a sample case' }).click();
  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await page.getByRole('button', { name: 'Use sample amount' }).click();
  await page.getByRole('button', { name: 'Confirm answer' }).click();
  await page.getByRole('button', { name: 'Review confirmed details' }).click();
  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await expect(
    page.getByRole('button', { name: 'Skip preview' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Skip preview' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Two fillings and a crown',
      exact: true,
    }),
  ).toBeVisible();
}

test('login validation, keyboard submit, local signup and reset-password simulations', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('wrong@example.com');
  await page.getByLabel('Your password', { exact: true }).fill('incorrect');
  await page.getByLabel('Your password', { exact: true }).press('Enter');
  await expect(page.getByText(/Demo credentials did not match/)).toBeVisible();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Demo reset confirmation. No email was sent.',
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await page.getByLabel('Name', { exact: true }).fill('Taylor');
  await page.getByLabel('Email', { exact: true }).fill('taylor@example.com');
  await page.getByLabel('Choose a password').fill('DemoPassword1!');
  await page.getByLabel('Confirm password').fill('DemoPassword1!');
  await page.getByRole('button', { name: 'Create demo account' }).click();
  await expect(page.getByText('Hi, Taylor')).toBeVisible();
  const stored = await page.evaluate(() =>
    localStorage.getItem('actionbridge.web.demo.v1'),
  );
  expect(stored).not.toContain('DemoPassword1!');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome to ActionBridge Dental' }),
  ).toBeVisible();
});

test('complete sample journey, sources, procedure math, saving once and reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await compare(page);
  await expect(page.locator('.scenario-money').nth(0)).toHaveText('$1,200');
  await expect(page.locator('.scenario-money').nth(1)).toHaveText('$725');
  await expect(page.locator('.difference-banner')).toContainText('$475');
  await page.getByRole('radio').nth(1).check();
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Sources' })).toContainText(
    'Fictional',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('radio').nth(1)).toBeChecked();
  await expect(page.locator('.benefit-card')).toContainText('$325');
  await page.getByRole('button', { name: 'View details', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Crown' }).click();
  await expect(
    page.getByText('Deductible applied', { exact: true }).last(),
  ).toBeVisible();
  await expect(
    page.getByText('Annual maximum shortfall', { exact: true }).last(),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Review this plan', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Save this plan', exact: true }),
  ).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page
    .getByRole('button', { name: 'Save this plan', exact: true })
    .dblclick();
  await expect(
    page.getByRole('heading', { name: 'Your plan is saved' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'View My plan' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Split across benefit years',
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: 'Split across benefit years',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  await expect(
    page.locator('summary').filter({ hasText: 'Plan saved' }),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('cash quote validation and honest lower-cost cash comparison', async ({
  page,
}) => {
  await login(page);
  await compare(page);
  await page.getByRole('button', { name: 'Self-pay', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Add a self-pay quote' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add quote', exact: true }).click();
  await expect(page.getByText(/Enter a positive cash quote/)).toBeVisible();
  await page.getByRole('button', { name: 'Use sample quote: $1,500' }).click();
  await expect(page.locator('.cash-comparison')).toContainText('$300');
  await expect(page.locator('.cash-comparison')).toContainText('$775');
  await page.getByRole('button', { name: 'Edit quote', exact: true }).click();
  await page.getByLabel('Cash quote for all three procedures').fill('500');
  await page.getByRole('button', { name: 'Add quote', exact: true }).click();
  await expect(page.locator('.cash-comparison')).toContainText(
    'Cash is $700 lower',
  );
  await expect(page.locator('.cash-comparison')).toContainText(
    'Cash is $225 lower',
  );
});

test('all intake methods preserve existing input and label simulations', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText(/Add your treatment notes/)).toBeVisible();
  await page.getByRole('button', { name: 'Use sample description' }).click();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('button', { name: 'Add document', exact: true }).click();
  await page.getByLabel('Choose a treatment document').setInputFiles({
    name: 'my-estimate.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n fictional browser test'),
  });
  await expect(page.getByText('my-estimate.pdf')).toBeVisible();
  await page.getByRole('button', { name: 'Review information' }).click();
  await page.getByRole('button', { name: 'Add voice note' }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByLabel('Sample transcript')).toBeVisible();
  await page.getByRole('button', { name: 'Use this transcript' }).click();
  await expect(page.getByText('my-estimate.pdf')).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Take a photo', exact: true }).click();
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.getByRole('button', { name: 'Retake' }).click();
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.getByRole('button', { name: 'Use photo' }).click();
  await expect(page.getByText('Sample-estimate-photo.jpg')).toBeVisible();
  await expect(page.getByText('my-estimate.pdf')).toBeVisible();
});

test('unknown answers recover, changed inputs invalidate saved results', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Try a sample case' }).click();
  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await page.getByRole('button', { name: "I don't know", exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'We need this before an insured estimate',
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Answer this detail' }).click();
  await page.getByRole('button', { name: 'Sample voice answer' }).click();
  await expect(page.getByLabel('Insurer already paid in 2026')).toHaveValue(
    '500',
  );
  await page.getByRole('button', { name: 'Confirm answer' }).click();
  await page.getByRole('button', { name: 'Review confirmed details' }).click();
  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await page.getByRole('button', { name: 'Skip preview' }).click();
  await page.getByRole('button', { name: 'Edit details' }).click();
  await page
    .getByRole('button', {
      name: 'Edit insurer already paid this year',
      exact: true,
    })
    .click();
  await page
    .getByLabel('Insurer payments this year', { exact: true })
    .fill('0');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.goto('/review');
  await expect(
    page.getByRole('heading', { name: 'This estimate needs recalculation' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Review information' }).click();
  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await page.getByRole('button', { name: 'Skip preview' }).click();
  await expect(page.locator('.scenario-money').first()).toHaveText('$700');
});

test('failure retry, background completion, reminders and reset cancel local state', async ({
  page,
}) => {
  await login(page);
  await compare(page);
  await page
    .getByRole('button', { name: 'Demo controls', exact: true })
    .click();
  await page.getByRole('switch', { name: /Analysis failure/ }).check();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Edit details' }).click();
  await page
    .getByRole('button', { name: 'Edit insurer already paid this year' })
    .click();
  await page
    .getByLabel('Insurer payments this year', { exact: true })
    .fill('500');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await page.getByRole('button', { name: 'Skip preview' }).click();
  await expect(
    page.getByRole('heading', { name: "Let's try that again" }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry analysis' }).click();
  await page.getByRole('button', { name: 'Continue in background' }).click();
  await expect(
    page.getByText('Sample analysis is continuing in the background'),
  ).toBeVisible();
  await page.getByText('Your sample comparison is ready').click();
  await page
    .getByRole('button', { name: 'Review this plan', exact: true })
    .click();
  await page.getByRole('checkbox').check();
  await page
    .getByRole('button', { name: 'Save this plan', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your plan is saved' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save demo reminder' }).click();
  await expect(
    page.getByText(/Demo reminder saved for Nov 1, 2026/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remove reminder' }).click();
  await page.getByRole('link', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Reset demo', exact: true })
    .click();
  await page.getByRole('link', { name: 'My plan', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No saved plan yet' }),
  ).toBeVisible();
});

for (const width of [1440, 1280, 1024, 768, 390, 360]) {
  test(`responsive layout and core accessibility at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    const homeOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    expect(homeOverflow).toBe(false);
    await compare(page);
    await page.getByRole('radio').nth(1).check();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({
      path: `test-results/options-${width}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Sources', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Sources', exact: true }),
    ).toBeFocused();
  });
}

test('cash-only coverage has a complete quote path without insurer questions', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Try a sample case' }).click();
  await page
    .getByRole('button', { name: 'Edit insurance status', exact: true })
    .click();
  await page
    .getByLabel('Insurance status', { exact: true })
    .selectOption('self_pay');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your treatment quote' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Use sample quote: $1,500' }).click();
  await expect(page.locator('.cash-comparison')).toContainText('$1,500');
  await expect(page.locator('.cash-cell')).toHaveCount(1);
  await expect(page.getByText('Insurer already paid in 2026')).toHaveCount(0);
});

test('page accessibility, assets and visual review of the main journey', async ({
  page,
}) => {
  test.setTimeout(90000);
  async function capture(name: string) {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations, `${name} accessibility`).toEqual([]);
    await page.screenshot({
      path: `test-results/${name}-desktop.png`,
      fullPage: true,
    });
  }
  await page.goto('/login');
  await expect(page.locator('.login-art img')).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.login-art img')
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await capture('login');
  await login(page);
  await capture('home');
  await page.getByRole('button', { name: 'Try a sample case' }).click();
  await capture('facts');
  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await capture('question');
  await page.getByRole('button', { name: 'Use sample amount' }).click();
  await page.getByRole('button', { name: 'Confirm answer' }).click();
  await page.getByRole('button', { name: 'Review confirmed details' }).click();
  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await expect(
    page.getByRole('button', { name: 'Skip preview' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Skip preview' }).click();
  await page.getByRole('radio').nth(1).check();
  await page.getByRole('button', { name: 'View details' }).click();
  await capture('details');
  await page.getByRole('button', { name: 'Review this plan' }).click();
  await capture('review');
  await page.getByRole('checkbox').check();
  await page
    .getByRole('button', { name: 'Save this plan', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your plan is saved' }),
  ).toBeVisible();
  await capture('saved');
});
