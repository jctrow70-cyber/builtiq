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
  const saved = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Fixture & {
    projects?: { desktop?: Fixture; mobile?: Fixture };
  };
  const project = test.info().project.name === 'mobile' ? 'mobile' : 'desktop';
  const fixture = saved.projects?.[project] || (saved.emails ? saved : null);
  if (!fixture?.emails) throw new Error(`Disposable ${project} fixture is missing. Run the live script with --keep first.`);
  return fixture;
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
  await expect(page.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.group-calendar')).toBeVisible();
  await expect(page.getByText('Loading the week…')).toHaveCount(0);
}

async function openListedMember(page: Page, name: string | RegExp) {
  await page.getByRole('tablist', { name: 'Training view' }).getByRole('button', { name: 'Members', exact: true }).click();
  await page.getByRole('button', { name: name }).first().click();
}

function todayParts() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
  return { weekday, display: `${month}/${day}/${year}`, dayNumber: String(now.getDate()) };
}

async function expectTodaySelected(page: Page) {
  const today = todayParts();
  const desktop = page.locator('.group-calendar-board').getByRole('button', { name: `${today.weekday} ${today.display}`, pressed: true });
  if ((await desktop.count()) > 0 && (await desktop.isVisible())) {
    await expect(desktop).toBeVisible();
    return;
  }
  const mobile = page.locator('.group-calendar-day-strip').getByRole('button', { name: new RegExp(`^${today.weekday}\\s*${today.dayNumber}$`) });
  await expect(mobile).toHaveAttribute('data-selected', 'true');
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('Stage 1 group extras', () => {
  test('groups open on the selected calendar', async ({ page }) => {
    const fixture = loadFixture();
    const assignTeam = fixture.teamName.replace('BIQ-0263 QA ', 'BIQ-0263 QA assign ');
    await signIn(page, fixture.emails.owner, fixture.password);
    await openGroup(page, fixture.teamName);
    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Training' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Members' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Progress' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Programs' })).toBeVisible();
    await expect(page.getByTestId('group-calendar-summary')).toHaveText(/\d+ members · \d+ scheduled · \d+ completed/);
    await expect(page.getByRole('button', { name: 'Assign Training' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Add Activity' })).toBeVisible();
    await expectTodaySelected(page);
    await expectNoHorizontalOverflow(page);

    await page.getByRole('tab', { name: 'Members' }).click();
    await expect(page.locator('.team-selector-value')).toHaveText(fixture.teamName);
    await page.getByRole('tab', { name: 'Programs' }).click();
    await expect(page.getByRole('heading', { name: 'Program library' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign Training' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Calendar' }).click();
    await expect(page.locator('.group-calendar')).toBeVisible();
    await expect(page.locator('.team-selector-value')).toHaveText(fixture.teamName);

    await page.locator('.team-selector-trigger').click();
    await page.getByRole('option', { name: new RegExp(assignTeam) }).click();
    await expect(page.locator('.team-selector-value')).toHaveText(assignTeam);
    await expect(page.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.group-calendar')).toBeVisible();
    await expect(page.getByText('Loading the week…')).toHaveCount(0);
    await expectTodaySelected(page);
    await expect(page.getByTestId('group-calendar-summary')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('owner sees extras and can save another activity', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const title = testInfo.project.name === 'mobile' ? 'QA mobile stretch' : 'QA desktop stretch';
    await signIn(page, fixture.emails.owner, fixture.password);
    await openGroup(page, fixture.teamName);
    await openListedMember(page, new RegExp(fixture.memberName));
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

  test('owner can repeat an activity every week', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const title = testInfo.project.name === 'mobile' ? 'QA mobile weekly' : 'QA desktop weekly';
    await signIn(page, fixture.emails.owner, fixture.password);
    await openGroup(page, fixture.teamName);
    await openListedMember(page, new RegExp(fixture.memberName));
    await page.getByRole('button', { name: 'Add Activity' }).click();
    await page.getByRole('button', { name: 'Cardio, mobility, or other' }).click();
    const sheet = page.locator('.pd-sheet');
    await sheet.getByRole('button', { name: 'Cardio' }).click();
    await sheet.getByPlaceholder('Cardio').fill(title);
    await sheet.getByRole('radio', { name: 'Every week' }).check();
    await sheet.getByRole('button', { name: 'Add activity', exact: true }).click();
    await expect(page.getByText(title).first()).toBeVisible();
    await page.getByRole('button', { name: 'Next week' }).click();
    await expect(page.getByText(title).first()).toBeVisible();
    await expect(page.getByText('Scheduled').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('ordinary member can add an optional extra and cannot mark it required', async ({ page }) => {
    const fixture = loadFixture();
    await signIn(page, fixture.emails.member, fixture.password);
    await openGroup(page, fixture.teamName);
    await expect(page.getByRole('tab', { name: 'Programs' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Assign Training' })).toHaveCount(0);
    await openListedMember(page, /QA member/);
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
    await expect(page.getByRole('tab', { name: 'Programs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign Training' })).toBeVisible();
    await openListedMember(page, new RegExp(fixture.memberName));
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
    await expect(page.getByRole('tab', { name: 'Programs' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Assign Training' })).toBeVisible();
    await openListedMember(page, /QA owner/);
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
    await openListedMember(page, /QA member/);
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
    await expect(page.getByText('Custom group plan')).toHaveCount(0);
    await expect(page.locator('.team-selector-value')).toHaveText(fixture.teamName);
    await expect(page.getByRole('button', { name: /QA member/ }).first()).toBeVisible();
    await expect(dayHeading).toHaveText(selectedDay);
    await expect(page.locator('.member-day-detail').getByRole('button', { name: /Due today/ })).toBeVisible();
    await expect(page.locator('[data-plan-state="loading"], [data-plan-state="ready"]')).toBeVisible();
    await expect(page.getByText(/BIQ-0263 QA program/)).toBeVisible();
    await expect(page.getByText('Custom group plan')).toHaveCount(0);
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
