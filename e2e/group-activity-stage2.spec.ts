import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect, test, type Locator, type Page } from '@playwright/test';

type Fixture = {
  email: string;
  emails: { owner: string; manager: string; member: string; assigner: string; outsider: string };
  password: string;
  teamName: string;
  memberName: string;
};

const fixturePath = path.join(os.tmpdir(), 'biq0263-stage1-qa.json');
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function loadFixture(): Fixture {
  if (!fs.existsSync(fixturePath)) {
    throw new Error('Disposable Stage 1 fixture is missing. Run the live script with --keep first.');
  }
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Fixture;
}

function formatYmd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseYmd(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(ymd: string, days: number): string {
  const date = parseYmd(ymd);
  date.setDate(date.getDate() + days);
  return formatYmd(date);
}

function today(): string {
  return formatYmd(new Date());
}

function mondayOf(ymd: string): string {
  const date = parseYmd(ymd);
  const delta = date.getDay() === 0 ? -6 : 1 - date.getDay();
  return addDays(ymd, delta);
}

function weekdayShort(ymd: string): string {
  return WEEKDAYS[parseYmd(ymd).getDay()];
}

function titlePattern(title: string): RegExp {
  return new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
}

function dayDetail(page: Page): Locator {
  return page.locator('.member-day-detail');
}

function titledCards(page: Page, title: string): Locator {
  return dayDetail(page).getByRole('button', { name: titlePattern(title) });
}

async function clearAuthStorage(page: Page) {
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.includes('auth-token')) localStorage.removeItem(key);
    }
  });
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/');
  const emailField = page.locator('#signin-email');
  if (!(await emailField.isVisible())) {
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(emailField).toBeVisible();
  }
  await clearAuthStorage(page);
  await page.goto('/');
  await emailField.fill(email);
  await page.locator('#signin-password').fill(password);
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.locator('#signin-email')).toBeVisible();
  await clearAuthStorage(page);
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

