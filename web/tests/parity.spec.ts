import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function login(page: Page) {
  await page.goto('/login');
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
  await page.getByRole('button', { name: 'Skip preview' }).click();
  await expect(page.locator('.scenario-money').first()).toHaveText('$1,200');
}
async function save(page: Page) {
  await page
    .getByRole('button', { name: 'Review this plan', exact: true })
    .click();
  await page
    .getByRole('checkbox', {
      name: 'Save this fictional plan and my answers in this browser.',
    })
    .check();
  await page
    .getByRole('button', { name: 'Save this plan', exact: true })
    .click();
}

test('manual treatment, actual engine amounts, baseline next step and multiple resumable cases', async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole('button', { name: 'Enter procedures and coverage manually' })
    .click();
  await page
    .getByLabel('Insurance status', { exact: true })
    .selectOption('insured');
  await page.getByLabel('Procedure 1 name', { exact: true }).fill('Repair');
  await page
    .getByLabel('Procedure 1 type', { exact: true })
    .selectOption('basic');
  await page
    .getByLabel('Repair · Dentist’s charge', { exact: true })
    .fill('250');
  await page
    .getByLabel('Repair · Plan’s allowed amount', { exact: true })
    .fill('200');
  await page
    .getByLabel('Repair · Dentist writes off', { exact: true })
    .fill('50');
  await page
    .getByLabel('Repair · Provider network', { exact: true })
    .selectOption('in');
  await page
    .getByLabel('Repair · Planned date', { exact: true })
    .fill('2026-11-10');
  await page.getByRole('button', { name: 'Add another procedure' }).click();
  await page.getByLabel('Procedure 2 name', { exact: true }).fill('Extra');
  await page.getByRole('button', { name: 'Remove Extra', exact: true }).click();
  await page
    .getByLabel('basic services · Plan pays', { exact: true })
    .fill('80');
  await page
    .getByLabel('basic services · Deductible applies', { exact: true })
    .selectOption('true');
  await page
    .getByLabel('basic services · Annual maximum applies', { exact: true })
    .selectOption('true');
  await page
    .getByLabel('New benefit year start', { exact: true })
    .fill('2026-01-01');
  await page
    .getByRole('button', { name: 'Add benefit year', exact: true })
    .click();
  await page
    .getByLabel('py-2026-01-01 · Annual insurer maximum', { exact: true })
    .fill('800');
  await page
    .getByLabel('py-2026-01-01 · Annual deductible', { exact: true })
    .fill('50');
  await page
    .getByLabel('py-2026-01-01 · Insurer already paid', { exact: true })
    .fill('0');
  await page
    .getByLabel('py-2026-01-01 · Deductible already met', { exact: true })
    .fill('0');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Continue to review' }).click();
  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Do you have the estimate from your dentist?',
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: "I don't have it", exact: true })
    .click();
  await page.getByRole('button', { name: 'Review confirmed details' }).click();
  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await page.getByRole('button', { name: 'Skip preview' }).click();
  await expect(
    page.getByRole('heading', { name: 'Repair', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.scenario-money')).toHaveText('$80');
  await save(page);
  await expect(
    page.getByRole('heading', { name: 'Your plan is saved' }),
  ).toBeVisible();
  await expect(page.locator('blockquote')).toContainText('quoted fee');
  await expect(page.locator('blockquote')).not.toContainText('January');
  await page.getByRole('button', { name: 'Back to Home', exact: true }).click();
  await page.getByRole('button', { name: 'Try a sample case' }).click();
  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  await expect(page.locator('.case-history-card')).toHaveCount(2);
  await page
    .locator('.case-history-card')
    .filter({ has: page.getByRole('heading', { name: 'Repair', exact: true }) })
    .getByRole('button', { name: 'Resume case' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'The details behind your plan' }),
  ).toBeVisible();
  await expect(page.locator('.plan-summary')).toContainText('$80');
  await page.reload();
  await expect(page.locator('.plan-summary')).toContainText('$80');
  await page.getByRole('button', { name: 'All sources' }).click();
  await expect(page.getByRole('dialog')).toContainText('Repair');
  await expect(page.getByRole('dialog')).not.toContainText(
    "Jordan's treatment estimate",
  );
});

