import fs from 'fs';
import os from 'os';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page } from '@playwright/test';

type Fixture = {
  email: string;
  emails: { owner: string; manager: string; member: string; assigner: string; outsider: string };
  password: string;
  teamName: string;
  teamIds: string[];
  memberName: string;
};

const fixturePath = path.join(os.tmpdir(), 'biq0263-stage1-qa.json');
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function loadFixture(): Fixture {
  if (!fs.existsSync(fixturePath)) {
    throw new Error('Disposable Stage 1 fixture is missing. Run the live script with --keep first.');
  }
  const saved = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Fixture & {
    projects?: { desktop?: Fixture; mobile?: Fixture };
  };
  const project = test.info().project.name === 'mobile' ? 'mobile' : 'desktop';
  const fixture = saved.projects?.[project] || (saved.teamIds ? saved : null);
  if (!fixture?.teamIds?.length) throw new Error(`Disposable ${project} fixture is missing. Run the live script with --keep first.`);
  return fixture;
}

function loadPublicEnv() {
  const file = path.join(process.cwd(), '.env.local');
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL || '',
    anon: env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    service: env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

const resetProjects = new Set<string>();

/** Deletes series for this project only. The other browser project keeps its own teams. */
async function resetFixtureSeries() {
  const fixture = loadFixture();
  const env = loadPublicEnv();
  if (!env.url || !env.service || fixture.teamIds.length === 0) {
    throw new Error('Disposable fixture teams could not be reset.');
  }
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.from('st_group_activity_series').delete().in('team_id', fixture.teamIds);
  if (error) throw new Error(error.message);
}

function tagOf(project: string) {
  return project === 'mobile' ? 'mobile' : 'desktop';
}

function weekdayShort(date = new Date()) {
  return WEEKDAYS[date.getDay()];
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
  const account = page.getByRole('button', { name: 'Account menu' });
  await expect(emailField.or(account)).toBeVisible();
  if (!(await emailField.isVisible())) {
    await account.click();
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

async function expectTodaySelected(page: Page) {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
  const desktop = page.locator('.group-calendar-board').getByRole('button', { name: `${weekday} ${month}/${day}/${year}`, pressed: true });
  if ((await desktop.count()) > 0 && (await desktop.isVisible())) {
    await expect(desktop).toBeVisible();
    return;
  }
  const mobile = page.locator('.group-calendar-day-strip').getByRole('button', { name: new RegExp(`^${weekday}\\s*${Number(day)}$`) });
  await expect(mobile).toHaveAttribute('data-selected', 'true');
}

async function openCalendar(page: Page, teamName: string) {
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Groups' }).click();
  await expect(page.locator('.team-selector-value')).toBeVisible();
  const current = (await page.locator('.team-selector-value').innerText()).trim();
  if (current !== teamName) {
    await page.locator('.team-selector-trigger').click();
    await page.getByRole('option', { name: new RegExp(teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
  }
  await expect(page.locator('.team-selector-value')).toHaveText(teamName);
  await expect(page.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.group-calendar')).toBeVisible();
  await expect(page.getByText('Loading the week…')).toHaveCount(0);
  await expectTodaySelected(page);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function selectCalendarDay(page: Page, short: string) {
  const name = new RegExp(`^${short}`);
  const button = page.locator('.group-calendar-day-strip, .group-calendar-board').getByRole('button', { name }).locator('visible=true');
  await button.click();
}

function dayColumn(page: Page, short: string): Locator {
  return page.locator('.group-calendar-day').locator('visible=true').filter({
    has: page.getByRole('button', { name: new RegExp(`^${short}`) }),
  });
}

async function expectCards(page: Page, short: string, title: string, count: number) {
  const column = dayColumn(page, short);
  await expect(column).toHaveCount(1);
  const more = column.getByRole('button', { name: /\+\d+ more/ });
  if (await more.count()) await more.click();
  await expect(column.locator('.group-calendar-card').filter({ hasText: title })).toHaveCount(count);
}

async function accessToken(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.includes('auth-token'));
    if (!key) return '';
    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
    return parsed.access_token || parsed.currentSession?.access_token || '';
  });
}

async function restGet(page: Page, query: string) {
  const env = loadPublicEnv();
  const token = await accessToken(page);
  const response = await page.request.get(`${env.url}/rest/v1/${query}`, {
    headers: { apikey: env.anon, Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function pickCatalogExercise(page: Page, queries: string[], avoid: string[] = []) {
  const panel = page.locator('.add-exercise-panel');
  const search = panel.getByPlaceholder(/Search exercises/);
  await expect(search).toBeVisible();
  await expect(search).not.toHaveAttribute('placeholder', / \(0 available\)/, { timeout: 45_000 });
  for (const query of queries) {
    await search.fill(query);
    const items = panel.locator('.catalog-search-item');
    const count = await items.count();
    for (let index = 0; index < count; index += 1) {
      const item = items.nth(index);
      const name = (await item.innerText()).split('\n')[0].trim();
      if (!name || avoid.includes(name)) continue;
      await item.click();
      return name;
    }
  }
  throw new Error(`No catalog exercise matched ${queries.join(', ')}`);
}

async function addConfiguredExercise(page: Page, section: string, query: string[], options: { superset?: boolean; reps?: string; weight?: string; avoid?: string[] } = {}) {
  const block = page.locator('.group-strength-section').filter({ has: page.getByRole('heading', { name: section, exact: true }) });
  await block.getByRole('button', { name: 'Add exercise' }).click();
  const name = await pickCatalogExercise(page, query, options.avoid || []);
  const panel = page.locator('.add-exercise-panel');
  if (options.superset) await panel.getByRole('button', { name: 'Superset' }).click();
  if (options.reps) await panel.getByPlaceholder('8-12').fill(options.reps);
  if (options.weight) await panel.getByPlaceholder('lb').fill(options.weight);
  await panel.getByRole('button', { name: 'Add Exercise' }).click();
  return name;
}

test.describe('Phase 3B group strength workouts', () => {
  test.describe.configure({ timeout: 180_000 });
  test.beforeEach(async ({ page }, testInfo) => {
    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(30_000);
    if (!resetProjects.has(testInfo.project.name)) {
      resetProjects.add(testInfo.project.name);
      await resetFixtureSeries();
    }
  });
  test('owner builds, assigns, and reloads a recurring standalone workout', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const tag = tagOf(testInfo.project.name);
    const title = `QA ${tag} lower`;
    const privateTitle = `QA ${tag} private`;
    const cardioTitle = `QA ${tag} ride`;
    const today = weekdayShort();
    await signIn(page, fixture.emails.owner, fixture.password);
    await openCalendar(page, fixture.teamName);
    await expect(page.getByRole('button', { name: 'Add Activity' })).toHaveCount(1);
    await selectCalendarDay(page, today);
    await page.getByRole('button', { name: 'Add Activity' }).click();
    const sheet = page.locator('.group-strength-sheet');
    await sheet.getByRole('button', { name: 'Strength workout' }).click();
    await sheet.getByRole('button', { name: 'New workout' }).click();
    await sheet.getByRole('button', { name: 'Save workout' }).click();
    await expect(sheet.getByText('Add at least one exercise.')).toBeVisible();

    await sheet.getByLabel('Workout name').fill(title);
    const warmup = await addConfiguredExercise(page, 'Warm-up', ['lunge', 'bird', 'curl', 'press'], {});
    const first = await addConfiguredExercise(page, 'Strength', ['squat', 'deadlift', 'press'], { superset: true, reps: '5', weight: '135', avoid: [warmup] });
    const panel = page.locator('.add-exercise-panel');
    await expect(panel).toBeVisible();
    await pickCatalogExercise(page, ['row', 'pulldown', 'curl'], [warmup, first]);
    await panel.getByRole('button', { name: 'Add Exercise' }).click();
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet.getByText('Superset').first()).toBeVisible();

    const strength = sheet.locator('.group-strength-section').filter({ has: page.getByRole('heading', { name: 'Strength', exact: true }) });
    const exerciseLabel = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const equipment = strength.getByLabel(new RegExp(`^Equipment for ${exerciseLabel}$`));
    const equipmentOptions = await equipment.locator('option').allTextContents();
    if (equipmentOptions.length > 1) await equipment.selectOption({ index: 1 });
    const chosenEquipment = await equipment.inputValue();
    const secondEquipment = strength.getByLabel(/^Equipment for /).nth(1);
    if ((await secondEquipment.locator('option').count()) > 1) await secondEquipment.selectOption({ index: 0 });

    await strength.getByLabel(new RegExp(`^RIR for ${exerciseLabel} set 1$`)).fill('2');
    await strength.getByLabel(new RegExp(`^Rest for ${exerciseLabel} set 1$`)).fill('90');
    await strength.getByLabel(new RegExp(`^Set type for ${exerciseLabel} set 2$`)).selectOption('warmup');
    await sheet.getByRole('radio', { name: 'Selected members' }).check();
    await sheet.getByRole('checkbox', { name: 'QA owner', exact: true }).uncheck();
    await sheet.getByRole('checkbox', { name: 'QA member', exact: true }).check();
    await sheet.getByRole('checkbox', { name: 'QA manager', exact: true }).check();
    await sheet.getByRole('radio', { name: 'Every week' }).check();
    await sheet.getByRole('checkbox', { name: /Required/ }).check();
    await expectNoHorizontalOverflow(page);
    await sheet.getByRole('button', { name: 'Save workout' }).click();
    await expect(sheet).toBeHidden();
    await expectCards(page, today, title, 2);
    await expect(dayColumn(page, today).locator('.group-calendar-card').filter({ hasText: title }).first()).toContainText('Extra · required');

    const series = await restGet(page, `st_group_activity_series?title=eq.${encodeURIComponent(title)}&select=workout_id`);
    expect(series.length).toBeGreaterThan(0);
    const workoutId = series[0].workout_id as string;
    const exercises = await restGet(
      page,
      `st_exercises?workout_id=eq.${workoutId}&select=name,equipment,catalog_exercise_id,section,superset_group_id,st_planned_sets(set_type,target_reps,target_weight,target_rir,rest_seconds)`
    );
    expect(exercises.length).toBeGreaterThanOrEqual(3);
    expect(exercises.every((exercise: { catalog_exercise_id?: string | null }) => exercise.catalog_exercise_id)).toBeTruthy();
    expect(exercises.some((exercise: { section?: string }) => exercise.section === 'warmup')).toBeTruthy();
    const supersets = exercises.filter((exercise: { superset_group_id?: string | null }) => exercise.superset_group_id);
    expect(new Set(supersets.map((exercise: { superset_group_id?: string }) => exercise.superset_group_id)).size).toBe(1);
    expect(supersets.length).toBeGreaterThanOrEqual(2);
    const prescribed = exercises.find((exercise: { name?: string }) => exercise.name === first);
    expect(prescribed.equipment).toBe(chosenEquipment);
    const sets = prescribed.st_planned_sets as Array<{ set_type: string; target_reps: string; target_rir: number | null; rest_seconds: number | null }>;
    expect(sets.some((set) => set.set_type === 'working' && set.target_reps === '5' && set.target_rir === 2 && set.rest_seconds === 90)).toBeTruthy();
    expect(sets.some((set) => set.set_type === 'warmup')).toBeTruthy();

    await page.reload();
    await openCalendar(page, fixture.teamName);
    await selectCalendarDay(page, today);
    await expectCards(page, today, title, 2);
    await page.locator('.group-calendar-nav').getByRole('button', { name: 'Next week' }).click();
    await selectCalendarDay(page, today);
    await expectCards(page, today, title, 2);

    await page.locator('.group-calendar-nav').getByRole('button', { name: 'Today' }).click();
    await selectCalendarDay(page, today);
    await page.getByRole('button', { name: 'Add Activity' }).click();
    await sheet.getByRole('button', { name: 'Strength workout' }).click();
    await sheet.getByRole('button', { name: 'New workout' }).click();
    await sheet.getByLabel('Workout name').fill(privateTitle);
    await addConfiguredExercise(page, 'Strength', ['curl', 'press', 'squat'], { reps: '8', weight: '40' });
    await page.locator('.add-exercise-panel').getByRole('button', { name: 'Cancel' }).click().catch(() => undefined);
    await sheet.getByRole('radio', { name: 'Me', exact: true }).check();
    await sheet.getByRole('button', { name: 'Save workout' }).click();
    await expect(sheet).toBeHidden();
    await expectCards(page, today, privateTitle, 1);

    await page.getByRole('button', { name: 'Add Activity' }).click();
    await sheet.getByRole('button', { name: 'Cardio, mobility, or other' }).click();
    const other = page.locator('.pd-sheet');
    await other.getByRole('button', { name: 'Cardio' }).click();
    await other.getByPlaceholder('Cardio').fill(cardioTitle);
    await other.getByRole('button', { name: 'Add activity', exact: true }).click();
    await expect(other).toBeHidden();
    await expectCards(page, today, cardioTitle, 1);
    await expectNoHorizontalOverflow(page);
  });

  test('ordinary member can save only an optional personal extra and cannot read a private workout', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const tag = tagOf(testInfo.project.name);
    const privateTitle = `QA ${tag} private`;
    const ownTitle = `QA ${tag} member lift`;
    const today = weekdayShort();
    await signIn(page, fixture.emails.member, fixture.password);
    await openCalendar(page, fixture.teamName);
    await expect(page.getByText(privateTitle)).toHaveCount(0);
    const hidden = await restGet(page, `st_group_activity_series?title=eq.${encodeURIComponent(privateTitle)}&select=id,workout_id`);
    expect(hidden).toEqual([]);

    await selectCalendarDay(page, today);
    await page.getByRole('button', { name: 'Add Activity' }).click();
    const sheet = page.locator('.group-strength-sheet');
    await sheet.getByRole('button', { name: 'Strength workout' }).click();
    await expect(sheet.getByText('You can add an optional workout for yourself.')).toBeVisible();
    await expect(sheet.getByRole('radio', { name: 'Selected members' })).toHaveCount(0);
    await expect(sheet.getByRole('radio', { name: 'Entire group' })).toHaveCount(0);
    await expect(sheet.getByRole('checkbox', { name: /Required/ })).toHaveCount(0);
    await sheet.getByLabel('Workout name').fill(ownTitle);
    await addConfiguredExercise(page, 'Strength', ['press', 'curl', 'squat'], { reps: '10', weight: '25' });
    if (await page.locator('.add-exercise-panel').isVisible()) {
      await page.locator('.add-exercise-panel').getByRole('button', { name: 'Cancel' }).click();
    }
    await sheet.getByRole('button', { name: 'Save workout' }).click();
    await expect(sheet).toBeHidden();
    await expectCards(page, today, ownTitle, 1);
    await expect(dayColumn(page, today).locator('.group-calendar-card').filter({ hasText: ownTitle })).toContainText('Extra');
    await expect(dayColumn(page, today).locator('.group-calendar-card').filter({ hasText: ownTitle })).not.toContainText('required');
    await expect(page.getByText(privateTitle)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test('manager can assign a published program workout and a required extra', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const tag = tagOf(testInfo.project.name);
    const today = weekdayShort();
    await signIn(page, fixture.emails.manager, fixture.password);
    await openCalendar(page, fixture.teamName);
    await selectCalendarDay(page, today);
    await page.getByRole('button', { name: 'Add Activity' }).click();
    const sheet = page.locator('.group-strength-sheet');
    await sheet.getByRole('button', { name: 'Strength workout' }).click();
    await expect(sheet.getByRole('radio', { name: 'Entire group' })).toBeVisible();
    await expect(sheet.getByRole('checkbox', { name: /Required/ })).toBeVisible();
    await sheet.getByRole('button', { name: 'Program workout' }).click();
    const workout = sheet.getByLabel('Workout');
    await expect(workout.locator('option', { hasText: 'QA program' })).not.toHaveCount(0);
    const value = await workout.locator('option', { hasText: 'QA program' }).first().getAttribute('value');
    await workout.selectOption(value || '');
    await sheet.getByRole('radio', { name: 'Selected members' }).check();
    const memberBox = sheet.getByRole('checkbox', { name: 'QA member', exact: true });
    const managerBox = sheet.getByRole('checkbox', { name: 'QA manager', exact: true });
    await memberBox.uncheck();
    await managerBox.check();
    await sheet.getByRole('checkbox', { name: /Required/ }).check();
    await sheet.getByRole('button', { name: 'Save workout' }).click();
    await expect(sheet).toBeHidden();
    const column = dayColumn(page, today);
    await expect(column).toHaveCount(1);
    const more = column.getByRole('button', { name: /\+\d+ more/ });
    if (await more.count()) await more.click();
    await expect(column.locator('.group-calendar-card').filter({ hasText: 'QA member' }).filter({ hasText: 'QA Full Body' })).not.toHaveCount(0);
    await expect(column.locator('.group-calendar-card').filter({ hasText: 'QA manager' }).filter({ hasText: 'Mon' }).filter({ hasText: 'Extra · required' })).toHaveCount(1);

    await page.getByRole('button', { name: 'Add Activity' }).click();
    await sheet.getByRole('button', { name: 'Strength workout' }).click();
    await sheet.getByRole('button', { name: 'Program workout' }).click();
    const again = sheet.getByLabel('Workout');
    await expect(again.locator('option', { hasText: 'QA program' })).not.toHaveCount(0);
    await again.selectOption(value || '');
    await sheet.getByRole('radio', { name: 'Selected members' }).check();
    await sheet.getByRole('checkbox', { name: 'QA member', exact: true }).uncheck();
    await sheet.getByRole('checkbox', { name: 'QA manager', exact: true }).check();
    await sheet.getByRole('button', { name: 'Save workout' }).click();
    await expect(sheet.getByText('That workout is already on this date. Nothing new was saved.')).toBeVisible();
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet).toBeHidden();
    await expectNoHorizontalOverflow(page);

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Training' }).click();
    await expect(page.locator('.unified-schedule')).toBeVisible();
    await expect(page.locator('.unified-schedule')).not.toContainText(`QA ${tag} lower`);
    await expect(page.locator('.group-strength-sheet')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test('assign-enabled member can assign a workout on the assign group', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const tag = tagOf(testInfo.project.name);
    const title = `QA ${tag} assign lift`;
    const today = weekdayShort();
    const assignTeam = fixture.teamName.replace('BIQ-0263 QA ', 'BIQ-0263 QA assign ');
    await signIn(page, fixture.emails.assigner, fixture.password);
    await openCalendar(page, assignTeam);
    await selectCalendarDay(page, today);
    await page.getByRole('button', { name: 'Add Activity' }).click();
    const sheet = page.locator('.group-strength-sheet');
    await sheet.getByRole('button', { name: 'Strength workout' }).click();
    await expect(sheet.getByRole('radio', { name: 'Entire group' })).toBeVisible();
    await sheet.getByLabel('Workout name').fill(title);
    await addConfiguredExercise(page, 'Strength', ['press', 'row', 'curl'], { reps: '6', weight: '50' });
    if (await page.locator('.add-exercise-panel').isVisible()) {
      await page.locator('.add-exercise-panel').getByRole('button', { name: 'Cancel' }).click();
    }
    await sheet.getByRole('radio', { name: 'Entire group' }).check();
    await sheet.getByRole('button', { name: 'Save workout' }).click();
    await expect(sheet).toBeHidden();
    await expectCards(page, today, title, 2);
    await expectNoHorizontalOverflow(page);
  });

  test('member logs a standalone workout and returns to the calendar', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const tag = tagOf(testInfo.project.name);
    const title = `QA ${tag} log lift`;
    const today = weekdayShort();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayShort = WEEKDAYS[yesterday.getDay()];
    const yesterdayYmd = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    await signIn(page, fixture.emails.member, fixture.password);
    await openCalendar(page, fixture.teamName);
    await selectCalendarDay(page, today);
    await page.getByRole('button', { name: 'Add Activity' }).click();
    const sheet = page.locator('.group-strength-sheet');
    await sheet.getByRole('button', { name: 'Strength workout' }).click();
    await sheet.getByLabel('Workout name').fill(title);
    await addConfiguredExercise(page, 'Strength', ['press', 'curl', 'row'], { reps: '8', weight: '30' });
    if (await page.locator('.add-exercise-panel').isVisible()) {
      await page.locator('.add-exercise-panel').getByRole('button', { name: 'Cancel' }).click();
    }
    const exerciseEquipment = sheet.getByLabel(/^Equipment for /).first();
    if ((await exerciseEquipment.locator('option').count()) > 1) await exerciseEquipment.selectOption({ index: 1 });
    const chosenEquipment = await exerciseEquipment.inputValue();
    await sheet.getByRole('radio', { name: 'Every week' }).check();
    await sheet.getByRole('button', { name: 'Save workout' }).click();
    await expect(sheet).toBeHidden();
    await expectCards(page, today, title, 1);
    await page.locator('.group-calendar-nav').getByRole('button', { name: 'Next week' }).click();
    await selectCalendarDay(page, today);
    await dayColumn(page, today).locator('.group-calendar-card').filter({ hasText: title }).locator('.group-calendar-card-open').click();
    await expect(page.getByTestId('log-group-activity')).toHaveCount(0);
    await page.locator('.group-calendar-nav').getByRole('button', { name: 'Today' }).click();
    await selectCalendarDay(page, today);

    await dayColumn(page, today).locator('.group-calendar-card').filter({ hasText: title }).locator('.group-calendar-card-open').click();
    await page.getByRole('button', { name: 'This occurrence' }).click();
    await page.locator('form').getByLabel('Date').fill(yesterdayYmd);
    await page.getByRole('button', { name: 'Save this occurrence' }).click();
    await expect(page.getByRole('button', { name: 'Log workout' })).toHaveCount(0);

    if (yesterday.getDay() === 0) {
      await page.locator('.group-calendar-nav').getByRole('button', { name: 'Previous week' }).click();
    }
    await selectCalendarDay(page, yesterdayShort);
    await expectCards(page, yesterdayShort, title, 1);
    await selectCalendarDay(page, yesterdayShort);
    await dayColumn(page, yesterdayShort).locator('.group-calendar-card').filter({ hasText: title }).locator('.group-calendar-card-open').click();
    await page.getByTestId('log-group-activity').click();
    await expect(page.getByTestId('group-log-date')).toBeVisible();
    const repsInput = () => page.locator('.set-log-card').first().locator('input.log-input-card').nth(1);
    if (!(await repsInput().count())) await page.getByRole('button', { name: 'Expand' }).first().click();
    const reps = repsInput();
    await reps.fill('4');
    await reps.blur();
    await page.getByRole('button', { name: 'Back to calendar' }).click();
    await expect(page.locator('.group-calendar')).toBeVisible();
    await selectCalendarDay(page, yesterdayShort);
    await dayColumn(page, yesterdayShort).locator('.group-calendar-card').filter({ hasText: title }).locator('.group-calendar-card-open').click();
    await expect(page.getByText('Completed', { exact: true })).toHaveCount(0);
    await page.getByTestId('log-group-activity').click();
    if (!(await repsInput().count())) await page.getByRole('button', { name: 'Expand' }).first().click();
    await expect(repsInput()).toHaveValue('4');
    await page.getByRole('button', { name: 'Completed' }).click();
    await expect.poll(async () => {
      const rows = await restGet(page, `st_group_activity_occurrences?occurrence_date=eq.${yesterdayYmd}&select=completed`);
      return rows.some((row: { completed?: boolean }) => row.completed);
    }).toBe(true);
    await page.getByRole('button', { name: 'Back to calendar' }).click();
    await selectCalendarDay(page, yesterdayShort);
    await expect(dayColumn(page, yesterdayShort).locator('.group-calendar-card').filter({ hasText: title })).toContainText('Completed');

    const series = await restGet(page, `st_group_activity_series?title=eq.${encodeURIComponent(title)}&select=id,workout_id`);
    const workoutId = series[0].workout_id as string;
    const mine = await restGet(
      page,
      `st_set_logs?log_date=eq.${yesterdayYmd}&snapshot_equipment=eq.${encodeURIComponent(chosenEquipment)}&select=actual_reps,snapshot_equipment,team_id,completed`
    );
    expect(mine.some((row: { actual_reps?: string }) => row.actual_reps === '4')).toBeTruthy();
    expect(mine.every((row: { team_id?: string | null }) => row.team_id)).toBeTruthy();
    const expectations = await restGet(page, `st_training_expectations?workout_id=eq.${workoutId}&select=id`);
    expect(expectations).toEqual([]);
    const sessions = await restGet(page, `st_workout_sessions?workout_id=eq.${workoutId}&select=source_key,expectation_id,status`);
    expect(sessions.some((row: { source_key?: string; expectation_id?: string | null; status?: string }) => String(row.source_key || '').startsWith('group-activity:') && !row.expectation_id && row.status === 'completed')).toBeTruthy();

    await page.getByRole('button', { name: 'Training', exact: true }).click();
    await expect(page.getByTestId('group-log-date')).toHaveCount(0);
    await expect(page.getByText(title)).toHaveCount(0);

    await signIn(page, fixture.emails.manager, fixture.password);
    await openCalendar(page, fixture.teamName);
    if (yesterday.getDay() === 0) {
      await page.locator('.group-calendar-nav').getByRole('button', { name: 'Previous week' }).click();
    }
    await selectCalendarDay(page, yesterdayShort);
    await dayColumn(page, yesterdayShort).locator('.group-calendar-card').filter({ hasText: title }).locator('.group-calendar-card-open').click();
    await expect(page.getByTestId('log-group-activity')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mark complete' })).toHaveCount(0);
  });
});