async function openMember(page: Page, name: string) {
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await expect(dayDetail(page)).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function selectDay(page: Page, short: string) {
  await page.locator('.member-week-strip').getByRole('tab', { name: new RegExp(`^${short} `) }).click();
}

async function nextWeek(page: Page) {
  await page.locator('.member-week-nav').getByRole('button', { name: 'Next week' }).click();
}

async function previousWeek(page: Page) {
  await page.locator('.member-week-nav').getByRole('button', { name: 'Previous week' }).click();
}

async function expectCount(page: Page, title: string, count: number) {
  await expect(titledCards(page, title)).toHaveCount(count);
}

async function expectLabels(page: Page, title: string, status: 'Scheduled' | 'Completed' | 'Skipped', required = false) {
  const card = titledCards(page, title);
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(status);
  await expect(card).toContainText(required ? 'Extra · required' : 'Extra');
  if (!required) await expect(card).not.toContainText('Extra · required');
}

async function addCardio(
  page: Page,
  title: string,
  options: { mode?: 'none' | 'week' | 'custom'; weekdays?: string[]; until?: string; required?: boolean; date?: string } = {}
) {
  await page.getByRole('button', { name: 'Add Activity' }).click();
  const editor = page.locator('.member-schedule-editor');
  if (options.date) await editor.getByLabel('Date').fill(options.date);
  await page.getByRole('button', { name: 'Cardio, mobility, or other' }).click();
  const sheet = page.locator('.pd-sheet');
  await sheet.getByRole('button', { name: 'Cardio' }).click();
  await sheet.getByPlaceholder('Cardio').fill(title);
  if (options.mode === 'week') await sheet.getByRole('radio', { name: 'Every week' }).check();
  if (options.mode === 'custom') {
    await sheet.getByRole('radio', { name: 'Custom weekdays' }).check();
    for (const day of options.weekdays || []) {
      await sheet.getByRole('checkbox', { name: day, exact: true }).check();
    }
  }
  if (options.until) await sheet.getByLabel('End date (optional)').fill(options.until);
  if (options.required) await sheet.getByRole('checkbox', { name: /Required/ }).check();
  await sheet.getByRole('button', { name: 'Add activity', exact: true }).click();
  await expect(sheet).toBeHidden();
}

async function openCard(page: Page, title: string) {
  const card = titledCards(page, title);
  await expect(card).toHaveCount(1);
  if ((await card.getAttribute('aria-expanded')) !== 'true') await card.click();
  return dayDetail(page).locator('.member-day-workout').filter({ hasText: title });
}

test.describe('Stage 2 recurring group extras', () => {
  test('owner can repeat an activity on custom weekdays', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const tag = testInfo.project.name === 'mobile' ? 'mobile' : 'desktop';
    const title = `QA ${tag} custom ${Date.now().toString().slice(-6)}`;
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const startLabel = weekdayShort(today());
    const startIndex = labels.indexOf(startLabel);
    const extra = labels[startIndex + 1] || 'Wed';
    const activityDate = startIndex === labels.length - 1 ? mondayOf(today()) : undefined;
    const shown = activityDate ? 'Mon' : startLabel;
    const off = labels.find((label) => label !== shown && label !== extra) || 'Tue';
    await signIn(page, fixture.emails.owner, fixture.password);
    await openGroup(page, fixture.teamName);
    await openMember(page, fixture.memberName);
    await expect(dayDetail(page).getByRole('button', { name: /Due today/ })).toBeVisible();
    await addCardio(page, title, { mode: 'custom', weekdays: [extra], date: activityDate });
    await selectDay(page, shown);
    await expectLabels(page, title, 'Scheduled');
    await selectDay(page, off);
    await expectCount(page, title, 0);
    await selectDay(page, extra);
    await expectLabels(page, title, 'Scheduled');
    await nextWeek(page);
    await expectLabels(page, title, 'Scheduled');
    await selectDay(page, off);
    await expectCount(page, title, 0);
    await selectDay(page, shown);
    await expectLabels(page, title, 'Scheduled');
    await page.locator('.member-profile-toolbar').getByRole('button', { name: 'Members' }).click();
    await page.getByRole('tablist', { name: 'Training view' }).getByRole('button', { name: 'Calendar' }).click();
    await expect(page.locator('.group-calendar')).toBeVisible();
    await page.locator('.group-calendar-filters').getByLabel('Member').selectOption({ label: fixture.memberName });
    const strip = page.locator('.group-calendar-day-strip');
    if (await strip.isVisible()) {
      await strip.getByRole('button', { name: new RegExp(`^${shown}\\b`) }).click();
    }
    const column = page.locator('.group-calendar-day').locator('visible=true').filter({ hasText: new RegExp(`^${shown}`) });
    await expect(column).toHaveCount(1);
    const more = column.getByRole('button', { name: /\+\d+ more/ });
    if (await more.isVisible()) await more.click();
    const cards = column.locator('.group-calendar-card').filter({ hasText: title });
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText('Scheduled');
    await expect(cards).toContainText('Extra');
    await expect(cards).not.toContainText('Extra · required');
    await page.locator('.group-calendar-nav').getByRole('button', { name: 'Next week' }).click();
    await page.locator('.group-calendar-nav').getByRole('button', { name: 'Previous week' }).click();
    await expectNoHorizontalOverflow(page);
  });

  test('an end date hides later occurrences', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const tag = testInfo.project.name === 'mobile' ? 'mobile' : 'desktop';
    const title = `QA ${tag} until ${Date.now().toString().slice(-6)}`;
    const start = today();
    await signIn(page, fixture.emails.owner, fixture.password);
    await openGroup(page, fixture.teamName);
    await openMember(page, fixture.memberName);
    await addCardio(page, title, { mode: 'week', until: start });
    await expectLabels(page, title, 'Scheduled');
    await nextWeek(page);
    await expectCount(page, title, 0);
    await nextWeek(page);
    await expectCount(page, title, 0);
    await previousWeek(page);
    await previousWeek(page);
    await expectLabels(page, title, 'Scheduled');
    await expectNoHorizontalOverflow(page);
  });

  test('editing this occurrence leaves other dates unchanged', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const tag = testInfo.project.name === 'mobile' ? 'mobile' : 'desktop';
    const stamp = Date.now().toString().slice(-6);
    const title = `QA ${tag} only ${stamp}`;
    const renamed = `QA ${tag} renamed ${stamp}`;
    await signIn(page, fixture.emails.owner, fixture.password);
    await openGroup(page, fixture.teamName);
    await openMember(page, fixture.memberName);
    await addCardio(page, title, { mode: 'week' });
    const card = await openCard(page, title);
    await card.getByRole('button', { name: 'This occurrence', exact: true }).click();
    await card.getByLabel('Name').fill(renamed);
    await card.getByRole('button', { name: 'Save this occurrence' }).click();
    await expectLabels(page, renamed, 'Scheduled');
    await expectCount(page, title, 0);
    await nextWeek(page);
    await expectLabels(page, title, 'Scheduled');
    await expectCount(page, renamed, 0);
    await previousWeek(page);
    await expectLabels(page, renamed, 'Scheduled');
    await expectNoHorizontalOverflow(page);
  });

  test('editing this and future leaves earlier dates unchanged', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const tag = testInfo.project.name === 'mobile' ? 'mobile' : 'desktop';
    const stamp = Date.now().toString().slice(-6);
    const title = `QA ${tag} before ${stamp}`;
    const renamed = `QA ${tag} after ${stamp}`;
    await signIn(page, fixture.emails.owner, fixture.password);
    await openGroup(page, fixture.teamName);
    await openMember(page, fixture.memberName);
    await addCardio(page, title, { mode: 'week' });
    await nextWeek(page);
    const card = await openCard(page, title);
    await card.getByRole('button', { name: 'This and future', exact: true }).click();
    await card.getByLabel('Name').fill(renamed);
    await card.getByRole('button', { name: 'Save this and future' }).click();
    await expectLabels(page, renamed, 'Scheduled');
    await expectCount(page, title, 0);
    await nextWeek(page);
    await expectLabels(page, renamed, 'Scheduled');
    await expectCount(page, title, 0);
    await previousWeek(page);
    await previousWeek(page);
    await expectLabels(page, title, 'Scheduled');
    await expectCount(page, renamed, 0);
    await expectNoHorizontalOverflow(page);
  });

  test('editing the entire series updates every date', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const tag = testInfo.project.name === 'mobile' ? 'mobile' : 'desktop';
    const stamp = Date.now().toString().slice(-6);
    const title = `QA ${tag} series ${stamp}`;
    const renamed = `QA ${tag} all ${stamp}`;
    await signIn(page, fixture.emails.owner, fixture.password);
    await openGroup(page, fixture.teamName);
    await openMember(page, fixture.memberName);
    await addCardio(page, title, { mode: 'week' });
    const card = await openCard(page, title);
    await card.getByRole('button', { name: 'Entire series', exact: true }).click();
    await card.getByLabel('Name').fill(renamed);
    await card.getByRole('button', { name: 'Save entire series' }).click();
    await expectLabels(page, renamed, 'Scheduled');
    await expectCount(page, title, 0);
    await nextWeek(page);
    await expectLabels(page, renamed, 'Scheduled');
    await expectCount(page, title, 0);
    await previousWeek(page);
    await expectCount(page, renamed, 1);
    await expectNoHorizontalOverflow(page);
  });

  test('skip and restore keep a single scheduled card', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const tag = testInfo.project.name === 'mobile' ? 'mobile' : 'desktop';
    const title = `QA ${tag} skip ${Date.now().toString().slice(-6)}`;
    await signIn(page, fixture.emails.owner, fixture.password);
    await openGroup(page, fixture.teamName);
    await openMember(page, fixture.memberName);
    await addCardio(page, title);
    const card = await openCard(page, title);
    await card.getByRole('button', { name: 'Skip', exact: true }).click();
    await expectLabels(page, title, 'Skipped');
    const skipped = await openCard(page, title);
    await skipped.getByRole('button', { name: 'Restore', exact: true }).click();
    await expectLabels(page, title, 'Scheduled');
    await expectCount(page, title, 1);
    await expectNoHorizontalOverflow(page);
  });

  test('a completed occurrence stays completed', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const tag = testInfo.project.name === 'mobile' ? 'mobile' : 'desktop';
    const title = `QA ${tag} done ${Date.now().toString().slice(-6)}`;
    await signIn(page, fixture.emails.owner, fixture.password);
    await openGroup(page, fixture.teamName);
    await openMember(page, fixture.memberName);
    await addCardio(page, title);
    const card = await openCard(page, title);
    await card.getByRole('button', { name: 'Mark complete', exact: true }).click();
    await expectLabels(page, title, 'Completed');
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await openGroup(page, fixture.teamName);
    await openMember(page, fixture.memberName);
    await expectLabels(page, title, 'Completed');
    const finished = await openCard(page, title);
    await expect(finished.getByRole('button', { name: 'Mark complete', exact: true })).toHaveCount(0);
    await expect(finished.getByRole('button', { name: 'Skip', exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test('ending a series keeps history and drops future dates', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const tag = testInfo.project.name === 'mobile' ? 'mobile' : 'desktop';
    const title = `QA ${tag} end ${Date.now().toString().slice(-6)}`;
    await signIn(page, fixture.emails.owner, fixture.password);
    await openGroup(page, fixture.teamName);
    await openMember(page, fixture.memberName);
    await addCardio(page, title, { mode: 'week' });
    const card = await openCard(page, title);
    await card.getByRole('button', { name: 'Mark complete', exact: true }).click();
    await expectLabels(page, title, 'Completed');
    const finished = await openCard(page, title);
    await finished.getByRole('button', { name: 'End series', exact: true }).click();
    await finished.locator('form').getByRole('button', { name: 'End series', exact: true }).click();
    await expectLabels(page, title, 'Completed');
    await nextWeek(page);
    await expectCount(page, title, 0);
    await previousWeek(page);
    await expectLabels(page, title, 'Completed');
    await expectCount(page, title, 1);
    await expectNoHorizontalOverflow(page);
  });

  test('moving an occurrence shows it only on the new date', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const tag = testInfo.project.name === 'mobile' ? 'mobile' : 'desktop';
    const title = `QA ${tag} move ${Date.now().toString().slice(-6)}`;
    const start = today();
    const moved = addDays(start, 1);
    const startShort = weekdayShort(start);
    const movedShort = weekdayShort(moved);
    await signIn(page, fixture.emails.owner, fixture.password);
    await openGroup(page, fixture.teamName);
    await openMember(page, fixture.memberName);
    await addCardio(page, title, { mode: 'week' });
    const card = await openCard(page, title);
    await card.getByRole('button', { name: 'This occurrence', exact: true }).click();
    await card.getByLabel('Date').fill(moved);
    await card.getByRole('button', { name: 'Save this occurrence' }).click();
    await expectCount(page, title, 0);
    if (mondayOf(start) === mondayOf(moved)) {
      await selectDay(page, movedShort);
      await expectLabels(page, title, 'Scheduled');
      await nextWeek(page);
      await expectCount(page, title, 0);
      await selectDay(page, startShort);
      await expectLabels(page, title, 'Scheduled');
    } else {
      await nextWeek(page);
      await expectLabels(page, title, 'Scheduled');
      await selectDay(page, movedShort);
      await expectLabels(page, title, 'Scheduled');
    }
    await expectCount(page, title, 1);
    await expectNoHorizontalOverflow(page);
  });

  test('roles can change only the extras they are allowed to change', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const fixture = loadFixture();
    const tag = testInfo.project.name === 'mobile' ? 'mobile' : 'desktop';
    const title = `QA ${tag} manager ${Date.now().toString().slice(-6)}`;
    const assignTeam = fixture.teamName.replace('BIQ-0263 QA ', 'BIQ-0263 QA assign ');

    await signIn(page, fixture.emails.owner, fixture.password);
    await openGroup(page, fixture.teamName);
    await openMember(page, 'QA manager');
    await addCardio(page, title, { required: true });
    await expectLabels(page, title, 'Scheduled', true);
    const ownerCard = await openCard(page, title);
    await expect(ownerCard.getByRole('button', { name: 'This occurrence', exact: true })).toBeVisible();
    await expect(ownerCard.getByRole('button', { name: 'Skip', exact: true })).toBeVisible();
    await signOut(page);

    await signIn(page, fixture.emails.manager, fixture.password);
    await openGroup(page, fixture.teamName);
    await openMember(page, 'QA manager');
    await expectLabels(page, title, 'Scheduled', true);
    const managerCard = await openCard(page, title);
    await expect(managerCard.getByRole('button', { name: 'This occurrence', exact: true })).toBeVisible();
    await signOut(page);

    await signIn(page, fixture.emails.member, fixture.password);
    await openGroup(page, fixture.teamName);
    await expect(page.getByRole('button', { name: /QA manager/ })).toHaveCount(0);
    await expect(page.getByText(title)).toHaveCount(0);
    await openMember(page, fixture.memberName);
    await expectLabels(page, 'QA required mobility', 'Scheduled', true);
    const ownRequired = await openCard(page, 'QA required mobility');
    await expect(ownRequired.getByRole('button', { name: 'Mark complete', exact: true })).toBeVisible();
    await expect(ownRequired.getByRole('button', { name: 'Skip', exact: true })).toHaveCount(0);
    await expect(ownRequired.getByRole('button', { name: 'This occurrence', exact: true })).toHaveCount(0);
    await expect(ownRequired.getByRole('button', { name: 'This and future', exact: true })).toHaveCount(0);
    await expect(ownRequired.getByRole('button', { name: 'Entire series', exact: true })).toHaveCount(0);
    await signOut(page);

    await signIn(page, fixture.emails.assigner, fixture.password);
    await openGroup(page, assignTeam);
    await openMember(page, 'QA owner');
    await expectLabels(page, 'QA assigned sport', 'Scheduled', true);
    const assignerCard = await openCard(page, 'QA assigned sport');
    await expect(assignerCard.getByRole('button', { name: 'This occurrence', exact: true })).toBeVisible();
    await signOut(page);

    await signIn(page, fixture.emails.outsider, fixture.password);
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Groups' }).click();
    await expect(page.getByRole('button', { name: 'Create Group' })).toBeVisible();
    await expect(page.getByText(fixture.teamName)).toHaveCount(0);
    await expect(page.getByText(title)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
