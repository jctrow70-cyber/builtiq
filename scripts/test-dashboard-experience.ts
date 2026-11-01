import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WEEK_ADHERENCE_DAY_NOTE, WEEK_ADHERENCE_SCOPE_NOTE } from '../lib/progress/weekAdherence';

const page = readFileSync('app/page.tsx', 'utf8');
const dash = page.slice(page.indexOf("appNav==='Dashboard'"), page.indexOf("appNav==='Nutrition'"));
const order = [
  'TodaysTrainingHero',
  'DashboardQuickActions',
  'WeeklyAdherenceCard',
  'NutritionDashboardCard',
  'ProgressDashboardCard',
];
let cursor = -1;
for (const name of order) {
  const at = dash.indexOf(`<${name}`);
  assert.ok(at > cursor, name);
  cursor = at;
}

assert.equal(dash.includes('AI Coach Insight'), false);
assert.equal(dash.includes('Group activity'), false);
assert.equal(dash.includes('Active this week'), false);
assert.equal(dash.includes('Group sets'), false);
assert.equal(dash.includes('Your wellness dashboard for'), false);
assert.equal(dash.includes('showGroup={teams.length>0}'), true);
assert.equal(dash.includes('onLogMeal={openLogMeal}'), true);
assert.equal(dash.includes('onAddCheckIn={openAddCheckIn}'), true);
assert.equal(dash.includes('onViewProgress={openProgressOverview}'), true);
assert.equal(dash.includes("onViewGroup={()=>goNav('Groups')}"), true);
assert.equal(dash.includes('onLogMeal={openLogMeal} onViewLog'), false);
assert.equal(dash.includes('onAddCheckIn={openAddCheckIn}/>'), false);

const actions = readFileSync('app/components/dashboard/DashboardQuickActions.tsx', 'utf8');
assert.equal(actions.includes('Log meal'), true);
assert.equal(actions.includes('Add check-in'), true);
assert.equal(actions.includes('View Progress'), true);
assert.equal(actions.includes('View group'), true);
assert.equal(actions.includes('showGroup &&'), true);
assert.equal(actions.includes('min-height'), false);

const nutrition = readFileSync('app/components/dashboard/NutritionDashboardCard.tsx', 'utf8');
assert.equal(nutrition.includes('Log meal'), false);
assert.equal(nutrition.includes('View log'), true);
assert.equal(nutrition.includes('Set goals'), true);
assert.equal(nutrition.includes('onLogMeal'), false);

const progress = readFileSync('app/components/dashboard/ProgressDashboardCard.tsx', 'utf8');
assert.equal(progress.includes('Add check-in'), false);
assert.equal(progress.includes('View Progress'), false);
assert.equal(progress.includes('onOpenStrength'), true);
assert.equal(progress.includes('onOpenBody'), true);
assert.equal(progress.includes('onClick={onViewProgress}'), true);
assert.equal(progress.includes('if (paint.cached && !paint.background) return;'), true);

const hero = readFileSync('app/components/dashboard/TodaysTrainingHero.tsx', 'utf8');
assert.equal(hero.includes('formatDisplayDate(today)'), true);
assert.equal(hero.includes('<span className="badge">{today}</span>'), false);

const week = readFileSync('app/components/dashboard/WeeklyAdherenceCard.tsx', 'utf8');
for (const label of ['Scheduled', 'Completed', 'Partial', 'Skipped', 'Missed', 'Due today', 'Upcoming', 'Past-day adherence']) {
  assert.equal(week.includes(label), true, label);
}
assert.equal(week.includes('onSelectDate(day.date)'), true);
assert.equal(week.split('WEEK_ADHERENCE_SCOPE_NOTE').length - 1, 2);
assert.equal(week.includes('title={WEEK_ADHERENCE_DAY_NOTE}'), true);
assert.equal(week.includes('<p className="muted week-adherence-note">{WEEK_ADHERENCE_DAY_NOTE}</p>'), false);
assert.equal(WEEK_ADHERENCE_SCOPE_NOTE.includes('hidden sources'), true);
assert.equal(WEEK_ADHERENCE_SCOPE_NOTE.includes('personal and group'), true);
assert.equal(WEEK_ADHERENCE_DAY_NOTE.includes('not a complete list'), true);

const formula = readFileSync('lib/progress/weekAdherence.ts', 'utf8');
assert.equal(formula.includes('adherenceCounts'), true);

const nav = page.slice(page.indexOf('function goNav'), page.indexOf('function openNotificationTarget'));
assert.equal(nav.includes("if(n==='Dashboard'&&teams.length)"), false);
assert.equal(nav.includes("if(n==='Groups')"), true);
assert.equal(nav.includes('loadMemberStats()'), true);
assert.equal(nav.includes('loadProgressLogs()'), true);
assert.equal(page.includes(".from('st_set_logs')"), true);
assert.equal(page.includes('.limit(800)'), true);
assert.equal(
  page.includes("onBodyDataChange={()=>{if(session?.user?.id)markScreenStale(session.user.id,['dashboard']);setBodyDashRefreshKey(k=>k+1);}}"),
  true
);
assert.equal(page.includes('BodyDashboardCard'), false);

const css = readFileSync('app/globals.css', 'utf8');
assert.equal(css.includes('.dash-quick{grid-column:1 / -1'), true);
assert.equal(css.includes('.dash-quick-btn{min-height:44px'), true);
assert.equal(css.includes('.today-training{min-height:0;grid-column:1 / -1}'), true);
assert.equal(css.includes('.week-adherence{min-height:0;grid-column:1 / -1}'), true);

console.log('dashboard experience tests passed');
