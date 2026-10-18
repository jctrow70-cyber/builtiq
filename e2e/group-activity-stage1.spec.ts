import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect, test, type Page } from '@playwright/test';

type Fixture = {
  email: string;
  emails: { owner: string; manager: string; member: string; assigner: string; outsider: string };
  password: string;
  teamName: string;
  memberName: string;
};

const fixturePath = path.join(os.tmpdir(), 'biq0263-stage1-qa.json');

function loadFixture(): Fixture {
  if (!fs.existsSync(fixturePath)) {
    throw new Error('Disposable Stage 1 fixture is missing. Run the live script with --keep first.');
  }
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Fixture;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.locator('#signin-email').fill(email);
  await page.locator('#signin-password').fill(password);
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
}

async function openGroup(page: Page, teamName: string) {
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Groups' }).click();
  await expect(page.locator('.team-selector-value')).toBeVisible();
  const current = (await page.locator('.team-selector-value').innerText()).trim();
  if (current !== teamName) {
    await page.locator('.team-selector-trigger').click();
    await page.getByRole('option', { name: new RegExp(teamName) }).click();
  }
  await expect(page.locator('.team-selector-value')).toHaveText(teamName);
  await page.getByRole('tab', { name: 'Training' }).click();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('Stage 1 group extras', () => {
  test('owner sees extras and can save another activity', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const title = testInfo.project.name === 'mobile' ? 'QA mobile stretch' : 'QA desktop stretch';
    await signIn(page, fixture.emails.owner, fixture.password);
    await openGroup(page, fixture.teamName);
    await page.getByRole('button', { name: new RegExp(fixture.memberName) }).first().click();
    await expect(page.getByText('QA cardio').first()).toBeVisible();
    await expect(page.getByText('Extra', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Extra · required').first()).toBeVisible();
    await page.getByRole('button', { name: 'Add Activity' }).click();
    await page.getByRole('button', { name: 'Cardio, mobility, or other' }).click();
    const sheet = page.locator('.pd-sheet');
    await sheet.getByPlaceholder('Cardio').fill('');
    await sheet.getByRole('button', { name: 'Add activity', exact: true }).click();
    await expect(sheet.getByText('Give this activity a name.')).toBeVisible();
    await sheet.getByRole('button', { name: 'Stretch' }).click();
    await sheet.getByPlaceholder('Stretching').fill(title);
    await sheet.getByRole('button', { name: 'Add activity', exact: true }).click();
    await expect(page.getByText(title).first()).toBeVisible();
    await expect(page.getByText('Extra', { exact: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const saveButton = page.getByRole('button', { name: 'Add Activity' });
    await saveButton.scrollIntoViewIfNeeded();
    await expect(saveButton).toBeVisible();
  });

  test('ordinary member can add an optional extra and cannot mark it required', async ({ page }) => {
    const fixture = loadFixture();
    await signIn(page, fixture.emails.member, fixture.password);
    await openGroup(page, fixture.teamName);
    await page.getByRole('button', { name: /QA member/ }).first().click();
    await page.getByRole('button', { name: 'Add Activity' }).click();
    await expect(page.getByText('Required. Program missed totals stay the same.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cardio, mobility, or other' }).click();
    await expect(page.getByText('Required. This does not change program missed totals.')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test('manager can open Add Activity and see a required extra', async ({ page }) => {
    const fixture = loadFixture();
    await signIn(page, fixture.emails.manager, fixture.password);
    await openGroup(page, fixture.teamName);
    await page.getByRole('button', { name: new RegExp(fixture.memberName) }).first().click();
    await expect(page.getByText('QA cardio').first()).toBeVisible();
    await expect(page.getByText('Extra · required').first()).toBeVisible();
    await page.getByRole('button', { name: 'Add Activity' }).click();
    await expect(page.getByText('Required. Program missed totals stay the same.')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('assign-enabled member can require an extra without a team program', async ({ page }) => {
    const fixture = loadFixture();
    const assignTeam = fixture.teamName.replace('BIQ-0263 QA ', 'BIQ-0263 QA assign ');
    await signIn(page, fixture.emails.assigner, fixture.password);
    await openGroup(page, assignTeam);
    await page.getByRole('button', { name: /QA owner/ }).first().click();
    await expect(page.getByText('QA assigned sport').first()).toBeVisible();
    await expect(page.getByText('Extra · required').first()).toBeVisible();
    await page.getByRole('button', { name: 'Add Activity' }).click();
    await expect(page.getByText('Required. Program missed totals stay the same.')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('member returns to the selected group day and personal training stays separate', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    await signIn(page, fixture.emails.member, fixture.password);
    await openGroup(page, fixture.teamName);
    await page.getByRole('button', { name: /QA member/ }).first().click();
    const selected = page.locator('.member-week-cell[data-selected="true"]');
    await expect(selected).toBeVisible();
    const border = await selected.evaluate((element) => getComputedStyle(element).boxShadow);
    expect(border).not.toBe('none');
    const dayHeading = page.locator('.member-day-detail h3');
    await expect(dayHeading).toBeVisible();
    const selectedDay = (await dayHeading.innerText()).trim();
    const dayNumber = selectedDay.match(/(\d+)\s*$/)?.[1] || '';
    await page.screenshot({ path: `test-results/biq0263-ux/${testInfo.project.name}-calendar.png`, fullPage: true });
    await page.locator('.member-day-detail').getByRole('button', { name: /Due today/ }).click();
    await page.getByRole('button', { name: 'Log this workout' }).click();
    await expect(page.getByTestId('group-log-date')).toContainText(`Scheduled`);
    await expect(page.getByTestId('group-log-date')).toContainText(`/${dayNumber.padStart(2, '0')}/`);
    await page.screenshot({ path: `test-results/biq0263-ux/${testInfo.project.name}-logger.png`, fullPage: true });
    await page.getByRole('button', { name: 'Back to calendar' }).click();
    await expect(page.locator('.team-selector-value')).toHaveText(fixture.teamName);
    await expect(dayHeading).toHaveText(selectedDay);
    await expect(page.getByText(/BIQ-0263 QA program/)).toBeVisible();
    await page.screenshot({ path: `test-results/biq0263-ux/${testInfo.project.name}-returned.png`, fullPage: true });
    await page.locator('.member-profile-toolbar').getByRole('button', { name: 'Members' }).click();
    await page.getByRole('tablist', { name: 'Training view' }).getByRole('button', { name: 'Calendar' }).click();
    const groupDay = page.locator('.group-calendar-day.is-selected, .group-calendar-day-strip [data-selected="true"]').locator('visible=true');
    await expect(groupDay.first()).toBeVisible();
    await page.screenshot({ path: `test-results/biq0263-ux/${testInfo.project.name}-group-calendar.png`, fullPage: false });
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Training' }).click();
    await expect(page.getByRole('heading', { name: 'Training' })).toBeVisible();
    await expect(page.getByTestId('group-log-date')).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Groups' }).click();
    await page.getByRole('tab', { name: 'Progress' }).click();
    await expect(page.getByRole('heading', { name: 'Scheduled training' })).toBeVisible();
    await expect(page.getByText('Log completed strength sets in Training')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `test-results/biq0263-ux/${testInfo.project.name}-progress.png`, fullPage: true });
  });

  test('nonmember does not see the disposable group', async ({ page }) => {
    const fixture = loadFixture();
    await signIn(page, fixture.emails.outsider, fixture.password);
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Groups' }).click();
    await expect(page.getByRole('button', { name: 'Create Group' })).toBeVisible();
    await expect(page.getByText(fixture.teamName)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