test('network and coverage edits update labels and totals; individual quotes enforce scope', async ({
  page,
}) => {
  await login(page);
  await compare(page);
  await page.getByRole('button', { name: 'Edit details' }).click();
  await page
    .getByRole('button', { name: 'Edit provider network', exact: true })
    .click();
  await page
    .getByLabel('Provider network', { exact: true })
    .selectOption('out');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('button', { name: 'Edit coverage rules' }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('basic services · Plan pays', { exact: true })
    .fill('70');
  await dialog
    .getByLabel('py-2026 · Deductible already met', { exact: true })
    .fill('50');
  await dialog
    .getByLabel('py-2027 · Annual insurer maximum', { exact: true })
    .fill('900');
  await dialog
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await page.getByRole('button', { name: 'Skip preview' }).click();
  await expect(page.locator('.scenario-card').first()).toContainText(
    'Out of network',
  );
  await expect(page.locator('.scenario-card').first()).not.toContainText(
    'Covered, in network',
  );
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Provided by you');
  await expect(page.getByRole('dialog')).toContainText('70%');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Self-pay', exact: true }).click();
  await page
    .getByRole('button', { name: 'Enter individual cash prices' })
    .click();
  await page
    .getByLabel('Filling one · cash price', { exact: true })
    .fill('100');
  await page
    .getByLabel('Filling two · cash price', { exact: true })
    .fill('100');
  await page.getByRole('button', { name: 'Save individual quotes' }).click();
  await expect(
    page.getByText('Confirm that each quote covers the same service.'),
  ).toBeVisible();
  await page
    .getByRole('checkbox', {
      name: 'Each quote covers the same service as the treatment estimate.',
    })
    .check();
  await page.getByRole('button', { name: 'Save individual quotes' }).click();
  await expect(
    page.getByText(/Enter a written price for every procedure/),
  ).toBeVisible();
  await page.getByLabel('Crown · cash price', { exact: true }).fill('700');
  await page.getByRole('button', { name: 'Save individual quotes' }).click();
  await expect(page.locator('.cash-comparison')).toContainText('$900');
  await expect(
    page.getByText('Individual prices · Scope confirmed by you'),
  ).toBeVisible();
});

test('voice answers require explicit acceptance, save recovery preserves selection and history', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Try a sample case' }).click();
  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await page.getByRole('button', { name: 'Sample voice answer' }).click();
  await expect(page.getByText('We heard (sample)')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Confirm answer' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(
    page.getByLabel('Insurer already paid in 2026', { exact: true }),
  ).toHaveValue('');
  await page.getByRole('button', { name: 'Sample voice answer' }).click();
  await page.getByRole('button', { name: 'Yes, use $500' }).click();
  await page.getByRole('button', { name: 'Confirm answer' }).click();
  await page.getByRole('button', { name: 'Review confirmed details' }).click();
  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await page.getByRole('button', { name: 'Skip preview' }).click();
  await page.getByRole('radio', { name: /Split across benefit years/ }).check();
  await page
    .getByRole('button', { name: 'Demo controls', exact: true })
    .click();
  await page.getByRole('switch', { name: /Save failure/ }).check();
  await page.keyboard.press('Escape');
  await save(page);
  await expect(
    page.getByRole('heading', {
      name: 'We couldn’t confirm your plan was saved',
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Try saving again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your plan is saved' }),
  ).toBeVisible();
  await expect(page.locator('blockquote')).toContainText('Jan 10, 2027');
  await expect(
    page.locator('.history-list').getByText('Plan saved', { exact: true }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: /Show .* routine entries/ }).click();
  await expect(
    page
      .locator('.history-list')
      .getByText('Details confirmed', { exact: true }),
  ).toBeVisible();
});

test('date, conflicting deductible and missing-document questions are navigable', async ({
  page,
}) => {
  await login(page);
  await compare(page);
  await page
    .getByRole('button', { name: 'Demo controls', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Show conflicting deductible details' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'How much of your deductible is left?' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Deductible already met', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm answer' }).click();
  await page.getByRole('button', { name: 'Review confirmed details' }).click();
  await page.getByRole('button', { name: 'Confirm and compare' }).click();
  await page.getByRole('button', { name: 'Skip preview' }).click();
  await expect(page.locator('.scenario-money').last()).toHaveText('$725');
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('actionbridge.web.demo.v1')!).data.input
          .planYears['py-2026'].deductibleAlreadyMetCents,
    ),
  ).toBe(5000);
  await page
    .getByRole('button', { name: 'Demo controls', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Show missing-document question' })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Do you have the estimate from your dentist?',
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: "I don't have it", exact: true })
    .click();
  await page.getByRole('button', { name: 'Review confirmed details' }).click();
  await page
    .getByRole('button', { name: 'Demo controls', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Show benefit-year date question' })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'When does your plan’s benefit year start?',
    }),
  ).toBeVisible();
  await page
    .getByLabel('Benefit year start date', { exact: true })
    .fill('2026-07-01');
  await page.getByRole('button', { name: 'Confirm answer' }).click();
  const raw = await page.evaluate(
    () => JSON.parse(localStorage.getItem('actionbridge.web.demo.v1')!).data,
  );
  expect(raw.input.planYears['py-2026'].startDate).toBe('2026-07-01');
  expect(raw.input.planYears['py-2026'].annualMaximumCents).toBeNull();
});

test('first sign-in challenge validates passwords without persisting them', async ({
  page,
}) => {
  await page.goto('/login');
  await page
    .getByRole('button', { name: 'Preview first-sign-in password change' })
    .click();
  await page.getByLabel('New password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Set password and continue' }).click();
  await expect(page.getByText(/Use at least 12 characters/)).toBeVisible();
  await page
    .getByLabel('New password', { exact: true })
    .fill('NewDemoPassword12!');
  await page
    .getByLabel('Confirm password', { exact: true })
    .fill('NewDemoPassword12!');
  await page.getByRole('button', { name: 'Set password and continue' }).click();
  await expect(
    page.getByRole('heading', {
      name: "Let's make sense of your dental costs.",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('actionbridge.web.demo.v1')),
  ).not.toContain('NewDemoPassword12!');
});

for (const width of [1280, 390])
  test(`new forms and coverage drawer are accessible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page
      .getByRole('button', { name: 'Enter procedures and coverage manually' })
      .click();
    await page
      .getByLabel('Insurance status', { exact: true })
      .selectOption('insured');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/manual-${width}.png`,
      fullPage: true,
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample case' }).click();
    await page.getByRole('button', { name: 'Edit coverage rules' }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page
        .getByRole('dialog')
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBeTruthy();
    await page.screenshot({ path: `test-results/coverage-${width}.png` });
    await page.keyboard.press('Escape');
  });
