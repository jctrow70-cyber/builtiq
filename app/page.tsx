'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BugReportsAdmin } from './components/BugReportsAdmin';
import AppHeader from './components/layout/AppHeader';
import NotificationPreferences from './components/notifications/NotificationPreferences';
import PrimaryNav from './components/layout/PrimaryNav';
import TrainingWeekSelector from './components/training/TrainingWeekSelector';
import TrainingWorkoutDays from './components/training/TrainingWorkoutDays';
import WarmupExerciseCard from './components/training/WarmupExerciseCard';
import ExerciseLogMoreMenu from './components/training/ExerciseLogMoreMenu';
import { bindExerciseLogMoreItems, exerciseLogMoreItemSpecs } from '../lib/training/exerciseLogChrome';
import ExerciseSessionHistoryModal from './components/training/ExerciseSessionHistoryModal';
import SectionHeader from './components/ui/SectionHeader';
import { DEFAULT_THEME_ID } from '../lib/theme/themes';
import { supabase, friendlyAuthError, friendlyWriteError, getSupabaseConfigError, retryTransientSupabaseWrite } from '../lib/supabaseClient';
import { drainSetLogIntent, SET_LOG_WRITE_COALESCE_MS, SetLogIntentLedger, unsavedSetLogGate, type SetLogSaveResult } from '../lib/training/setLogIntent';
import { automaticSessionCompletionAllowed, createFinishSingleFlight } from '../lib/training/finishWorkoutPersistence';
import { noteLoggerSave } from '../lib/performance/loggerTiming';
import { beginExerciseEdit, noteExerciseEditFailure, noteExerciseEditMutation, noteExerciseEditVisual, type ExerciseEditTimingMark } from '../lib/performance/exerciseEditTiming';
import { noteWorkoutDetailOpen } from '../lib/performance/screenTiming';
import { directWorkoutOpenAllowed, expectationStillMatches, readExpectationForStart } from '../lib/training/calendarStartGuard';
import { buildExerciseSessionHistory } from '../lib/training/exerciseSessionHistory';
import { EXERCISE_TYPES, exerciseTypeOf, inferExerciseType, assignmentTypeLabel, isCardioType, isMobilityStretchExercise } from '../lib/training/exerciseTypes';
import { detectSetPersonalRecord } from '../lib/training/progressAnalytics';
import { exerciseProgressRequest, exerciseProgressTargetFromLogger, type ExerciseProgressRequest } from '../lib/progress/exerciseProgress';
import { logFieldsForType, formatLogSummary } from '../lib/training/logFields';
import { fetchAllExerciseCatalog } from '../lib/training/catalogFetch';
import { buildCatalogFilterOptions, catalogResultMeta, countCatalogMatches, hasCatalogSearchInput, searchCatalog, workoutSearchCatalogItems } from '../lib/training/catalogSearch';
import { catalogHistoryAliasKeys, pickCanonicalCatalogItem } from '../lib/training/catalogDedupe';
import { instructionsForDisplay } from '../lib/training/contentRights';
import { getExerciseGuidePayload, getExerciseThumb, hasExerciseGuide } from '../lib/training/exerciseMedia';
import { matchExerciseToCatalog } from '../lib/training/aiProgramPlan';
import { EQUIPMENT_OPTIONS, hasEquipmentFilter, normalizeEquipmentList, equipmentFilterLabel } from '../lib/training/equipmentFilter';
import { compatibleEquipmentOptions, defaultCatalogEquipment, resolveExerciseEquipment } from '../lib/training/exerciseEquipment';
import { canonicalEquipment, loadEntryCaption } from '../lib/training/equipmentIdentity';
import { createEquipmentWriteQueue, equipmentChoiceBlockReason, equipmentForSetSnapshot, type EquipmentWriteQueue } from '../lib/training/equipmentSelection';
import { blankExercisesInheritingProgramEquipment, equipmentEditScope, equipmentRowsFromProgram, equipmentWriteForTarget } from '../lib/training/equipmentPersistence';
import {
  clearPendingEquipmentIds,
  exerciseUpdateTouchedRow,
  remapPendingByExerciseId,
  resolveExerciseTarget as resolveExerciseTargetSafe,
} from '../lib/training/exerciseTargetResolve';
import {
  currentCalendarWeekBounds,
  dateForWeekAndDay,
  dateForWeekKeepingWeekday,
  dayLabelFromYmd,
  formatDisplayDate,
  mondayOfWeek,
  resolveProgramStartDate,
  todayYmd,
  weekForDate,
  weekRangeLabel,
  addDaysYmd,
  programEndDate,
} from '../lib/training/programCalendar';
import { isDraftProgram, isPublishedProgram, missingProgramColumnFromError, publishProgramRecord, deleteProgramRecord } from '../lib/training/programStatus';
import { fetchFullProgram, fetchProgramIndex, mergeFullProgramIntoList } from '../lib/training/programFetch';
import { countUnlinkedLogs, mapDateLogsToProgram, reattachUserLogsToProgram } from '../lib/training/reattachLogs';
import { projectDateLogsOntoWorkout } from '../lib/training/historicalLogProjection';
import { MOVEMENT_PATTERNS, normalizeMovementPattern } from '../lib/training/exerciseIntelligence';
import NutritionGoalsSettings from './components/nutrition/NutritionGoalsSettings';
import TodaysTrainingHero from './components/dashboard/TodaysTrainingHero';
import ProgressDashboardCard from './components/dashboard/ProgressDashboardCard';
import WeeklyAdherenceCard from './components/dashboard/WeeklyAdherenceCard';
import NutritionDashboardCard from './components/dashboard/NutritionDashboardCard';
import DashboardQuickActions from './components/dashboard/DashboardQuickActions';
import type { NutritionAddLaunch } from '../lib/nutrition/nutritionLaunch';
import { shouldOpenBodyCheckIn, type BodyCheckInLaunch } from '../lib/progress/bodyCheckInLaunch';
import type { TodayTrainingNavigation } from '../lib/training/todayTraining';
import WorkoutSetLogger from './components/WorkoutSetLogger';
import SessionOutcomeCard from './components/training/SessionOutcomeCard';
import AdaptationSummaryCard from './components/training/AdaptationSummaryCard';
import { snapshotForLog as buildSetLogSnapshot, stripUnavailableLogColumns } from '../lib/training/setLogSnapshots';
import { canRewritePlannedSetPrescription } from '../lib/training/plannedSetGuard';
import { applyLogSnapshotType, applyProgramSetDeleted, applyProgramSetType, applyWorkoutSetDeleted, applyWorkoutSetType, correctPlannedSetType, isCorrectableSetType, LOGGED_SET_REMOVAL_CONFIRMATION, plannedSetEditQueue, resolvePlannedSetTargets, softDeletePlannedSets } from '../lib/training/setTypeCorrection';
import { completedSessionDraft, deriveSessionStatus, outstandingRequiredSetIds, sessionStatusAfterPlanChange } from '../lib/training/sessionOutcome';
import { extraLogsFromSetLogs, extraSetInsertPayload, extraSetsForExercise, nextExtraSetNumber, type ExtraSetLog } from '../lib/training/extraSets';
import { classifyPreviousPerformance } from '../lib/training/previousPerformance';
import { loggerCopyLastEligible, loggerSelectedEquipment } from '../lib/training/previousPerformanceDisplay';
import { loadWorkoutFeedback, normalizePainFlag, upsertExerciseSession, upsertWorkoutFeel, upsertWorkoutSession } from '../lib/training/workoutSessions';
import { refreshProgramExpectations, withdrawAssignmentExpectation } from '../lib/training/scheduleActions';
import { patchProgramPlannedWeights } from '../lib/training/patchProgramPlannedWeights';
import type { AdaptationOrchestrationResult } from '../lib/training/adaptationOrchestration';
import { prescriptionColumnsFromSources } from '../lib/training/prescriptionMeta';
import type { PainFlag, SessionStatus, SkipReason, WorkoutFeel } from '../lib/scienceEngine/adaptation/types';
import AssignedWorkoutsPanel from './components/groups/AssignedWorkoutsPanel';
import type { ScheduleStartItem } from './components/training/UnifiedTrainingSchedule';
import { canShowTrainingPreviewEdit, resolveTrainingPreviewWorkout } from '../lib/training/trainingPreview';
import { trainingSourceLabel } from '../lib/training/trainingSource';
import { cycleLengthOf, formatLongWeekday } from '../lib/programDesign/cycle';
import { trainingPageHeading } from '../lib/training/trainingDayCard';
import { finishWorkoutActionLabel, nextWorkoutExerciseId, SESSION_FEEDBACK_PANEL_ID, SESSION_FEEDBACK_TITLE_ID, sessionFeedbackEscapeCollapses, sessionFeedbackIdentityKey, sessionFeedbackRevealScroll, sessionFeedbackStateFromRow, sessionFeedbackSummary, shouldApplySessionFeedbackHydration, showFinishWorkoutAction } from '../lib/training/sessionFeedback';
import { focusMusclesForSingleDayType, inferSessionMinutesFromPrompt, inferSingleDayTypeFromPrompt } from '../lib/programDesign/inferSchedule';
import AddActivitySheet from './components/programDesign/AddActivitySheet';
import StrengthWorkoutSetupSheet from './components/programDesign/StrengthWorkoutSetupSheet';
import { fetchDesignPrograms, fetchProgramActivities } from '../lib/programDesign/programDesignApi';
import {
  createPersonalStrengthWorkout,
  fetchWorkoutsByIds,
} from '../lib/programDesign/personalStrengthWorkout';
import {
  createUserCalendarActivity,
  fetchUserCalendarActivities,
  isActivityCompletedOnDate,
  linkCalendarActivityWorkout,
  monthWindow,
  saveUserCalendarOccurrence,
  deleteUserCalendarOccurrence,
  setUserCalendarActivityCompleted,
  type UserCalendarActivity,
} from '../lib/programDesign/userCalendar';
import {
  decorateDayPlanCompletion,
  exerciseCountsTowardWorkoutCompletion,
  plannedSetIdsForWorkout,
  isProgramItemCompletedOnDate,
  itemAllowsCheckoff,
  mergeTrainingCompletedDates,
  setProgramItemCompleted,
} from '../lib/programDesign/activityCompletion';
import type { TrainingDayItem } from '../lib/programDesign/trainingSchedule';
import { isAutoEnrolledMemberRole, isLiveGroupProgram, isPersonalizedGroupFollow, needsJustMeCopy } from '../lib/programDesign/enrollment';
import { blockRestLabel, exerciseSection as sharedExerciseSection, WORKOUT_SECTIONS, supersetMarks, trainingExercisePrescription, workingExerciseCount, workingExerciseCountLabel, workoutSectionsForDisplay } from '../lib/programDesign/workoutPreview';
import { weekdayIndexFromYmd } from '../lib/programDesign/recurrence';
import { customizeFollowedProgramForMe, matchCopiedWorkout, syncMemberGroupEnrollment } from '../lib/programDesign/followProgram';
import { orderGroupsForEnrollment } from '../lib/groups/trainingSources';
import { mergeProgramActivities, monthCalendarCells, monthLabel, planForCalendarDate, shiftYearMonth, tomorrowDate, weekPlansForMonday, yearMonthOf } from '../lib/programDesign/trainingSchedule';
import {
  moveCalendarActivityToDate,
  moveKeyForItem,
  nativeDateForActivity,
  nativeDateForWorkout,
  saveWorkoutDayMove,
  workoutDayMovesFromActivities,
} from '../lib/programDesign/workoutDayMoves';
import type { ProgramActivity, ProgramsLaunchIntent } from '../lib/programDesign/types';
import { canManageGroup, canAssignInGroup, canLogWorkout, canEditGroupProgram, canEditSharedGroupProgram, canSetGroupDefaultProgram, canViewGroupMemberProgress, groupPermissionFlags, groupProgressSubjectIds, isAssignableMemberRole, isGroupOwner, resolveGroupEditIntent, roleLabel, roleForDatabase, resolveAssignmentWorkout, assignedHasPersonalCopy, assignmentDisplayTitle, copyAssignmentToPersonal, classificationSlug, fetchGroupScopedSetLogs, loadMemberPerformanceBundle, loadMemberRosterMeta, duplicateTeamProgram, customizeProgramForMember, leaveTeam, deleteTeam, setGroupDefaultProgram, type AssignedWorkoutRow, type GroupClassification, type GroupPermissionFlags, type MemberPerformanceBundle, type MemberRosterMeta } from '../lib/groups';
import { assignGroupPrograms, assignGroupWorkout } from '../lib/groups/assignGroupTraining';
import { resumeAfterProgramPublish, type AssignmentWizardResume } from '../lib/groups/assignmentWizard';
import { groupLogReturnFromRequest, trainingLoggerBack, type GroupLogReturn } from '../lib/groups/groupLogReturn';
import { groupActivityLogReturn, groupActivitySourceKey, type GroupActivityLogContext, type GroupActivityLogRequest } from '../lib/groups/groupActivityLog';
import type { AssignTrainingSubmit } from './components/groups/AssignTrainingWizard';
import type { AssignProgramTarget } from './components/groups/TeamAssignProgramModal';
import { afterScreenUsable, beginScreenTiming, completeScreenPhase, noteProgramLoad } from '../lib/performance/screenTiming';
import { LazyScreen, preloadLazyScreen, scheduleIdlePreload } from '../lib/performance/lazyScreen';
import { activeWorkoutIsProtected, bindScreenSessionUser, bumpDashboardCardEpoch, clearScreenSession, clearScreenStale, isScreenStale, markScreenStale, subscribeScreenSession } from '../lib/performance/screenSession';
import { assignmentLoadKey, createProgramLoadGate, groupAssignLoadForNav, programLoadKey, shellProgramLoadForNav } from '../lib/training/programLoadGate';
import { programApplyBlocked } from '../lib/training/programLoadGuard';
import { armEnrollmentSync, releaseEnrollmentSyncIfIdle, subscribeEnrollmentSync, trackTrainingLoad } from '../lib/training/enrollmentSyncGate';
import { createPendingExerciseId, dropExercisesFromProgram, exerciseIsLoggable, exerciseRemovalAfterSetEdits, insertExercisesIntoProgram, insertExercisesIntoWorkoutList, isPendingExercise, isPendingExerciseId, patchExerciseCatalogInProgram, plannedSetIdsOf, removeExercisesFromProgram, removeExercisesFromWorkoutList, replaceExerciseInProgram, restoreRemovedExercises, restoreRemovedWorkoutList, setIdsInPendingFieldKeys, workoutsInEditScope, type RemovedExercise } from '../lib/training/exerciseListEdit';

const nutritionScreenLoader = () => import('./components/NutritionTracker');
const progressScreenLoader = () => import('./components/progress/ProgressScreen');
const groupsScreenLoader = () => import('./components/groups/GroupsHub');
const programDesignScreenLoader = () => import('./components/programDesign/ProgramDesignHome');
const trainingScheduleLoader = () => import('./components/training/UnifiedTrainingSchedule');
const workoutPlanSheetLoader = () => import('./components/training/WorkoutPlanSheet');
const moveWorkoutSheetLoader = () => import('./components/training/MoveWorkoutSheet');

const NAV=['Dashboard','Training','Programs','Groups','Nutrition','Progress','AI Coach','Settings'];
const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const SECTIONS=WORKOUT_SECTIONS;
const trainingRxLines=(rx:ReturnType<typeof trainingExercisePrescription>)=>!rx?null:<>{rx.planned?<p className="muted te-ex-rx">Planned: {rx.planned}</p>:null}{rx.secondary?<p className="muted te-ex-rx-secondary">{rx.secondary}</p>:null}</>;
const SECTION_SORT_BASE:any={warmup:0,strength:100,conditioning:200,cooldown:300};
const sectionDefaultSets=(section:string)=>section==='warmup'||section==='cooldown'?1:3;
const workoutExerciseCount=(w:any)=>SECTIONS.reduce((n:number,sec:any)=>n+sectionExercises(w,sec.id).length,0);
const workoutExercisesInOrder=(w:any)=>SECTIONS.flatMap((sec:any)=>sectionExercises(w,sec.id));
const addPanelSectionLabel=(section:string)=>SECTIONS.find((s:any)=>s.id===section)?.label||section;
const exerciseSection=(ex:any)=>sharedExerciseSection(ex);
const sectionExercises=(workout:any,section:string)=>(workout?.st_exercises||[]).filter((e:any)=>exerciseSection(e)===section).sort((a:any,b:any)=>{const d=(a.sort_order||0)-(b.sort_order||0);if(d)return d;return (a.superset_order||0)-(b.superset_order||0);});
const nextSortOrder=(workout:any,section:string)=>{const list=sectionExercises(workout,section);const base=SECTION_SORT_BASE[section]??100;return list.length?Math.max(...list.map((e:any)=>e.sort_order||0))+1:base;};
const makeSupersetGroupId=()=>(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`ss-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
const nextSupersetLabel=(w:any,section:string)=>{const exs=sectionExercises(w,section).filter((e:any)=>e.superset_group_id);const nums=exs.map((e:any)=>{const m=String(e.superset_label||'').match(/Superset\s+([A-Z])/i);return m?m[1].charCodeAt(0)-64:0;});const n=nums.length?Math.max(...nums)+1:1;return `Superset ${String.fromCharCode(64+n)}`;};
const groupSectionBlocks=(exercises:any[])=>{const blocks:any[]=[];const groups=new Map<string,any>();(exercises||[]).forEach((ex:any)=>{const gid=ex.superset_group_id;if(!gid){blocks.push({type:'single',exercises:[ex],anchor:ex.sort_order||0});return;}if(!groups.has(gid))groups.set(gid,{type:'superset',groupId:gid,label:ex.superset_label||'Superset',exercises:[],anchor:ex.sort_order||0});const g=groups.get(gid);g.exercises.push(ex);g.anchor=Math.min(g.anchor,ex.sort_order||0);if(ex.superset_label)g.label=ex.superset_label;});groups.forEach((g)=>{g.exercises.sort((a:any,c:any)=>(a.superset_order||0)-(c.superset_order||0));blocks.push(g);});blocks.sort((a:any,b:any)=>(a.anchor||0)-(b.anchor||0));return blocks;};
const logExerciseName=(row:any,joinEx?:any)=>String(row.snapshot_exercise_name||joinEx?.name||'').trim();
const logCatalogId=(row:any,joinEx?:any)=>row.snapshot_catalog_exercise_id||joinEx?.catalog_exercise_id||'';
const logSetType=(row:any,joinPs?:any)=>row.snapshot_set_type||joinPs?.set_type||'working';
const logSetNumber=(row:any,joinPs?:any)=>row.snapshot_set_number??row.extra_set_number??joinPs?.set_number??1;
const exerciseHistoryKey=(catalogId:string,name:string)=>catalogId||String(name||'').toLowerCase().trim();
const logHistoryKeys=(row:any)=>{const joinEx=row.st_planned_sets?.st_exercises;const joinPs=row.st_planned_sets;const catalogId=logCatalogId(row,joinEx);const name=logExerciseName(row,joinEx);const exerciseKey=exerciseHistoryKey(catalogId,name);const setType=logSetType(row,joinPs);const setNumber=logSetNumber(row,joinPs);const setKey=`${exerciseKey}|${setType}|${setNumber}`;return {exerciseKey,setKey,catalogId,name,setType,setNumber};};
const logHasPerformance=(row:any)=>!!(
  row&&(String(row.actual_weight||'').trim()||String(row.actual_reps||'').trim()||String(row.actual_duration||'').trim()||String(row.actual_distance||'').trim()||String(row.log_notes||'').trim())
);
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull=(v:any)=>{const s=String(v||'').trim();return UUID_RE.test(s)?s:null;};
const NUMERIC_SET_LOG_KEYS=new Set(['actual_rir','pain_score']);
const coerceSetLogValue=(key:string,raw:any)=>{
  if(NUMERIC_SET_LOG_KEYS.has(key)){
    if(raw==null||String(raw).trim()==='')return null;
    const n=Number(raw);
    return Number.isFinite(n)?n:null;
  }
  return raw==null?'':String(raw);
};
const snapshotForLog=(ex:any,set:any,workoutRef:any,catItem:any,equipment:string)=>buildSetLogSnapshot(ex,set,workoutRef,catItem,{equipment:equipment||'',exerciseType:exerciseTypeOf(ex,catItem),section:exerciseSection(ex)});
const catalogByName=(items:any[])=>{const map:any={};(items||[]).filter((c:any)=>!c.is_archived).forEach((c:any)=>{map[String(c.name||'').toLowerCase()]=c;});return map;};
const today=todayYmd;
const makeInviteCode=()=>(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID().replace(/-/g,'').slice(0,8):Math.random().toString(36).slice(2,10)).toUpperCase();
const REMEMBER_EMAIL_KEY='buildiq_remembered_email';
const emptyProfileDraft=(source?:any)=>({display_name:source?.display_name||'',height_inches:source?.height_inches??'',weight_lbs:source?.weight_lbs??'',birth_year:source?.birth_year??'',sex:source?.sex||'',experience_level:source?.experience_level||'beginner',primary_goal:source?.primary_goal||'general_health',units_preference:source?.units_preference||'imperial',available_equipment:normalizeEquipmentList(source?.available_equipment),ui_theme:source?.ui_theme||''});
const toggleEquipmentList=(list:string[],id:string)=>{if(id==='full_gym')return list.includes('full_gym')?[]:['full_gym']; let next=list.filter((x)=>x!=='full_gym'); if(next.includes(id))next=next.filter((x)=>x!==id); else next=[...next,id]; return next;};
const profileNeedsSetup=(p:any)=>{if(!p)return true; if(p.profile_completed===true)return false; if(p.profile_completed===false)return true; return !String(p.display_name||'').trim();};
const emptyAddPanelConfig=()=>({mode:'normal' as 'normal'|'superset',supersetGroupId:null as string|null,setCount:3,targetReps:'8-12',targetWeight:''});
const emptyAddPanelCustom=()=>({name:'',category:'strength',muscle_group:'',equipment:'',movement_pattern:''});
const resolveCatalogMovementPattern=(raw?:string):{value:string|null;error?:string}=>{const trimmed=String(raw||'').trim();if(!trimmed)return{value:null};const normalized=normalizeMovementPattern(trimmed);if(!normalized)return{value:null,error:`Invalid movement pattern. Choose one of: ${MOVEMENT_PATTERNS.join(', ')}.`};return{value:normalized};};
const emptyAddPanelFilters=()=>({muscle:'',equipment:'',exerciseType:'',guidesOnly:false});
const getSupersetGroupsForSection=(w:any,section:string)=>{const exs=sectionExercises(w,section);const groups:any[]=[];const seen=new Set();exs.forEach((ex:any)=>{if(!ex.superset_group_id||seen.has(ex.superset_group_id))return;seen.add(ex.superset_group_id);const members=exs.filter((e:any)=>e.superset_group_id===ex.superset_group_id).sort((a:any,b:any)=>(a.superset_order||0)-(b.superset_order||0));if(members.length>=1)groups.push({id:ex.superset_group_id,label:ex.superset_label||members.map((e:any)=>e.name).join(' + '),count:members.length,sortOrder:Math.min(...members.map((m:any)=>m.sort_order||0))});});return groups.sort((a:any,b:any)=>(a.sortOrder||0)-(b.sortOrder||0));};
const workoutStatusFor=(workoutRef:any,logMap:any)=>{if(!workoutRef)return 'none';let planned=0,done=0,started=0;(workoutRef.st_exercises||[]).forEach((e:any)=>{if(!exerciseCountsTowardWorkoutCompletion(e))return;(e.st_planned_sets||[]).filter((s:any)=>!s.is_deleted).forEach((s:any)=>{planned++;const log=logMap[s.id];if(log?.completed)done++;else if(log&&logHasPerformance(log))started++;});});if(!planned)return 'none';if(done===planned)return 'completed';if(done>0||started>0)return 'in_progress';return 'not_started';};
const statusLabel=(s:string)=>s==='completed'?'Completed':s==='in_progress'?'In progress':s==='not_started'?'Not started':'No workout';
const workoutForDate=(p:any,dateYmd:string,fallbackWeek?:number,moves?:Record<string,string>)=>{
  if(!p)return null;
  const start=resolveProgramStartDate(p);
  const wk=weekForDate(start,dateYmd,p.weeks||6);
  const dayLabel=dayLabelFromYmd(dateYmd);
  const list=p.st_workouts||[];
  const movedHere=moves?list.find((x:any)=>x.id&&moves[`w:${x.id}`]===dateYmd):null;
  if(movedHere)return movedHere;
  const native=list.find((x:any)=>x.week===wk&&x.day_label===dayLabel);
  if(native&&moves&&moves[`w:${native.id}`]&&moves[`w:${native.id}`]!==dateYmd)return null;
  return native||list.filter((x:any)=>x.week===(fallbackWeek??wk)).sort((a:any,b:any)=>a.day_order-b.day_order)[0]||null;
};
const findSetInProgram=(p:any,sid:string,extraWorkouts?:any[])=>{
  const trees=[...(p?.st_workouts||[]),...(extraWorkouts||[])];
  for(const w of trees){
    if(!w)continue;
    for(const e of w.st_exercises||[]){
      const ps=(e.st_planned_sets||[]).find((s:any)=>s.id===sid&&!s.is_deleted);
      if(ps)return {workout:w,exercise:e,plannedSet:ps};
    }
  }
  return null;
};

export default function Page(){
 const [session,setSession]=useState<any>(null),[authReady,setAuthReady]=useState(false),[profileLoading,setProfileLoading]=useState(false);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState('');
 const [authMode,setAuthMode]=useState<'signin'|'signup'>('signin'),[rememberEmail,setRememberEmail]=useState(true);
 const [profile,setProfile]=useState<any>(null),[displayName,setDisplayName]=useState(''),[profileDraft,setProfileDraft]=useState<any>(emptyProfileDraft()),[profileSaving,setProfileSaving]=useState(false);
 const [appNav,setAppNav]=useState('Dashboard');
 const [pendingGroupMessage,setPendingGroupMessage]=useState<{teamId:string;conversationId:string}|null>(null);
 const [teams,setTeams]=useState<any[]>([]),[selectedTeamId,setSelectedTeamId]=useState<string|null>(null),[members,setMembers]=useState<any[]>([]),[mode,setMode]=useState<'personal'|'team'>('personal');
 const [programs,setPrograms]=useState<any[]>([]),[program,setProgram]=useState<any>(null),[programName,setProgramName]=useState('Strength Program'),[weeks,setWeeks]=useState(6);
 const [programStartDate,setProgramStartDate]=useState(()=>mondayOfWeek(todayYmd()));
 const [week,setWeek]=useState(1),[activeWorkout,setActiveWorkout]=useState('');
 const [logDate,setLogDate]=useState(today()),[localDate,setLocalDate]=useState(today()),[logs,setLogs]=useState<any>({}),[history,setHistory]=useState<any>({}),[liftHistoryRows,setLiftHistoryRows]=useState<any[]>([]),[pendingEquipmentById,setPendingEquipmentById]=useState<Record<string,string>>({}),[applyScope,setApplyScope]=useState<'current'|'future'>('future'),[pendingAddScope,setPendingAddScope]=useState<'current'|'future'|null>(null);
 const [catalog,setCatalog]=useState<any[]>([]);
 const [catalogError,setCatalogError]=useState('');
 const [showCustomForm,setShowCustomForm]=useState<any>({warmup:false,strength:false,cooldown:false});
 const [customDraft,setCustomDraft]=useState<any>({name:'',category:'strength',muscle_group:'',equipment:'',movement_pattern:''});
 const [catalogEditId,setCatalogEditId]=useState<string|null>(null);
 const [catalogEditDraft,setCatalogEditDraft]=useState<any>({name:'',category:'',muscle_group:'',equipment:'',movement_pattern:''});
 const [progressLogs,setProgressLogs]=useState<any[]>([]);
 const [progressSection,setProgressSection]=useState<'overview'|'strength'|'training'|'nutrition'|'body'>('overview'),[progressExercise,setProgressExercise]=useState<ExerciseProgressRequest|null>(null);
 const [historyRestoreBusy,setHistoryRestoreBusy]=useState(false);
 const [trainingSubNav,setTrainingSubNav]=useState<'personal'|'setup'>('personal');
 const [trainingCalendarView,setTrainingCalendarView]=useState<'day'|'week'|'month'>('month');
 const [trainingCalendarMonth,setTrainingCalendarMonth]=useState(()=>yearMonthOf(todayYmd()));
 const [trainingSessionOpen,setTrainingSessionOpen]=useState(false);
 const trainingSessionOpenRef=useRef(false);
 trainingSessionOpenRef.current=trainingSessionOpen;
 const viewingWorkoutRef=useRef<string|null>(null);
 const [screenSessionTick,setScreenSessionTick]=useState(0);
 const [activeExpectationId,setActiveExpectationId]=useState<string|null>(null);
 const [activeExpectationSource,setActiveExpectationSource]=useState<string|null>(null);
 const [activeExpectationDate,setActiveExpectationDate]=useState<string|null>(null);
 const [groupLogReturn,setGroupLogReturn]=useState<GroupLogReturn|null>(null);
 const [groupTrainingResume,setGroupTrainingResume]=useState<GroupLogReturn|null>(null);
 const [groupActivityLog,setGroupActivityLog]=useState<GroupActivityLogContext|null>(null);
 const [groupActivityWorkout,setGroupActivityWorkout]=useState<any>(null);
 const groupActivityLogRef=useRef<GroupActivityLogContext|null>(null);
 const groupActivityWorkoutRef=useRef<any>(null);
 groupActivityLogRef.current=groupActivityLog;
 groupActivityWorkoutRef.current=groupActivityWorkout;
 const [trainingActivities,setTrainingActivities]=useState<ProgramActivity[]>([]);
 const [userCalendarActivities,setUserCalendarActivities]=useState<UserCalendarActivity[]>([]);
 const [userCalendarError,setUserCalendarError]=useState<string|null>(null);
 const [userCalendarReady,setUserCalendarReady]=useState(false);
 const [trainingScheduleReady,setTrainingScheduleReady]=useState(false);
 const [programTreeReady,setProgramTreeReady]=useState(false);
 const [scheduleRefreshKey,setScheduleRefreshKey]=useState(0);
 const [scheduleRepairGeneration,setScheduleRepairGeneration]=useState(0);
 const [trainingAddActivityOpen,setTrainingAddActivityOpen]=useState(false);
 const [trainingEditActivity,setTrainingEditActivity]=useState<{id:string;date:string}|null>(null);
 const [trainingMoveItem,setTrainingMoveItem]=useState<{item:TrainingDayItem;date:string}|null>(null);
 const [trainingMoveBusy,setTrainingMoveBusy]=useState(false);
 const [calendarWorkouts,setCalendarWorkouts]=useState<any[]>([]);
 const [strengthSetup,setStrengthSetup]=useState<{activityId:string;workoutId:string;date:string;title:string}|null>(null);
 const [strengthSetupGenerating,setStrengthSetupGenerating]=useState(false);
 const [strengthSetupError,setStrengthSetupError]=useState('');
 const [trainingCompleteBusy,setTrainingCompleteBusy]=useState<string|null>(null);
 const [viewingWorkoutId,setViewingWorkoutId]=useState<string|null>(null);
 viewingWorkoutRef.current=viewingWorkoutId;
 const [workoutPreviewMeta,setWorkoutPreviewMeta]=useState<{sourceName?:string|null;error?:string|null;completed?:boolean;workout?:any|null;duration?:string|null}|null>(null);
 const [trainingSessionIntent,setTrainingSessionIntent]=useState<'log'|'edit'>('log');
 const [extraSetLogs,setExtraSetLogs]=useState<ExtraSetLog[]>([]);
 const [sessionOutcome,setSessionOutcome]=useState<SessionStatus>('not_started');
 const [sessionFeel,setSessionFeel]=useState<WorkoutFeel|''>('');
 const [sessionPain,setSessionPain]=useState<PainFlag|''>('');
 const [sessionNotes,setSessionNotes]=useState('');
 const [sessionSkipReason,setSessionSkipReason]=useState<SkipReason|''>('');
 const [sessionFeedbackExpanded,setSessionFeedbackExpanded]=useState(false);
 const sessionFeedbackOpenerRef=useRef<HTMLElement|null>(null);
 const [skippedExerciseIds,setSkippedExerciseIds]=useState<Record<string,boolean>>({});
 const [phase2a1Pending,setPhase2a1Pending]=useState(false);
 const [adaptationSummary,setAdaptationSummary]=useState<AdaptationOrchestrationResult|null>(null);
 const [customizeForMeBusy,setCustomizeForMeBusy]=useState(false);
 const [addExercisePanel,setAddExercisePanel]=useState<any>(null);
 const [exerciseSwapPrompt,setExerciseSwapPrompt]=useState<any>(null);
 const [exerciseNameSearch,setExerciseNameSearch]=useState<{exerciseId:string,query:string}|null>(null);
 const [exerciseGuide,setExerciseGuide]=useState<any>(null);
 const [supersetEditExerciseId,setSupersetEditExerciseId]=useState<string|null>(null);
 const [exerciseHistoryModal,setExerciseHistoryModal]=useState<any>(null);
 const [pendingSupersetGroup,setPendingSupersetGroup]=useState<any>({warmup:null,strength:null,cooldown:null});
 const [bugOpen,setBugOpen]=useState(false);
 const [bugTitle,setBugTitle]=useState('');
 const [bugDescription,setBugDescription]=useState('');
 const [bugSending,setBugSending]=useState(false);
 const [bugSentId,setBugSentId]=useState('');
 const [bugFabVisible,setBugFabVisible]=useState(false);
 const [draftEditProgramId,setDraftEditProgramId]=useState<string|null>(null);
 const draftNameSourceRef=useRef<string|null>(null);
 const [viewingMember,setViewingMember]=useState<any>(null);
 const [memberWorkoutProgram,setMemberWorkoutProgram]=useState<any>(null);
 const [memberWorkoutWeek,setMemberWorkoutWeek]=useState(1);
 const [memberWorkoutLogDate,setMemberWorkoutLogDate]=useState(today());
 const [memberWorkoutActiveId,setMemberWorkoutActiveId]=useState('');
 const [memberDashboard,setMemberDashboard]=useState<any>(null);
 const [memberDashProgram,setMemberDashProgram]=useState<any>(null);
 const [memberDashLogs,setMemberDashLogs]=useState<any>({});
 const [nutritionLaunch,setNutritionLaunch]=useState<NutritionAddLaunch|null>(null);
 const nutritionLaunchSeq=useRef(0);
 const [scrollNutritionGoals,setScrollNutritionGoals]=useState(false);
 const [bodyCheckInLaunch,setBodyCheckInLaunch]=useState<BodyCheckInLaunch|null>(null);
 const bodyCheckInSeq=useRef(0);
 const bodyCheckInConsumed=useRef<number|null>(null);
 const [memberDashLastDate,setMemberDashLastDate]=useState('');
 const [memberStats,setMemberStats]=useState<any>({});
 const [memberRosterMeta,setMemberRosterMeta]=useState<Record<string, MemberRosterMeta>>({});
 const [memberPerformance,setMemberPerformance]=useState<MemberPerformanceBundle|null>(null);
 const [memberPerformanceLoading,setMemberPerformanceLoading]=useState(false);
 const [memberHistoryRestoreBusy,setMemberHistoryRestoreBusy]=useState(false);
 const [memberAssignments,setMemberAssignments]=useState<any>({});
 const [assignDraft,setAssignDraft]=useState<any>({type:'team',programId:'',notes:''});
 const [assignedWorkouts,setAssignedWorkouts]=useState<AssignedWorkoutRow[]>([]);
 const [activeAssignedRecipient,setActiveAssignedRecipient]=useState<AssignedWorkoutRow|null>(null);
 const [assignmentCopyBusy,setAssignmentCopyBusy]=useState<string|null>(null);
 const [assignmentDismissBusy,setAssignmentDismissBusy]=useState<string|null>(null);
 const [groupProgramForAssign,setGroupProgramForAssign]=useState<any>(null);
 const [assignWorkoutPrograms,setAssignWorkoutPrograms]=useState<any[]>([]);
 const [classifications,setClassifications]=useState<GroupClassification[]>([]);
 const [memberClassificationIds,setMemberClassificationIds]=useState<Record<string,string[]>>({});
 const [logDistanceUnit,setLogDistanceUnit]=useState<'mi'|'km'>('mi');
 const [collapsedExercises,setCollapsedExercises]=useState<Record<string,boolean>>({});
 const [guidedImportStatus,setGuidedImportStatus]=useState<any>(null);
 const [guidedImportRunning,setGuidedImportRunning]=useState(false);
 const [masterImportStatus,setMasterImportStatus]=useState<any>(null);
 const [masterImportRunning,setMasterImportRunning]=useState(false);
 const [catalogDedupeRunning,setCatalogDedupeRunning]=useState(false);
 const [programsLaunch,setProgramsLaunch]=useState<ProgramsLaunchIntent|null>(null);
 const [assignmentResume,setAssignmentResume]=useState<AssignmentWizardResume|null>(null);
 const refs=useRef<any[]>([]);
 const namePickRef=useRef(false);
 const logsRef=useRef<any>({});
 const upsertQueueRef=useRef<Record<string,Promise<any>>>({});
 const loggerFlushesRef=useRef(new Set<() => Promise<void>>());
 const loggerPendingKeysRef=useRef(new Set<() => string[]>());
 const finishFlightRef=useRef(createFinishSingleFlight());
 const finishOwnsSessionRef=useRef(false);
 const sessionFeelLiveRef=useRef<WorkoutFeel|''>('');
 const sessionPainLiveRef=useRef<PainFlag|''>('');
 const sessionNotesLiveRef=useRef('');
 const sessionSkipLiveRef=useRef<SkipReason|''>('');
 const registerLoggerFlush=useCallback((flush:() => Promise<void>)=>{
  loggerFlushesRef.current.add(flush);
  return ()=>{loggerFlushesRef.current.delete(flush);};
 },[]);
 const registerLoggerPending=useCallback((read:() => string[])=>{
  loggerPendingKeysRef.current.add(read);
  return ()=>{loggerPendingKeysRef.current.delete(read);};
 },[]);
 useEffect(()=>{
  sessionFeelLiveRef.current=sessionFeel;
  sessionPainLiveRef.current=sessionPain;
  sessionNotesLiveRef.current=sessionNotes;
  sessionSkipLiveRef.current=sessionSkipReason;
 },[sessionFeel,sessionPain,sessionNotes,sessionSkipReason]);
 const setLogLedgersRef=useRef<Map<string,SetLogIntentLedger>>(new Map());
 const equipmentQueuesRef=useRef<Record<string,EquipmentWriteQueue>>({});
 const equipmentInheritFlightRef=useRef('');
 const setLogFollowRef=useRef<Map<string,any>>(new Map());
 const loggerActionsRef=useRef<any>({});
 const saveLogStable=useCallback((sid:string,field:string,value:any,opts?:{completed?:boolean})=>loggerActionsRef.current.saveLog?.(sid,field,value,opts),[]);
 const retrySetLogStable=useCallback((sid:string)=>loggerActionsRef.current.retrySetLog?.(sid),[]);
 const editSetStable=useCallback((set:any,field:string,value:any)=>loggerActionsRef.current.editSet?.(set,field,value),[]);
 const removeSetStable=useCallback((set:any)=>loggerActionsRef.current.removeSet?.(set),[]);
 const duplicateSetLogStable=useCallback((sid:string,source:any)=>loggerActionsRef.current.duplicateSetLog?.(sid,source),[]);
 const completedSessionKeyRef=useRef<string|null>(null);
 const sessionFeedbackIdentityRef=useRef<string|null>(null);
 const sessionFeedbackDirtyRef=useRef(false);
 const sessionFeedbackLoadGenRef=useRef(0);
 const planChangePartialRef=useRef<string|null>(null);
 const prCelebrationTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [prCelebration,setPrCelebration]=useState<{exerciseName:string;message:string;subtext:string}|null>(null);
 const syncingCalendarRef=useRef(false);
 const schedulePreviewRef=useRef<ScheduleStartItem|null>(null);
 const planEditRef=useRef<{workout:any,program:any}|null>(null);
 const programLoadGateRef=useRef(createProgramLoadGate());
 const exerciseEditEpochRef=useRef(0);
 const exerciseMutationRef=useRef<Set<string>>(new Set());
 const personalCopyFlightRef=useRef<Promise<{program:any}|null>|null>(null);
 const addExerciseFlightRef=useRef(false);
 const cancelledExerciseIdsRef=useRef<Set<string>>(new Set());
 const exerciseWriteHoldRef=useRef<any[]>([]);
 const exerciseVisualRef=useRef<{kind:'add'|'remove';mark:ExerciseEditTimingMark;ids:string[];workoutId:string}|null>(null);
 const enrollmentSyncKeyRef=useRef('');

 useEffect(()=>{
  if(typeof window!=='undefined'&&window.location.pathname==='/'){
   const pendingInvite=sessionStorage.getItem('biq_group_invite_token');
   if(pendingInvite){
    window.location.replace('/invite/'+encodeURIComponent(pendingInvite));
    return;
   }
  }
  supabase.auth.getSession().then(({data})=>{setSession(data.session);setAuthReady(true);});
  const{data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
  return()=>data.subscription.unsubscribe();
 },[]);
 useEffect(()=>{
  if(typeof window==='undefined')return;
  const saved=localStorage.getItem(REMEMBER_EMAIL_KEY);
  if(saved){setEmail(saved);setRememberEmail(true);}
 },[]);
 useEffect(()=>subscribeScreenSession(()=>setScreenSessionTick((value)=>value+1)),[]);
 useEffect(()=>{
  clearScreenSession();
  setTrainingSessionOpen(false);
  setLogs({});
  logsRef.current={};
  setSessionOutcome('not_started');
  setSessionFeel('');
  setSessionPain('');
  setSessionNotes('');
  setSessionSkipReason('');
  setSessionFeedbackExpanded(false);
  sessionFeedbackDirtyRef.current=false;
  sessionFeedbackIdentityRef.current=null;
  setLogDate(todayYmd());
  setAppNav('Dashboard');
  if(!session?.user){
   setProfile(null);setProfileLoading(false);setSelectedTeamId(null);setTeams([]);setMembers([]);setPrograms([]);setProgram(null);setMode('personal');setAssignedWorkouts([]);setActiveAssignedRecipient(null);setGroupProgramForAssign(null);setClassifications([]);setMemberClassificationIds({});setMemberRosterMeta({});setMemberPerformance(null);
   return;
  }
  bindScreenSessionUser(session.user.id);
  setProfileLoading(true);
  setSelectedTeamId(null);setTeams([]);setMembers([]);setMode('personal');
  boot().finally(()=>setProfileLoading(false));
 },[session?.user?.id]);
 useEffect(()=>{
  if(!profile||activeAssignedRecipient){
   if(appNav==='Training'||appNav==='Dashboard') releaseEnrollmentSyncIfIdle();
   return;
  }
  const context=shellProgramLoadForNav(appNav);
  if(!context)return;
  void loadPrograms(context);
 },[mode,selectedTeamId,teams,profile,viewingMember?.user_id,activeAssignedRecipient?.id,draftEditProgramId,appNav]);
 useLayoutEffect(()=>{
  const key=session?.user&&profile&&(appNav==='Training'||appNav==='Dashboard')&&!activeAssignedRecipient
   ?`${session.user.id}|${appNav}|${selectedTeamId||''}|${profile.followed_program_id||''}`
   :'';
  if(!key||key===enrollmentSyncKeyRef.current)return;
  enrollmentSyncKeyRef.current=key;
  armEnrollmentSync();
 },[session?.user?.id,profile,profile?.followed_program_id,appNav,selectedTeamId,activeAssignedRecipient?.id]);
 useEffect(()=>subscribeEnrollmentSync(()=>{setScheduleRepairGeneration((value)=>value+1);}),[]);
 useLayoutEffect(()=>{
  const pending=exerciseVisualRef.current;
  if(!pending)return;
  const current=findWorkoutInProgram(program,pending.workoutId)||calendarWorkouts.find((workout:any)=>workout.id===pending.workoutId);
  const ids=new Set((current?.st_exercises||[]).map((exercise:any)=>exercise.id));
  const ready=pending.ids.every((id)=>pending.kind==='add'?ids.has(id):!ids.has(id));
  if(!ready)return;
  noteExerciseEditVisual(pending.mark);
  exerciseVisualRef.current=null;
 },[program,calendarWorkouts]);
 useEffect(()=>{if(session?.user?.id) loadAssignedWorkouts()},[session?.user?.id]);
 useEffect(()=>{
  if(viewingMember&&viewingMember.user_id!==session?.user?.id&&memberWorkoutProgram&&session?.user){
   loadLogs(memberWorkoutProgram,viewingMember.user_id,memberWorkoutLogDate);
   return;
  }
  if(session?.user&&!viewingMember) loadLogs(program,session.user.id,logDate);
 },[memberWorkoutProgram,memberWorkoutLogDate,program,logDate,viewingMember?.user_id,session?.user?.id,calendarWorkouts,groupActivityWorkout?.id]);
 useEffect(()=>{
  if(viewingMember&&viewingMember.user_id!==session?.user?.id){
   if(memberWorkoutProgram&&session?.user) loadLiftHistory();
   return;
  }
  if(program&&session?.user) loadLiftHistory();
 },[program,logDate,memberWorkoutProgram,memberWorkoutLogDate,viewingMember?.user_id,session?.user?.id]);
 useEffect(()=>{logsRef.current=logs;},[logs]);
 useEffect(()=>()=>{if(prCelebrationTimerRef.current)clearTimeout(prCelebrationTimerRef.current);},[]);
 useEffect(()=>{
  if(!program||syncingCalendarRef.current||activeAssignedRecipient||viewingMember||draftEditProgramId)return;
  if(loggerProtected())return;
  const start=resolveProgramStartDate(program);
  const total=program.weeks||weeks||6;
  const nextWeek=weekForDate(start,logDate,total);
  if(nextWeek!==week)setWeek(nextWeek);
 },[program?.id,program?.start_date,program?.created_at,program?.weeks,logDate,activeAssignedRecipient?.id,viewingMember?.user_id,draftEditProgramId,trainingSessionOpen]);
 useEffect(()=>{
  if(!program||syncingCalendarRef.current||activeAssignedRecipient||viewingMember||draftEditProgramId)return;
  if(loggerProtected())return;
  if(isPersonalCalendarWorkout(activeWorkout))return;
  const match=workoutForDate(program,logDate,week,workoutDayMovesFromActivities(userCalendarActivities));
  if(match&&match.id!==activeWorkout)setActiveWorkout(match.id);
 },[program?.id,program?.start_date,program?.created_at,program?.weeks,logDate,activeAssignedRecipient?.id,viewingMember?.user_id,draftEditProgramId,userCalendarActivities,trainingSessionOpen]);
 useEffect(()=>{
  if(!session?.user?.id){setUserCalendarReady(false);setUserCalendarError(null);return;}
  if(appNav!=='Training'&&appNav!=='Dashboard')return;
  let cancelled=false;
  const month=appNav==='Dashboard'?yearMonthOf(todayYmd()):trainingCalendarMonth;
  const win=monthWindow(month);
  void fetchUserCalendarActivities(supabase,session.user.id,win.from,win.to).then((r)=>{
   if(cancelled)return;
   setUserCalendarActivities(r.data||[]);
   setUserCalendarError(r.error||null);
   setUserCalendarReady(true);
  }).catch((error:any)=>{
   if(cancelled)return;
   setUserCalendarError(error?.message||'Could not load your calendar.');
   setUserCalendarReady(true);
  });
  return()=>{cancelled=true;};
 },[appNav,trainingCalendarMonth,session?.user?.id,localDate]);
 useEffect(()=>{
  const tick=()=>setLocalDate((prev)=>{const next=todayYmd();return prev===next?prev:next;});
  const id=window.setInterval(tick,60000);
  const onVisible=()=>{
   tick();
   if(document.visibilityState!=='visible'||!session?.user?.id)return;
   markScreenStale(session.user.id,['program','schedule','groups','dashboard','progress']);
  };
  document.addEventListener('visibilitychange',onVisible);
  return()=>{window.clearInterval(id);document.removeEventListener('visibilitychange',onVisible);};
 },[session?.user?.id]);
 useEffect(()=>{
  if(!session?.user?.id||loggerProtected()||viewingWorkoutId)return;
  const userId=session.user.id;
  if((appNav==='Training'||appNav==='Dashboard')&&(isScreenStale(userId,'program')||isScreenStale(userId,'schedule'))){
   const context=shellProgramLoadForNav(appNav);
   if(context) void loadPrograms(context);
  } else if(appNav==='Groups'&&(isScreenStale(userId,'groups')||isScreenStale(userId,'program'))){
   void loadPrograms('setup');
  }
 },[screenSessionTick,appNav,trainingSessionOpen,viewingWorkoutId,session?.user?.id]);
 useEffect(()=>{
  if(typeof window==='undefined')return;
  const onScroll=()=>setBugFabVisible(window.scrollY>120);
  onScroll();
  window.addEventListener('scroll',onScroll,{passive:true});
  return()=>window.removeEventListener('scroll',onScroll);
 },[]);
 useEffect(()=>{setViewingMember(null);setMemberDashboard(null);setMemberWorkoutProgram(null);setMemberWorkoutActiveId('');},[selectedTeamId]);
 useEffect(()=>{if(selectedTeamId&&teams.length){loadMembers();loadMemberAssignments();loadClassifications();}},[selectedTeamId,teams.length]);
 useEffect(()=>{if(members.length&&selectedTeamId)loadMemberStats(); loadMemberClassificationLinks();},[members,selectedTeamId]);

 const activeTeam=teams.find((t:any)=>t.id===selectedTeamId)||teams[0]||null;
 useEffect(()=>{if(profile&&appNav==='Dashboard'){loadProgressLogs();}},[profile,appNav,session?.user?.id]);
 useEffect(()=>{
  if(appNav!=='Settings'||!scrollNutritionGoals)return;
  document.getElementById('nutrition-goals')?.scrollIntoView({block:'start'});
  setScrollNutritionGoals(false);
 },[appNav,scrollNutritionGoals]);
 useEffect(()=>{
  if(appNav!=='Progress'||progressSection!=='body')return;
  const launch=bodyCheckInLaunch;
  if(!shouldOpenBodyCheckIn(launch, bodyCheckInConsumed.current)||!launch)return;
  const node=document.getElementById('body-check-in');
  if(!node)return;
  bodyCheckInConsumed.current=launch.id;
  node.scrollIntoView({block:'start'});
  const field=node.querySelector('input');
  if(field instanceof HTMLElement) field.focus();
  setBodyCheckInLaunch(null);
 },[appNav,progressSection,bodyCheckInLaunch]);
 useEffect(()=>{
  if(!viewingMember||viewingMember.user_id===session?.user?.id)return;
  void reloadMemberWorkoutProgram(viewingMember,memberAssignments);
 },[memberAssignments,viewingMember?.user_id,activeTeam?.default_program_id]);
 useEffect(()=>{
  if(!groupAssignLoadForNav(appNav))return;
  if(activeTeam&&canManageGroup(activeTeam.my_role)) loadGroupProgramForAssign();
  else {setGroupProgramForAssign(null);setAssignWorkoutPrograms([]);}
 },[activeTeam?.id,activeTeam?.default_program_id,activeTeam?.my_role,appNav]);
 // Re-resolve Training after assignments load so individual assigns don't get overwritten by “newest published”
 useEffect(()=>{
  if(!session?.user||mode!=='team'||!activeTeam)return;
  if(appNav!=='Training'&&appNav!=='Dashboard'&&appNav!=='Groups')return;
  if(draftEditProgramId)return;
  void loadPrograms('training');
 },[memberAssignments,activeTeam?.default_program_id,mode,session?.user?.id]);
 useEffect(()=>{
  if(!session?.user||appNav!=='Dashboard')return;
  let cancelIdle=()=>{};
  const cancelWait=afterScreenUsable('Dashboard',()=>{
    cancelIdle=scheduleIdlePreload(()=>{
      preloadLazyScreen(nutritionScreenLoader);
      preloadLazyScreen(trainingScheduleLoader);
    });
  });
  return()=>{cancelWait();cancelIdle();};
 },[session?.user?.id,appNav]);

 async function boot(){await loadProfile(); await loadTeams(); await loadCatalog();}
 async function loadCatalog(){if(!session?.user)return; const{data,error}=await fetchAllExerciseCatalog(supabase); if(error){setCatalogError(error); return console.warn(error);} setCatalogError(''); setCatalog(data||[]);}
 async function loadGuidedImportStatus(){if(!session?.access_token)return; try{const res=await fetch('/api/catalog/import-guided',{headers:{Authorization:`Bearer ${session.access_token}`}}); const data=await res.json().catch(()=>({})); if(!res.ok)throw new Error(data?.error||`Status check failed (${res.status})`); setGuidedImportStatus(data);}catch(e:any){setGuidedImportStatus({canImport:false,guidedCount:0,message:e?.message||'Could not check import status.'});}}
 async function loadMasterImportStatus(){if(!session?.access_token)return; try{const res=await fetch('/api/catalog/import-master',{headers:{Authorization:`Bearer ${session.access_token}`}}); const data=await res.json().catch(()=>({})); if(!res.ok)throw new Error(data?.error||`Status check failed (${res.status})`); setMasterImportStatus(data);}catch(e:any){setMasterImportStatus({canImport:false,masterCount:0,message:e?.message||'Could not check master import status.'});}}
 async function importMasterCatalog(){if(!session?.access_token)return alert('Sign in first.'); if(masterImportRunning)return; if(!confirm('Import the BuildIQ Master Library? This adds ~260 exercises, remaps current plan catalog links, and archives the old GIF library. Workout names, sets, and history snapshots stay as they are.'))return; setMasterImportRunning(true); try{const res=await fetch('/api/catalog/import-master',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({})}); const data=await res.json().catch(()=>({})); const extra=(data?.stats?.errorMessages||[]).slice(0,6).join('\n'); if(!res.ok)throw new Error([data?.error||`Import failed (${res.status})`,extra].filter(Boolean).join('\n')); alert([data?.message||'Master library imported.',extra].filter(Boolean).join('\n\n')); await loadCatalog(); await loadMasterImportStatus(); await loadGuidedImportStatus();}catch(e:any){const msg=e?.message||'Import failed.'; alert(/failed to fetch|network|timeout|unexpected end of json/i.test(msg)?'Import timed out or lost the connection. Wait a minute, refresh Settings, and try again. The next run is faster once master rows already exist.':msg);}finally{setMasterImportRunning(false);}}
 async function downloadCatalogCsv(){if(!session?.access_token)return alert('Sign in first.'); try{const res=await fetch('/api/catalog/export',{headers:{Authorization:`Bearer ${session.access_token}`}}); if(!res.ok){const data=await res.json().catch(()=>({})); throw new Error(data?.error||`Download failed (${res.status})`);} const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`builtiq-exercise-catalog-${todayYmd()}.csv`; a.click(); URL.revokeObjectURL(url);}catch(e:any){alert(e?.message||'Could not download catalog.');}}
 async function runCatalogDedupe(){
  if(!session?.access_token)return alert('Sign in first.');
  if(catalogDedupeRunning)return;
  if(!confirm('Merge duplicate catalog exercises (e.g. Pull Up / Pull-ups)? Entries with logged history are kept — only unused duplicates are archived.'))return;
  setCatalogDedupeRunning(true);
  try{
   const res=await fetch('/api/catalog/dedupe',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`}});
   const data=await res.json().catch(()=>({}));
   if(!res.ok)throw new Error(data?.error||`Dedupe failed (${res.status})`);
   alert(data?.message||'Catalog dedupe finished.');
   await loadCatalog();
  }catch(e:any){alert(e?.message||'Catalog dedupe failed.');}
  finally{setCatalogDedupeRunning(false);}
 }
 const historyAliases=(catalogId:string,name:string)=>catalogHistoryAliasKeys(catalog,catalogId,name);
 async function signIn(){
  const configError=getSupabaseConfigError();
  if(configError)return alert(configError);
  try{
   const{error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
   if(error)return alert(friendlyAuthError(error.message));
   if(typeof window!=='undefined'){
    if(rememberEmail)localStorage.setItem(REMEMBER_EMAIL_KEY,email.trim());
    else localStorage.removeItem(REMEMBER_EMAIL_KEY);
   }
  }catch(e:any){
   alert(friendlyAuthError(e?.message||e?.toString?.()));
  }
 }
 async function signUp(){
  const configError=getSupabaseConfigError();
  if(configError)return alert(configError);
  if(password.length<6)return alert('Password must be at least 6 characters.');
  if(password!==confirmPassword)return alert('Passwords do not match.');
  const name=String(profileDraft.display_name||'').trim();
  if(!name)return alert('Enter your name.');
  if(!profileDraft.height_inches||!profileDraft.weight_lbs)return alert('Enter height and weight.');
  try{
   const{data,error}=await supabase.auth.signUp({email:email.trim(),password});
   if(error)return alert(friendlyAuthError(error.message));
   if(typeof window!=='undefined'&&rememberEmail)localStorage.setItem(REMEMBER_EMAIL_KEY,email.trim());
   if(data.session){await saveProfile(true);return;}
   alert('Account created. Confirm your email, then sign in to finish profile setup.');
   setAuthMode('signin');
  }catch(e:any){
   alert(friendlyAuthError(e?.message||e?.toString?.()));
  }
 }
 async function loadProfile(){
  if(!session?.user)return;
  const{data}=await supabase.from('st_profiles').select('*').eq('user_id',session.user.id).maybeSingle();
  if(data){setProfile(data);setDisplayName(data.display_name||'Me');setProfileDraft(emptyProfileDraft(data));}
  else{setProfile(null);setProfileDraft(emptyProfileDraft());}
 }
 async function saveProfile(markComplete=true){
  if(!session?.user)return alert('Sign in first.');
  const name=String(profileDraft.display_name||'').trim();
  if(!name)return alert('Enter your name.');
  if(markComplete&&(!profileDraft.height_inches||!profileDraft.weight_lbs))return alert('Enter height and weight.');
  setProfileSaving(true);
  const{error}=await supabase.from('st_profiles').upsert({
   user_id:session.user.id,
   display_name:name,
   height_inches:profileDraft.height_inches?Number(profileDraft.height_inches):null,
   weight_lbs:profileDraft.weight_lbs?Number(profileDraft.weight_lbs):null,
   birth_year:profileDraft.birth_year?Number(profileDraft.birth_year):null,
   sex:profileDraft.sex||null,
   experience_level:profileDraft.experience_level||null,
   primary_goal:profileDraft.primary_goal||null,
   units_preference:profileDraft.units_preference||'imperial',
   available_equipment:normalizeEquipmentList(profileDraft.available_equipment),
   ui_theme:DEFAULT_THEME_ID,
   profile_completed:markComplete,
  });
  setProfileSaving(false);
  if(error)return alert(error.message);
  await loadProfile();
 }
 async function createProfile(){await saveProfile(true);}
 async function signOut(){
  try{
   clearScreenSession();
   setProfileLoading(false);
   setProfile(null);
   setPrograms([]);
   setProgram(null);
   setMembers([]);
   setTeams([]);
   setSelectedTeamId(null);
   setLogs({});
   setMemberDashboard(null);
   setViewingMember(null);
   setMemberWorkoutProgram(null);
   setMemberWorkoutActiveId('');
   setAddExercisePanel(null);
   setSession(null);
   const{error}=await supabase.auth.signOut();
   if(error)console.warn(error.message);
  }catch(e:any){
   console.warn(e?.message||e);
   setSession(null);
  }
 }
 async function loadTeams(){
  if(!session?.user)return;
  const[{data:memberRows},{data:profileRow}]=await Promise.all([
    supabase.from('st_team_members').select('*, st_teams(*)').eq('user_id',session.user.id).eq('status','active'),
    supabase.from('st_profiles').select('default_team_id').eq('user_id',session.user.id).maybeSingle(),
  ]);
  const ts=(memberRows||[]).map((m:any)=>m.st_teams&&!m.st_teams.is_archived?{...m.st_teams,my_role:m.role,training_source:m.training_source||'team',membership_id:m.id,is_active_participant:m.is_active_participant!==false}:null).filter(Boolean).sort((a:any,b:any)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'}));
  setTeams(ts);
  if(session?.user?.id) markScreenStale(session.user.id,['groups']);
  const defaultId=profileRow?.default_team_id||profile?.default_team_id||null;
  setSelectedTeamId((prev)=>{
    if(prev&&ts.some((t:any)=>t.id===prev))return prev;
    if(defaultId&&ts.some((t:any)=>t.id===defaultId))return defaultId;
    return ts[0]?.id||null;
  });
 }
 function selectTeam(teamId:string|null){setSelectedTeamId(teamId||null);}
 async function setDefaultTeam(teamId:string){
  if(!session?.user||!teamId)return;
  if(!teams.some((t:any)=>t.id===teamId))return alert('You are not a member of that group.');
  const{error}=await supabase.from('st_profiles').update({default_team_id:teamId}).eq('user_id',session.user.id);
  if(error){
   if(String(error.message||'').includes('default_team_id'))return alert('Run migration 20250813_041_profile_default_team.sql in Supabase first.');
   return alert(error.message);
  }
  setProfile((p:any)=>p?{...p,default_team_id:teamId}:p);
  selectTeam(teamId);
 }
 async function createTeam(payload?:string|{name?:string;invites?:{email:string;displayName:string;role:'member'|'manager'}[]}){
  const groupName=(typeof payload==='string'?payload:payload?.name||'').trim()||'My Team';
  const invites=typeof payload==='string'?[]:(payload?.invites||[]);
  const code=makeInviteCode();
  const{data:t,error}=await supabase.from('st_teams').insert({name:groupName,invite_code:code,owner_user_id:session.user.id}).select().single();
  if(error)throw new Error(error.message);
  const{error:me}=await supabase.from('st_team_members').insert({team_id:t.id,user_id:session.user.id,display_name:displayName,role:'owner'});
  if(me)throw new Error(me.message);
  let inviteSummary='';
  if(invites.length&&session?.access_token){
   try{
    const res=await fetch('/api/groups/invite',{
     method:'POST',
     headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
     body:JSON.stringify({teamId:t.id,invites,appUrl:typeof window!=='undefined'?window.location.origin:undefined}),
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok){
     inviteSummary=data?.error||'Team created, but invites could not be sent.';
    } else if(data.emailed){
     inviteSummary=`Sent ${data.emailed} invitation email${data.emailed===1?'':'s'}.`;
    } else if(data.created){
     inviteSummary=`Saved ${data.created} invitation${data.created===1?'':'s'}, but the email was not sent. Open Members and use Resend.`;
    }
   }catch(e:any){
    inviteSummary=e?.message||'Team created, but invites could not be sent.';
   }
  }
  await loadTeams();
  setMode('team');
  setSelectedTeamId(t.id);
  setAppNav('Groups');
  return {inviteCode:code,inviteSummary};
 }
 async function joinTeam(code?:string){
  const inviteCode=(code||'').trim();
  if(!inviteCode)throw new Error('Invite code required');
  const{data:t,error}=await supabase.rpc('st_join_team_by_invite',{p_invite_code:inviteCode,p_display_name:displayName});
  if(error||!t)throw new Error(error?.message||'Team not found');
  const teamId=typeof t==='object'&&t&&'id' in t?String((t as any).id):null;
  await loadTeams();
  setMode('team');
  setSelectedTeamId(teamId||(t as any)?.id);
  setAppNav('Groups');
 }
 async function loadMembers(){if(!activeTeam)return; const{data}=await supabase.from('st_team_members').select('*').eq('team_id',activeTeam.id).eq('status','active').order('created_at'); setMembers(data||[])}
 async function loadMemberStats(){
  if(!activeTeam||!members.length||!session?.user){setMemberStats({});setMemberRosterMeta({});return;}
  const canViewAll=canViewGroupMemberProgress(activeTeam.my_role, groupPermissionFlags(activeTeam));
  const ids=groupProgressSubjectIds(session.user.id, members.map((m:any)=>m.user_id), canViewAll);
  const{monday:weekStartStr,sunday:weekEndStr}=currentCalendarWeekBounds();
  const scoped=await fetchGroupScopedSetLogs(supabase,activeTeam.id,ids,{from:weekStartStr,to:weekEndStr,limit:2000});
  const stats:any={};
  (scoped.data||[]).forEach((r:any)=>{if(!stats[r.user_id])stats[r.user_id]={sets:0,days:new Set()}; stats[r.user_id].sets++; stats[r.user_id].days.add(r.log_date);});
  setMemberStats(Object.fromEntries(Object.entries(stats).map(([k,v]:any)=>[k,{sets:v.sets,days:v.days.size}])));
  if(canViewAll){
    const rosterMeta=await loadMemberRosterMeta(supabase,activeTeam.id,ids);
    setMemberRosterMeta(rosterMeta);
  } else {
    setMemberRosterMeta({});
  }
 }
 async function loadMemberAssignments():Promise<Record<string,any>>{
  if(!activeTeam){setMemberAssignments({});return {};}
  const{data}=await supabase.from('st_program_assignments').select('*, st_programs(name)').eq('team_id',activeTeam.id).eq('is_active',true);
  const by:any={};
  (data||[]).forEach((a:any)=>{by[a.user_id]=a;});
  setMemberAssignments(by);
  return by;
 }
 async function assignMemberProgram(member:any,assignmentType:string,programId?:string|null,notes?:string,options?:{quiet?:boolean}):Promise<string|null>{
  if(!activeTeam||!canManageGroupView()){
   const msg='Only owners and managers can assign programs.';
   if(!options?.quiet)alert(msg);
   return msg;
  }
  const trimmedType=String(assignmentType||'team').trim();
  const trimmedId=String(programId||'').trim();
  const resolvedProgramId=(trimmedType==='individual_team'||trimmedType==='manual')&&trimmedId?trimmedId:null;
  if((trimmedType==='individual_team'||trimmedType==='manual')&&!resolvedProgramId){
   const msg='Select a published program for this assignment type.';
   if(!options?.quiet)alert(msg);
   return msg;
  }
  const{error}=await supabase.rpc('st_assign_member_program',{
   p_team_id:activeTeam.id,
   p_member_user_id:member.user_id,
   p_assignment_type:trimmedType,
   p_program_id:resolvedProgramId,
   p_notes:notes?.trim()||null,
   p_coaching_metadata:{},
  });
  if(error){
   const raw=error.message||'Could not assign program.';
   let msg=raw;
   if(/could not find the function|schema cache/i.test(raw)){
    msg='Apply assignment needs a Supabase update. In Supabase → SQL Editor, run migration 20250804_038_drop_assign_member_program_overload.sql (or 20250804_036), then try again.';
   } else if(/could not choose the best candidate function/i.test(raw)){
    msg='Apply assignment needs a Supabase update. In Supabase → SQL Editor, run migration 20250804_038_drop_assign_member_program_overload.sql, then try again.';
   } else if(/not authorized/i.test(raw)){
    msg='Not authorized to assign programs. Confirm you are an Owner or Manager on this group, then run Supabase migration 20261005_054 if this keeps failing.';
   } else if(/select a program/i.test(raw)){
    msg='Select a published program before assigning a different plan.';
   }
   if(!options?.quiet)alert(msg);
   return msg;
  }
  if(session?.user?.id) markScreenStale(session.user.id,['program','schedule','groups','dashboard','progress']);
  await loadMembers();
  const freshAssignments=await loadMemberAssignments();
  if(memberDashboard?.user_id===member.user_id)await loadMemberDashboardData(member,freshAssignments);
  if(viewingMember?.user_id===member.user_id)await reloadMemberWorkoutProgram(member,freshAssignments);
  if(mode==='team')await loadPrograms('training',{assignmentsOverride:freshAssignments});
  if(!options?.quiet)alert(`Program assignment updated for ${member.display_name||'member'}.`);
  return null;
 }
 async function reloadMemberWorkoutProgram(member:any,assignmentsOverride?:Record<string,any>){
  if(!member||!activeTeam)return;
  const usePersonal=(member.training_source||'team')==='personal';
  const{data:index,error:indexErr}=await fetchProgramIndex(supabase,{personal:usePersonal,teamId:activeTeam.id,ownerUserId:member.user_id,publishedOnly:true});
  if(indexErr)console.warn(indexErr);
  const pickedMeta=pickProgramForMember(index||[],member,!usePersonal?activeTeam?.default_program_id:null,assignmentsOverride);
  if(!pickedMeta?.id){
   setMemberWorkoutProgram(null);
   setMemberWorkoutWeek(1);
   setMemberWorkoutLogDate(today());
   setMemberWorkoutActiveId('');
   return;
  }
  const{data:full,error:fullErr}=await fetchFullProgram(supabase,pickedMeta.id);
  if(fullErr||!full){
   if(fullErr)console.warn(fullErr);
   setMemberWorkoutProgram(null);
   return;
  }
  setMemberWorkoutProgram(full);
  const start=resolveProgramStartDate(full);
  const initialDate=memberWorkoutLogDate||today();
  const initialWeek=weekForDate(start,initialDate,full.weeks||weeks||6);
  const dayLabel=dayLabelFromYmd(initialDate);
  const match=(full.st_workouts||[]).find((w:any)=>w.week===initialWeek&&w.day_label===dayLabel)
   ||(full.st_workouts||[]).filter((w:any)=>w.week===initialWeek).sort((a:any,b:any)=>a.day_order-b.day_order)[0]
   ||full.st_workouts?.sort((a:any,b:any)=>a.week-b.week||a.day_order-b.day_order)?.[0];
  if(memberWorkoutActiveId&&!(full.st_workouts||[]).some((w:any)=>w.id===memberWorkoutActiveId)){
   setMemberWorkoutActiveId(match?.id||'');
   setMemberWorkoutWeek(initialWeek);
  } else if(!memberWorkoutActiveId&&match){
   setMemberWorkoutActiveId(match.id);
   setMemberWorkoutWeek(initialWeek);
  }
  if(viewingMember?.user_id===member.user_id){
   await loadLogs(full,member.user_id,memberWorkoutLogDate||initialDate);
  }
 }
 function pickProgramForMember(list:any[],member:any,defaultId?:string|null,assignmentsOverride?:Record<string,any>){
  const assignments=assignmentsOverride??memberAssignments;
  const assignment=assignments[member?.user_id];
  // Individual / manual override — only this member
  if(assignment?.program_id&&(assignment.assignment_type==='individual_team'||assignment.assignment_type==='manual')){
   const hit=list.find((p:any)=>p.id===assignment.program_id);
   if(hit)return hit;
  }
  // Follow team plan — only the explicit team default. Never fall back to newest
  // published (that made “assign to one member” look like the whole group moved).
  if(defaultId){
   const hit=list.find((p:any)=>p.id===defaultId);
   if(hit)return hit;
  }
  return null;
 }
 function canManageGroupView(){return !!activeTeam&&canManageGroup(activeTeam.my_role);}
 function canLog(){if(!session?.user)return false; const uid=viewingMember?.user_id||session.user.id; return canLogWorkout(session.user.id,uid,activeTeam?.my_role);}
 function isPersonalCalendarWorkout(workoutId?:string|null){return !!workoutId&&calendarWorkouts.some((w:any)=>w.id===workoutId);}
 function findWorkoutAnywhere(workoutId?:string|null){if(!workoutId)return null;return findWorkoutInProgram(program,workoutId)||calendarWorkouts.find((w:any)=>w.id===workoutId)||null;}
 function isSharedTemplateEditor(){return !!draftEditProgramId||appNav==='Programs'||appNav==='Groups';}
 function canEdit(){if(!session?.user)return false; if(activeAssignedRecipient)return assignedHasPersonalCopy(activeAssignedRecipient); if(viewingMember&&viewingMember.user_id!==session.user.id)return false; if(isPersonalCalendarWorkout(activeWorkout))return true; if(program?.visibility==='personal'&&program.owner_user_id===session.user.id)return true; if(isLiveGroupProgram(program)&&!isSharedTemplateEditor())return true; if(program?.visibility==='team'){const team=teams.find((t:any)=>t.id===program.team_id)||activeTeam;return canEditSharedGroupProgram(team?.my_role,groupPermissionFlags(team));} return mode==='personal'||canEditGroupProgram(activeTeam?.my_role);}
 function isOwner(){return isGroupOwner(activeTeam?.my_role);}
 function logUserId(){return viewingMember?.user_id||session?.user?.id;}
 function extraWorkoutsForLogging(){
  if(viewingMember&&viewingMember.user_id!==session?.user?.id)return [];
  const extras=[...calendarWorkouts];
  const candidates=[findWorkoutAnywhere(activeWorkout),planEditRef.current?.workout].filter(Boolean);
  for(const current of candidates){
    const idx=extras.findIndex((w:any)=>w.id===current.id);
    const currentCount=(current.st_exercises||[]).length;
    if(idx<0) extras.push(current);
    else if(currentCount>(extras[idx].st_exercises||[]).length) extras[idx]=current;
  }
  const activityWorkout=groupActivityWorkoutRef.current;
  if(activityWorkout?.id){
    const idx=extras.findIndex((w:any)=>w.id===activityWorkout.id);
    if(idx<0) extras.push(activityWorkout);
    else extras[idx]=activityWorkout;
  }
  return [...exerciseWriteHoldRef.current,...extras];
 }
 function activeProgramForLogging(){
  if(viewingMember&&viewingMember.user_id!==session?.user?.id&&memberWorkoutProgram)return memberWorkoutProgram;
  return program;
 }
 function activeLogDateForLogging(){
  if(viewingMember&&viewingMember.user_id!==session?.user?.id&&memberWorkoutProgram)return memberWorkoutLogDate;
  return logDate;
 }
 function pickProgram(list:any[],defaultId?:string|null,opts?:{teamDefault?:boolean}){
  const published=list.filter((p:any)=>isPublishedProgram(p));
  if(!published.length)return null;
  if(defaultId){
   const match=published.find((p:any)=>p.id===defaultId);
   if(match)return match;
   // Team default missing/stale: do not silently use newest published
   if(opts?.teamDefault)return null;
  }
  if(opts?.teamDefault)return null;
  return published[0]||null;
 }
 function programLoadContext():'training'|'setup'{
  if(appNav==='Groups'&&activeTeam)return 'setup';
  return draftEditProgramId?'setup':'training';
 }
 function findWorkoutInProgram(prog:any,workoutId:string){return (prog?.st_workouts||[]).find((w:any)=>w.id===workoutId)||null;}
 function defaultSetupWorkout(prog:any){return (prog?.st_workouts||[]).slice().sort((a:any,b:any)=>a.week-b.week||a.day_order-b.day_order)[0]||null;}
 function loggerProtected(){
  return activeWorkoutIsProtected(trainingSessionOpenRef.current,Object.keys(upsertQueueRef.current).length>0);
 }
 function alignEditorCalendar(prog:any,workoutId:string){
  if(loggerProtected())return;
  const w=findWorkoutInProgram(prog,workoutId)||defaultSetupWorkout(prog);
  if(!w||!prog)return;
  syncingCalendarRef.current=true;
  const start=resolveProgramStartDate(prog);
  setWeek(w.week);
  setLogDate(dateForWeekAndDay(start,w.week,w.day_label));
  setActiveWorkout(w.id);
  queueMicrotask(()=>{syncingCalendarRef.current=false;});
 }
 async function loadPrograms(context:'training'|'setup'='training',options?:{assignmentsOverride?:Record<string,any>;editProgramId?:string|null;preserveWorkoutId?:string|null;followedProgramId?:string|null;nav?:string}){
  const editTargetId=options?.editProgramId??draftEditProgramId;
  if(editTargetId)context='setup';
  const nav=options?.nav??appNav;
  if(nav==='Groups'&&activeTeam)context='setup';
  const run=async()=>{
  if(!session?.user)return;
  if(activeAssignedRecipient){setTrainingScheduleReady(true);setProgramTreeReady(true);return;}
  if(viewingMember&&viewingMember.user_id!==session.user.id){setTrainingScheduleReady(true);setProgramTreeReady(true);return;}
  let followedForKey=profile?.followed_program_id||null;
  if(options&&Object.prototype.hasOwnProperty.call(options,'followedProgramId'))followedForKey=options.followedProgramId||null;
  const key=programLoadKey({
   context,
   userId:session.user.id,
   teamId:activeTeam?.id||null,
   mode,
   followedProgramId:followedForKey,
   editProgramId:editTargetId||null,
   preserveWorkoutId:options&&Object.prototype.hasOwnProperty.call(options,'preserveWorkoutId')?(options.preserveWorkoutId||null):null,
   assignmentKey:assignmentLoadKey(options?.assignmentsOverride||memberAssignments),
  });
  return programLoadGateRef.current.begin(key,(gen)=>{
   const live=()=>programLoadGateRef.current.isCurrent(gen);
   noteProgramLoad();
   return loadProgramGeneration(context,nav,editTargetId,options,live);
  });
  };
  if(context==='training') return trackTrainingLoad(run);
  return run();
 }
 async function loadProgramGeneration(context:'training'|'setup',nav:string,editTargetId:string|null,options:{assignmentsOverride?:Record<string,any>;editProgramId?:string|null;preserveWorkoutId?:string|null;followedProgramId?:string|null;nav?:string}|undefined,live:()=>boolean){
  const epochAtStart=exerciseEditEpochRef.current;
  if(loggerProtected()){
   if(session?.user?.id) markScreenStale(session.user.id,['program','schedule','groups','dashboard','progress']);
   setTrainingScheduleReady(true);setProgramTreeReady(true);
   if(nav==='Training'||nav==='Dashboard') completeScreenPhase(nav,'program');
   return;
  }
  if(context==='training')setTrainingScheduleReady(true);
  if(options&&Object.prototype.hasOwnProperty.call(options,'followedProgramId')&&session?.user?.id){
   markScreenStale(session.user.id,['groups','dashboard','progress']);
  }
  let followedId=profile?.followed_program_id||null;
  if(options&&Object.prototype.hasOwnProperty.call(options,'followedProgramId'))followedId=options.followedProgramId||null;
  // Members: auto-enroll in the date-active group plan (Training calendar follows plan dates).
  if(context==='training'&&teams.length){
   const orderedTeams=orderGroupsForEnrollment(teams, profile?.default_team_id||null);
   for(const team of orderedTeams){
    if(!live())return;
    if(!isAutoEnrolledMemberRole(team.my_role))continue;
    const{data:groupPrograms}=await fetchDesignPrograms(supabase,{scope:'group',ownerUserId:session.user.id,teamId:team.id});
    if(!live())return;
    const{data:personalPrograms}=await fetchDesignPrograms(supabase,{scope:'personal',ownerUserId:session.user.id});
    if(!live())return;
    const{data:assignmentRow,error:assignmentErr}=await supabase.from('st_program_assignments').select('program_id, assignment_type').eq('team_id',team.id).eq('user_id',session.user.id).eq('is_active',true).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(!live())return;
    const sync=await syncMemberGroupEnrollment(supabase,{
     userId:session.user.id,
     role:team.my_role,
     groupPrograms:groupPrograms||[],
     personalPrograms:personalPrograms||[],
     followedProgramId:followedId,
     teamId:team.id,
     ...(assignmentErr?{}:{
      defaultProgramId:team.default_program_id||null,
      assignment:assignmentRow?{programId:assignmentRow.program_id,assignmentType:assignmentRow.assignment_type}:null,
     }),
    });
    if(!live())return;
    if(sync.changed&&sync.programId){
     followedId=sync.programId;
     setProfile((p:any)=>p?{...p,followed_program_id:sync.programId}:p);
     markScreenStale(session.user.id,['groups','dashboard','progress','schedule']);
    }
   }
  }
  if(!live())return;
  const usePersonal=context==='training'?true:mode==='personal';
  const{data:index,error:indexErr}=await fetchProgramIndex(supabase,{
   personal:usePersonal,
   teamId:activeTeam?.id,
   ownerUserId:session.user.id,
   publishedOnly:context==='training'&&!followedId,
  });
  if(!live())return;
  if(indexErr){setTrainingScheduleReady(true);setProgramTreeReady(true);return alert(indexErr);}
  if(activeAssignedRecipient){setTrainingScheduleReady(true);setProgramTreeReady(true);return;}
  if(viewingMember&&viewingMember.user_id!==session.user.id){setTrainingScheduleReady(true);setProgramTreeReady(true);return;}
  let list=index||[];
  setPrograms(list);
  // Training uses only the followed program — never fall back to "newest published"
  // after unfollow (followed_program_id null), or the plan keeps showing in Training.
  let pickedMeta=context==='setup'
   ?((editTargetId&&list.find((p:any)=>p.id===editTargetId))
     ||list.find((p:any)=>isDraftProgram(p))
     ||(program&&list.some((p:any)=>p.id===program.id)?list.find((p:any)=>p.id===program.id):null)
     ||list.find((p:any)=>isPublishedProgram(p))
     ||list[0]
     ||null)
   :followedId
     ?(list.find((p:any)=>p.id===followedId)||null)
     :null;
  let pickedFull:any=null;
  if(context==='training'&&followedId&&!pickedMeta){
   const followed=await fetchFullProgram(supabase,followedId);
   if(!live())return;
   if(followed.data)pickedMeta=followed.data;
  }
  if(pickedMeta?.id){
   const{data:full,error:fullErr}=await fetchFullProgram(supabase,pickedMeta.id);
   if(!live())return;
   if(fullErr){setTrainingScheduleReady(true);setProgramTreeReady(true);return alert(fullErr);}
   pickedFull=full;
   setPrograms(mergeFullProgramIntoList(list,pickedFull));
  }
  if(!live())return;
  if(programApplyBlocked({loggerProtected:loggerProtected(),workoutOpen:trainingSessionOpenRef.current||!!viewingWorkoutRef.current,epochAtStart,epochNow:exerciseEditEpochRef.current})){
   if(session?.user?.id) markScreenStale(session.user.id,['program','schedule','dashboard']);
   setTrainingScheduleReady(true);setProgramTreeReady(true);
   if(nav==='Training'||nav==='Dashboard') completeScreenPhase(nav,'program');
   return;
  }
  setProgram(pickedFull||null);
  if(pickedFull&&context==='setup'&&editTargetId&&pickedFull.id===editTargetId){
   if(draftNameSourceRef.current!==pickedFull.id){
    setProgramName(pickedFull.name||'Strength Program');
    draftNameSourceRef.current=pickedFull.id;
   }
  } else if(!editTargetId){
   draftNameSourceRef.current=null;
  }
  if(pickedFull){
    if(context==='setup'){
     setWeeks(pickedFull.weeks||weeks||6);
     setProgramStartDate(resolveProgramStartDate(pickedFull));
     const preserveId=options?.preserveWorkoutId||activeWorkout;
     const keep=preserveId&&findWorkoutInProgram(pickedFull,preserveId)?preserveId:(defaultSetupWorkout(pickedFull)?.id||'');
     if(keep)alignEditorCalendar(pickedFull,keep);
     else setActiveWorkout('');
    } else {
    const start=resolveProgramStartDate(pickedFull);
    const alignedWeek=weekForDate(start,logDate,pickedFull.weeks||weeks||6);
    setWeek(alignedWeek);
     const preserveId=options&&Object.prototype.hasOwnProperty.call(options,'preserveWorkoutId')?options.preserveWorkoutId||null:(trainingSessionOpen?activeWorkout:null);
    const dayLabel=dayLabelFromYmd(logDate);
    const match=(pickedFull.st_workouts||[]).find((w:any)=>w.week===alignedWeek&&w.day_label===dayLabel)
      ||(pickedFull.st_workouts||[]).filter((w:any)=>w.week===alignedWeek).sort((a:any,b:any)=>a.day_order-b.day_order)[0]
      ||pickedFull.st_workouts?.sort((a:any,b:any)=>a.week-b.week||a.day_order-b.day_order)?.[0];
    const preserveExists=!!preserveId&&(!!findWorkoutInProgram(pickedFull,preserveId)||calendarWorkouts.some((w:any)=>w.id===preserveId));
    if(preserveExists)setActiveWorkout(preserveId);
    else if(match)setActiveWorkout(match.id);
    if(live())checkHistoryRestoreOffer(pickedFull);
    const planned=await fetchProgramActivities(supabase,pickedFull.id);
    if(!live())return;
    setTrainingActivities(mergeProgramActivities(pickedFull,planned.data||[],pickedFull.st_workouts||[]));
    }
  } else {
    setActiveWorkout('');
    setTrainingActivities([]);
  }
  if(context==='training'&&session?.user?.id){
    const win=monthWindow(yearMonthOf(logDate));
    const cal=await fetchUserCalendarActivities(supabase,session.user.id,win.from,win.to);
    if(!live())return;
    setUserCalendarActivities(cal.data||[]);
    setUserCalendarError(cal.error||null);
    setUserCalendarReady(true);
    const linkedIds=(cal.data||[]).map((a)=>a.workout_id).filter(Boolean) as string[];
    const extraIds=linkedIds.filter((id)=>!(pickedFull?.st_workouts||[]).some((w:any)=>w.id===id));
    const extras=await fetchWorkoutsByIds(supabase,extraIds);
    if(!live())return;
    setCalendarWorkouts(extras.data||[]);
  }
  if(!live())return;
  if(session?.user?.id) clearScreenStale(session.user.id,['program','schedule']);
  setTrainingScheduleReady(true);setProgramTreeReady(true);
  if(nav==='Training'||nav==='Dashboard') completeScreenPhase(nav,'program');
 }
 async function openMemberDashboard(member:any){
  if(!member||!session?.user)return;
  if(member.user_id!==session.user.id&&!canManageGroupView()){
   return alert('Only owners and managers can view another member.');
  }
  setMemberDashboard(member);
  setViewingMember(null);
  setMemberPerformance(null);
  await refreshMemberPerformance(member);
 }
 async function logOwnGroupWorkout(input:{memberUserId:string;expectationId:string;workoutId:string;programId:string;scheduledDate:string;sourceKey:string;teamId?:string|null}){
  const returning=groupLogReturnFromRequest({...input,sessionUserId:session?.user?.id||'',teamId:input.teamId||activeTeam?.id||null});
  if(!returning)return;
  setViewingMember(null);
  setAppNav('Training');
  setTrainingSubNav('personal');
  await startScheduledWorkout({
   expectationId:input.expectationId,
   workoutId:input.workoutId,
   programId:input.programId,
   scheduledDate:input.scheduledDate,
   sourceKey:input.sourceKey,
   teamId:returning.teamId,
  });
  setGroupLogReturn(returning);
 }
 async function logOwnGroupActivity(input:GroupActivityLogRequest){
  const returning=groupActivityLogReturn({...input,sessionUserId:session?.user?.id||''});
  if(!returning)return;
  const loaded=await fetchWorkoutsByIds(supabase,[input.workoutId]);
  const workoutRow=loaded.data?.[0];
  if(!workoutRow){alert(loaded.error||'Could not open that workout.');return;}
  setViewingMember(null);
  setAppNav('Training');
  setTrainingSubNav('personal');
  await startTrainingSession(input.workoutId,input.scheduledDate,'log');
  setGroupActivityWorkout(workoutRow);
  setGroupActivityLog({
   teamId:input.teamId,
   memberUserId:input.memberUserId,
   workoutId:input.workoutId,
   seriesId:input.seriesId,
   originalDate:input.originalDate,
   scheduledDate:input.scheduledDate,
   returnTo:input.returnTo,
  });
  setGroupLogReturn(returning);
  setActiveExpectationId(null);
  setActiveExpectationSource(null);
  setActiveExpectationDate(null);
 }
 function closeTrainingLogger(){
  setSessionFeedbackExpanded(false);
  setTrainingSessionOpen(false);
  setTrainingSessionIntent('log');
  setGroupActivityLog(null);
  setGroupActivityWorkout(null);
  if(trainingLoggerBack(groupLogReturn)==='group'&&groupLogReturn){
   setGroupTrainingResume(groupLogReturn);
   setGroupLogReturn(null);
   setAppNav('Groups');
   return;
  }
  setGroupLogReturn(null);
  restoreFollowedCalendar();
 }
 async function refreshMemberPerformance(member?:any){
  const target=member||memberDashboard;
  if(!target||!activeTeam)return;
  if(!canManageGroupView()&&target.user_id!==session?.user?.id)return;
  setMemberPerformanceLoading(true);
  try{
   const performance=await loadMemberPerformanceBundle(supabase,target.user_id,activeTeam.id);
   setMemberPerformance(performance);
  } finally {
   setMemberPerformanceLoading(false);
  }
 }
 async function restoreMemberLoggedHistory(){
  if(!memberDashboard||!activeTeam||!canManageGroupView()||memberHistoryRestoreBusy)return;
  const programForMember=memberDashProgram||program;
  if(!programForMember){
   return alert('Assign or open a published program for this member first, then restore history onto it.');
  }
  const ok=window.confirm(
   `Reconnect completed sets for ${memberDashboard.display_name||'this member'} onto "${programForMember.name||'the current program'}"?\n\nWorks for manually built and AI programs. Does not invent data.`
  );
  if(!ok)return;
  setMemberHistoryRestoreBusy(true);
  try{
   const since=addDaysYmd(today(),-56);
   const result=await reattachUserLogsToProgram(supabase,memberDashboard.user_id,programForMember,{
    sinceYmd:since,
    teamId:activeTeam.id,
   });
   await refreshMemberPerformance(memberDashboard);
   await loadMemberDashboardData(memberDashboard);
   alert(
    result.rematched
     ?`Restored ${result.rematched} logged set${result.rematched===1?'':'s'} for this member.${result.unmatched?` ${result.unmatched} could not be matched to current exercises — they still count in Progress if snapshots exist.`:''}`
     : result.unlinked
      ? 'Found unlinked logs but could not match them onto this program’s exercises. If Progress is still empty, the logs may have been deleted with the old program — check Supabase backups.'
      : 'No unlinked completed logs found for this member on the current program.'
   );
  } finally {
   setMemberHistoryRestoreBusy(false);
  }
 }
 async function loadMemberDashboardData(member:any,assignmentsOverride?:Record<string,any>){
  setMemberPerformanceLoading(true);
  try{
  const usePersonal=(member.training_source||'team')==='personal';
  const{data:index,error:indexErr}=await fetchProgramIndex(supabase,{personal:usePersonal,teamId:activeTeam.id,ownerUserId:member.user_id,publishedOnly:true});
  if(indexErr)console.warn(indexErr);
  const list=index||[];
  const assignMap=assignmentsOverride??memberAssignments;
  const pickedMeta=pickProgramForMember(list,member,!usePersonal?activeTeam?.default_program_id:null,assignMap);
  let pickedFull:any=null;
  if(pickedMeta?.id){
   const{data:full,error:fullErr}=await fetchFullProgram(supabase,pickedMeta.id);
   if(!fullErr)pickedFull=full;
   else console.warn(fullErr);
  }
  setMemberDashProgram(pickedFull);
  const assignment=assignMap[member.user_id];
  if(assignment)setAssignDraft({type:assignment.assignment_type||'team',programId:assignment.program_id||'',notes:assignment.notes||''});
  else setAssignDraft({type:(member.training_source||'team')==='personal'?'personal':'team',programId:'',notes:''});
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const todayLabel=dayNames[new Date().getDay()];
  const todayW=(pickedFull?.st_workouts||[]).find((w:any)=>w.week===week&&w.day_label===todayLabel)||(pickedFull?.st_workouts||[]).find((w:any)=>w.week===1&&w.day_label===todayLabel);
  if(!todayW){setMemberDashLogs({});} else {
  const ids:any[]=[];
  (todayW.st_exercises||[]).forEach((e:any)=>(e.st_planned_sets||[]).forEach((s:any)=>{if(!s.is_deleted)ids.push(s.id);}));
  if(!ids.length){setMemberDashLogs({});} else {
  const{data:logs}=await supabase.from('st_set_logs').select('*').in('planned_set_id',ids).eq('user_id',member.user_id).eq('log_date',logDate);
  const by:any={};(logs||[]).forEach((l:any)=>by[l.planned_set_id]=l);
  // Overlay same-date snapshot matches (manual program redo left old planned_set ids)
  const{data:dateLogs}=await supabase.from('st_set_logs').select('*').eq('user_id',member.user_id).eq('log_date',logDate).limit(400);
  const overlaid=mapDateLogsToProgram(dateLogs||[],pickedFull,todayW);
  Object.keys(overlaid).forEach((sid)=>{if(!by[sid])by[sid]=overlaid[sid];});
  setMemberDashLogs(by);
  }}
  const{data:lastRow}=await supabase.from('st_set_logs').select('log_date').eq('user_id',member.user_id).eq('completed',true).order('log_date',{ascending:false}).limit(1).maybeSingle();
  setMemberDashLastDate(lastRow?.log_date||'');
  if(activeTeam&&canManageGroupView()){
    const performance=await loadMemberPerformanceBundle(supabase,member.user_id,activeTeam.id);
    setMemberPerformance(performance);
  } else {
    setMemberPerformance(null);
  }
  } finally {
   setMemberPerformanceLoading(false);
  }
 }
 async function openMemberView(member:any){
  if(!member)return;
  if(member.user_id===session.user.id){await closeMemberView();setAppNav('Training');setTrainingSubNav('personal');return;}
  if(!canManageGroupView())return alert('Only owners and managers can view member workouts.');
  setAppNav('Groups');
  setMode('team');
  setMemberDashboard(null);
  setMemberWorkoutProgram(null);
  setMemberWorkoutActiveId('');
  setMemberWorkoutLogDate(today());
  setHistory({});
  setLiftHistoryRows([]);
  setViewingMember(member);
  const freshAssignments=await loadMemberAssignments();
  await reloadMemberWorkoutProgram(member,freshAssignments);
 }
 function clearMemberWorkoutView(){
  setViewingMember(null);
  setMemberDashboard(null);
  setMemberPerformance(null);
  setMemberWorkoutProgram(null);
  setMemberWorkoutActiveId('');
  setLogs({});
  setHistory({});
  setLiftHistoryRows([]);
  logsRef.current={};
 }
 async function closeMemberView(){clearMemberWorkoutView();}
 async function loadAssignedWorkouts(){
  if(!session?.user){setAssignedWorkouts([]);return;}
  const{data,error}=await supabase.from('st_assignment_recipients').select('*, st_workout_assignments(*, st_teams(id, name), st_workouts(id, week, day_label, workout_type, day_order), st_programs(id, name))').eq('user_id',session.user.id).in('status',['pending','started','completed']).order('created_at',{ascending:false}).limit(30);
  if(error){console.warn(error.message);return;}
  const rows=((data||[]) as AssignedWorkoutRow[]).filter((r)=>r.st_workout_assignments?.is_active!==false);
  setAssignedWorkouts(rows);
 }
 async function loadGroupProgramForAssign(){
  if(!activeTeam||!canManageGroup(activeTeam.my_role)){setGroupProgramForAssign(null);setAssignWorkoutPrograms([]);return;}
  // Include workout days for every published team program so Assign workout can use older plans
  // after the group program was replaced.
  const{data,error}=await supabase.from('st_programs').select('*, st_workouts(id, week, day_label, workout_type, day_order, created_at)').eq('visibility','team').eq('team_id',activeTeam.id).order('created_at',{ascending:false});
  if(error){console.warn(error.message);return;}
  const list=(data||[]).filter((p:any)=>isPublishedProgram(p));
  setAssignWorkoutPrograms(list);
  setGroupProgramForAssign(pickProgram(list,activeTeam.default_program_id,{teamDefault:true})||list[0]||null);
 }
 async function loadClassifications(){
  if(!activeTeam){setClassifications([]);return;}
  const{data,error}=await supabase.from('st_group_classifications').select('*').eq('team_id',activeTeam.id).order('name');
  if(error){console.warn(error.message);return;}
  setClassifications(data||[]);
 }
 async function loadMemberClassificationLinks(){
  if(!members.length){setMemberClassificationIds({});return;}
  const memberIds=members.map((m:any)=>m.id);
  const{data,error}=await supabase.from('st_group_member_classifications').select('member_id, classification_id').in('member_id',memberIds);
  if(error){console.warn(error.message);return;}
  const by:Record<string,string[]>={};
  members.forEach((m:any)=>{by[m.id]=[];});
  (data||[]).forEach((row:any)=>{if(by[row.member_id])by[row.member_id].push(row.classification_id);});
  setMemberClassificationIds(by);
 }
 async function createClassification(name:string){
  if(!activeTeam||!canManageGroupView())throw new Error('Not authorized');
  const slug=classificationSlug(name);
  const{error}=await supabase.from('st_group_classifications').insert({team_id:activeTeam.id,name:name.trim(),slug});
  if(error)throw new Error(error.message);
  await loadClassifications();
 }
 async function deleteClassification(classification:GroupClassification){
  if(!activeTeam||!canManageGroupView())throw new Error('Not authorized');
  const{error}=await supabase.from('st_group_classifications').delete().eq('id',classification.id).eq('team_id',activeTeam.id);
  if(error)throw new Error(error.message);
  await loadClassifications();
  await loadMemberClassificationLinks();
 }
 async function setMemberClassifications(member:any,classificationIds:string[]){
  if(!activeTeam||!canManageGroupView())return;
  const{error:delErr}=await supabase.from('st_group_member_classifications').delete().eq('member_id',member.id);
  if(delErr)return alert(delErr.message);
  if(classificationIds.length){
    const{error}=await supabase.from('st_group_member_classifications').insert(classificationIds.map((cid)=>({member_id:member.id,classification_id:cid})));
    if(error)return alert(error.message);
  }
  await loadMemberClassificationLinks();
 }
 async function toggleMemberClassification(member:any,classificationId:string,active:boolean){
  const current=memberClassificationIds[member.id]||[];
  const next=active?(current.includes(classificationId)?current:[...current,classificationId]):current.filter((id)=>id!==classificationId);
  setMemberClassificationIds((prev)=>({...prev,[member.id]:next}));
  await setMemberClassifications(member,next);
 }
 async function assignWorkoutToTargets(payload:{workoutId:string;programId?:string|null;targetType:'group'|'members'|'classification';memberUserIds:string[];classificationId:string;scheduledDate:string;dueDate:string;title:string;notes:string}){
  if(!activeTeam||!canManageGroupView())throw new Error('Only owners and managers can assign workouts.');
  if(!payload.workoutId)throw new Error('Select a workout from a published group program.');
  const programId=payload.programId||groupProgramForAssign?.id||null;
  const baseArgs:any={
    p_team_id:activeTeam.id,
    p_workout_id:payload.workoutId,
    p_program_id:programId,
    p_workout_date:null,
    p_target_type:payload.targetType,
    p_target_classification_id:payload.targetType==='classification'?payload.classificationId:null,
    p_target_user_ids:payload.targetType==='members'?payload.memberUserIds:null,
    p_scheduled_date:payload.scheduledDate||today(),
    p_due_date:payload.dueDate||null,
    p_title:payload.title||null,
    p_notes:payload.notes||null,
  };
  let{data:assignmentId,error}=await supabase.rpc('st_assign_workout_to_targets',{
    ...baseArgs,
    p_coaching_metadata:{},
  });
  if(error&&/coaching_metadata|could not find the function|schema cache/i.test(error.message||'')){
   ({data:assignmentId,error}=await supabase.rpc('st_assign_workout_to_targets',baseArgs));
  }
  if(error){
   const raw=error.message||'Could not assign workout.';
   if(/not authorized/i.test(raw)){
    throw new Error('Not authorized. Confirm you are an Owner or Manager, then run Supabase migration 20261005_054 and retry.');
   }
   if(/could not find the function|schema cache/i.test(raw)){
    throw new Error('Assign workout needs a Supabase update. Run st_assign_workout_to_targets migrations in the SQL Editor.');
   }
   if(/coaching_metadata/i.test(raw)&&/does not exist/i.test(raw)){
    throw new Error('This workout was not added. The assignment save expects coaching_metadata on workout assignments, and that column is not in the database yet. Nothing was saved.');
   }
   throw new Error(raw);
  }
  return assignmentId;
 }
 async function openAssignedWorkout(row:AssignedWorkoutRow){
  const wa=row.st_workout_assignments;
  if(!wa)return alert('Assignment not found.');
  const usesPersonalCopy=assignedHasPersonalCopy(row);
  let programId=usesPersonalCopy?row.personal_copy_program_id||null:wa.program_id||null;
  if(!programId&&!usesPersonalCopy&&wa.workout_id){
    const{data:workoutRow}=await supabase.from('st_workouts').select('program_id').eq('id',wa.workout_id).maybeSingle();
    programId=workoutRow?.program_id||null;
  }
  if(!programId)return alert('This assignment is missing program data.');
  const{data:fullProgram,error}=await fetchFullProgram(supabase,programId);
  if(error||!fullProgram)return alert(error||'Program not found.');
  const targetWorkout=usesPersonalCopy
    ?((fullProgram.st_workouts||[]).slice().sort((a:any,b:any)=>a.week-b.week||a.day_order-b.day_order)[0]||null)
    :resolveAssignmentWorkout(fullProgram,wa);
  if(!targetWorkout)return alert('Could not resolve workout for this assignment.');
  setActiveAssignedRecipient(row);
  setViewingMember(null);
  setMemberDashboard(null);
  setMode(usesPersonalCopy?'personal':'team');
  setSelectedTeamId(wa.team_id);
  setProgram(fullProgram);
  setPrograms([fullProgram]);
  setLogDate(wa.scheduled_date||today());
  setWeek(usesPersonalCopy?1:(targetWorkout.week||1));
  setActiveWorkout(targetWorkout.id);
  syncingCalendarRef.current=true;
  await loadLogs(fullProgram,session.user.id);
  queueMicrotask(()=>{syncingCalendarRef.current=false;});
  if(row.status==='pending'){
    await supabase.from('st_assignment_recipients').update({status:'started'}).eq('id',row.id);
    await loadAssignedWorkouts();
    setActiveAssignedRecipient((prev)=>prev&&prev.id===row.id?{...prev,status:'started'}:prev);
  }
  setAppNav('Training');
  setTrainingSubNav('personal');
 }
 async function copyAssignedWorkoutToPersonal(row?:AssignedWorkoutRow){
  const target=row||activeAssignedRecipient;
  if(!target||assignmentCopyBusy)return;
  if(assignedHasPersonalCopy(target)){
    await openAssignedWorkout(target);
    return;
  }
  setAssignmentCopyBusy(target.id);
  try{
    const{programId,error}=await copyAssignmentToPersonal(supabase,target.id);
    if(error||!programId)return alert(error||'Could not copy workout.');
    const nextRow:AssignedWorkoutRow={...target,personal_copy_program_id:programId};
    setAssignedWorkouts((prev)=>prev.map((r)=>r.id===target.id?nextRow:r));
    await openAssignedWorkout(nextRow);
    await loadAssignedWorkouts();
  }finally{
    setAssignmentCopyBusy(null);
  }
 }
 async function closeAssignedWorkout(){
  setActiveAssignedRecipient(null);
  setMode('personal');
  await loadPrograms();
  await loadAssignedWorkouts();
 }
 async function dismissAssignedWorkout(row:AssignedWorkoutRow){
  if(!session?.user||assignmentDismissBusy)return;
  const title=assignmentDisplayTitle(row);
  if(!confirm(`Remove "${title}" from your assigned workouts?${assignedHasPersonalCopy(row)?' Your personal copy stays in your program.':''}`))return;
  setAssignmentDismissBusy(row.id);
  try{
   const{error}=await supabase.from('st_assignment_recipients').update({status:'skipped'}).eq('id',row.id).eq('user_id',session.user.id);
   if(error)return alert(error.message);
   await withdrawAssignmentExpectation(supabase, row.id, todayYmd());
   if(activeAssignedRecipient?.id===row.id)await closeAssignedWorkout();
   await loadAssignedWorkouts();
  }finally{
   setAssignmentDismissBusy(null);
  }
 }
 function assignmentPanelStatus(row:AssignedWorkoutRow){
  if(row.status==='completed')return 'completed';
  if(row.status==='started')return 'in_progress';
  return 'not_started';
 }
 async function maybeCompleteAssignedWorkout(workoutRef:any,logMap:any){
  if(!activeAssignedRecipient||!workoutRef)return;
  const st=workoutStatusFor(workoutRef,logMap);
  if(st!=='completed')return;
  if(activeAssignedRecipient.status==='completed')return;
  const{error}=await supabase.from('st_assignment_recipients').update({status:'completed'}).eq('id',activeAssignedRecipient.id);
  if(error)return console.warn(error.message);
  setActiveAssignedRecipient((prev)=>prev?{...prev,status:'completed'}:prev);
  await loadAssignedWorkouts();
 }
 async function setMyTrainingSource(source:'team'|'personal'){
  if(!activeTeam)return;
  const{error}=await supabase.rpc('st_set_my_training_source',{p_team_id:activeTeam.id,p_training_source:source});
  if(error)return alert(error.message);
  await loadTeams();
  setMode(source==='personal'?'personal':'team');
  setViewingMember(null);
 }
 async function setMemberTrainingSource(member:any,source:string){
  if(!activeTeam||!canManageGroupView())return;
  const{error}=await supabase.rpc('st_set_member_training_source',{p_team_id:activeTeam.id,p_member_user_id:member.user_id,p_training_source:source});
  if(error)return alert(error.message);
  await loadMembers();
  await loadMemberStats();
  if(viewingMember?.user_id===member.user_id)setViewingMember({...member,training_source:source});
 }
 async function setTeamDefaultProgram(programId:string){
  if(!activeTeam||!canSetGroupDefaultProgram(activeTeam.my_role,groupPermissionFlags(activeTeam)))return;
  if(programId){
   const target=programs.find((p:any)=>p.id===programId);
   if(target&&!isPublishedProgram(target))return alert('Publish this program before setting it as the group active program.');
  }
  const{error}=await setGroupDefaultProgram(supabase,activeTeam.id,programId||null);
  if(error){
   if(/could not find the function|schema cache/i.test(error))return alert('Setting the group program needs Supabase migration 20261005_054_group_architecture_phase1.sql.');
   return alert(error);
  }
  await loadTeams();
  await loadPrograms(appNav==='Groups'?'setup':'training');
 }
 async function saveDraftProgramName(programId:string,options?:{quiet?:boolean}):Promise<string|null>{
  const name=programName.trim();
  if(!name){
   if(!options?.quiet)alert('Enter a program name.');
   return options?.quiet?null:'Enter a program name.';
  }
  const target=programs.find((p:any)=>p.id===programId)||(program?.id===programId?program:null);
  if(target?.name===name)return null;
  const{error}=await supabase.from('st_programs').update({name}).eq('id',programId);
  if(error){
   const msg=error.message||'Could not save program name.';
   if(!options?.quiet)alert(msg);
   return msg;
  }
  setPrograms((prev:any[])=>prev.map((p:any)=>p.id===programId?{...p,name}:p));
  if(program?.id===programId)setProgram({...program,name});
  return null;
 }
 async function publishProgram(programId:string,makeActive=false){
  if(!programId||!canEdit())return;
  const target=programs.find((p:any)=>p.id===programId)||(program?.id===programId?program:null);
  if(!target)return alert('Program not found.');
  if(!isDraftProgram(target)&&target.status==='published')return alert('This program is already published.');
  const nameErr=await saveDraftProgramName(programId);
  if(nameErr)return alert(nameErr);
  const{error,draftSupported}=await publishProgramRecord(supabase,programId);
  if(error)return alert(error);
  if(!draftSupported){
   return alert('Draft/publish requires Supabase migration 20250722_027. Your program is already live.');
  }
  if(makeActive&&mode==='team'&&activeTeam){
   const{error:teamErr}=await setGroupDefaultProgram(supabase,activeTeam.id,programId);
   if(teamErr)return alert(teamErr);
   await loadTeams();
  }
  setDraftEditProgramId(null);
  await loadPrograms(appNav==='Groups'?'setup':'training');
  alert(makeActive&&mode==='team'?'Program published and set as the group active program.':'Program published — it is now available for training.');
 }
 function openProgramsForGroup(action:'library'|'create'|'edit',programId?:string|null,hint?:string|null){
  if((action==='create'||action==='library')&&!activeTeam)return alert('Select a team first.');
  if(action==='edit'&&!programId)return;
  setMode('team');
  setDraftEditProgramId(null);
  setTrainingSubNav('personal');
  setProgramsLaunch({scope:'group',action,programId:programId||null,hint:hint||null});
  setAppNav('Programs');
 }
 function openAssignmentProgramDesign(draft:AssignmentWizardResume){
  if(!activeTeam)return alert('Select a group first.');
  setAssignmentResume(draft);
  setMode('team');
  setDraftEditProgramId(null);
  setProgramsLaunch({
   scope:'group',
   action:'create',
   hint:'Publish this program to return to Assign Training. The members you selected stay selected.',
   assignmentReturn:{
    teamId:draft.teamId,
    whoMode:draft.whoMode,
    memberUserIds:draft.memberUserIds,
    classificationId:draft.classificationId,
    creation:draft.creation||'ai',
   },
  });
  setAppNav('Programs');
 }
 function assignmentProgramReady(program:{id:string;name:string}){
  setAssignmentResume((current)=>current?resumeAfterProgramPublish(current,program):current);
  setAppNav('Groups');
  void loadPrograms('setup');
 }
 async function submitGroupAssignment(payload:AssignTrainingSubmit){
  if(!activeTeam)throw new Error('Select a group first.');
  if(!canAssignInGroup(activeTeam.my_role, groupPermissionFlags(activeTeam))){
   throw new Error('You do not have permission to assign training in this group.');
  }
  if(payload.mode==='workout'){
   const{error}=await assignGroupWorkout(supabase,{
    teamId:activeTeam.id,
    workoutId:payload.workoutId,
    programId:payload.programId,
    targetType:payload.targetType,
    memberUserIds:payload.memberUserIds,
    classificationId:payload.classificationId,
    scheduledDate:payload.scheduledDate,
    dueDate:payload.dueDate,
    notes:payload.notes,
    requestKey:payload.requestKey,
   });
   if(error)throw new Error(error);
  }else if(payload.mode==='group_default'){
   const{error}=await setGroupDefaultProgram(supabase,activeTeam.id,payload.programId,payload.startsOn,payload.schedules);
   if(error)throw new Error(error);
  }else{
   const{error}=await assignGroupPrograms(supabase,{
    teamId:activeTeam.id,
    memberUserIds:payload.memberUserIds,
    programId:payload.programId,
    startsOn:payload.startsOn,
    notes:payload.notes,
    requestKey:payload.requestKey,
    setAsGroupPlan:payload.setAsGroupPlan,
    schedules:payload.schedules,
   });
   if(error)throw new Error(error);
  }
  await loadMembers();
  await loadMemberAssignments();
  await loadGroupProgramForAssign();
 }
 async function editTeamProgramFromGroups(programId:string){
  if(!programId||!canEdit())return;
  openProgramsForGroup('edit',programId);
 }
 function openGroupsProgramWizard(_mode:'create'|'generate',options?:{memberUserId?:string|null}){
  if(options?.memberUserId){
   const member=members.find((m:any)=>m.user_id===options.memberUserId);
   const memberName=member?.display_name||'this member';
   openProgramsForGroup('create',null,`Create the group plan here, then assign it to ${memberName} from Groups.`);
   return;
  }
  openProgramsForGroup('library');
 }
 async function duplicateTeamProgramHandler(programId:string){
  if(!canEdit()||!activeTeam)return;
  const src=programs.find((p:any)=>p.id===programId);
  const{programId:newId,error}=await duplicateTeamProgram(supabase,programId,{name:`${src?.name||'Program'} (Copy)`,visibility:'team',teamId:activeTeam.id});
  if(error||!newId)return alert(error||'Could not duplicate program.');
  await loadPrograms('setup');
  alert('Program duplicated.');
 }
 async function customizeFollowedProgramForMeHandler(){
  const ctx=await ensurePersonalCopyForTrainingEdit();
  if(!ctx)return;
 }
 async function ensurePersonalCopyForTrainingEdit(sourceWorkout?:any):Promise<{workout:any,program:any}|null>{
  if(!session?.user)return null;
  const source=sourceWorkout||workout;
  if(isPersonalCalendarWorkout(source?.id||activeWorkout)){
   const ctx=source&&program?{workout:source,program}:null;
   planEditRef.current=ctx;
   return ctx;
  }
  if(isSharedTemplateEditor()){
   const sharedTeam=teams.find((t:any)=>t.id===program?.team_id)||activeTeam;
   if(isLiveGroupProgram(program)&&resolveGroupEditIntent(sharedTeam?.my_role,'shared_template',groupPermissionFlags(sharedTeam))!=='edit_shared'){
    alert('You can customize a personal copy from Training. This does not change the shared group plan.');
    return null;
   }
   if(!canEdit()){alert('Only owners and managers can change the group plan.');return null;}
   const ctx=source&&program?{workout:source,program}:null;
   planEditRef.current=ctx;
   return ctx;
  }
  if(isPersonalizedGroupFollow(program)){
   const ctx=source&&program?{workout:source,program}:null;
   planEditRef.current=ctx;
   return ctx;
  }
  if(!needsJustMeCopy(program)){
   if(!canEdit()){alert('You can only edit your own program.');return null;}
   const ctx=source&&program?{workout:source,program}:null;
   planEditRef.current=ctx;
   return ctx;
  }
  if(!program){alert('Follow a program first.');return null;}
  if(!personalCopyFlightRef.current){
   const keepOpen=trainingSessionOpen;
   const intent=trainingSessionIntent;
   const date=logDate;
   const copiedFrom=source;
   personalCopyFlightRef.current=(async()=>{
    setCustomizeForMeBusy(true);
    try{
     const{program:copy,error}=await customizeFollowedProgramForMe(supabase,session.user.id,program);
     if(error||!copy){alert(error||'Could not make a private copy.');return null;}
     setProfile((p:any)=>p?{...p,followed_program_id:copy.id}:p);
     setMode('personal');
     setViewingWorkoutId(null);
     setWorkoutPreviewMeta(null);
     setAppNav('Training');
     setTrainingSubNav('personal');
     setApplyScope('current');
     const mapped=matchCopiedWorkout(copiedFrom,copy);
     await loadPrograms('training',{preserveWorkoutId:mapped?.id||null,followedProgramId:copy.id});
     setLogDate(date);
     if(keepOpen){setTrainingSessionIntent(intent);setTrainingSessionOpen(true);}
     return {program:copy};
    }catch(error){
     alert(error instanceof Error?error.message:'Could not make a private copy.');
     return null;
    }finally{setCustomizeForMeBusy(false);}
   })().finally(()=>{personalCopyFlightRef.current=null;});
  }
  const copied=await personalCopyFlightRef.current;
  if(!copied?.program)return null;
  const mapped=matchCopiedWorkout(source,copied.program);
  if(mapped?.id)setActiveWorkout(mapped.id);
  const ctx={workout:mapped||findWorkoutInProgram(copied.program,mapped?.id)||source,program:copied.program};
  planEditRef.current=ctx;
  // loadPrograms above may skip setProgram while the logger is open. Force the
  // private copy into the live tree so equipment edits stick on this screen.
  setProgram(copied.program);
  setPrograms((prev:any[])=>mergeFullProgramIntoList(prev||[],copied.program));
  return ctx;
 }
 async function deleteProgramHandler(programId:string){
  if(!programId||!canEdit())return;
  const target=programs.find((p:any)=>p.id===programId);
  if(!target)return alert('Program not found.');
  if(mode==='team'&&activeTeam?.default_program_id===programId){
   return alert('This is the team active program. Assign a different default in Groups → Training before deleting.');
  }
  const label=target.name||'Program';
  const draft=isDraftProgram(target);
  const msg=draft
   ?`Delete draft "${label}"? This cannot be undone.`
   :`Delete "${label}"? Completed workout history is preserved, but the program template will be removed.`;
  if(!confirm(msg))return;
  const{error}=await deleteProgramRecord(supabase,programId);
  if(error)return alert(error);
  setPrograms((prev:any[])=>prev.filter((p:any)=>p.id!==programId));
  if(draftEditProgramId===programId){
   setDraftEditProgramId(null);
   setProgram(null);
  } else if(program?.id===programId){
   setProgram(null);
  }
  const reloadContext=appNav==='Groups'?'setup':'training';
  await loadPrograms(reloadContext);
  await loadGroupProgramForAssign();
  await loadMemberAssignments();
 }
 async function assignTeamProgramHandler(programId:string,payload:{target:AssignProgramTarget;memberUserIds:string[];setAsTeamDefault:boolean}){
  if(!activeTeam||!canManageGroupView())return;
  const target=programs.find((p:any)=>p.id===programId);
  if(!target||!isPublishedProgram(target))return alert('Publish the program before assigning.');
  if(payload.target==='team'||payload.setAsTeamDefault){
   if(!confirm(`Set “${target.name}” as the group plan?\n\nMembers who use the group plan move to this program. Personal training and individual plans stay in place.`))return;
   await setTeamDefaultProgram(programId);
   alert('Group plan updated for members who use it.');
  } else {
   if(!payload.memberUserIds.length)return alert('Select at least one member.');
   const names=payload.memberUserIds.map((uid)=>members.find((m:any)=>m.user_id===uid)?.display_name||'Member');
   if(!confirm(`Assign “${target.name}” only to:\n${names.join(', ')}\n\nThis does not change the group plan for everyone else.`))return;
   const{error}=await assignGroupPrograms(supabase,{
    teamId:activeTeam.id,
    memberUserIds:payload.memberUserIds,
    programId,
    startsOn:today(),
    requestKey:crypto.randomUUID(),
   });
   if(error)return alert(error);
   alert(`Assigned to ${names.join(', ')} only. Group plan unchanged.`);
  }
  const freshAssignments=await loadMemberAssignments();
  await loadGroupProgramForAssign();
  const assignedIds=payload.target==='team'?[]:payload.memberUserIds;
  if(mode==='team')await loadPrograms(programLoadContext(),{assignmentsOverride:freshAssignments});
  if(memberDashboard&&assignedIds.includes(memberDashboard.user_id)){
   const member=members.find((m:any)=>m.user_id===memberDashboard.user_id);
   if(member)await loadMemberDashboardData(member,freshAssignments);
  }
  if(session?.user&&assignedIds.includes(session.user.id)){
   setMode('team');
   await loadPrograms('training',{assignmentsOverride:freshAssignments});
  }
 }
 async function customizeProgramForMemberHandler(memberUserId:string,sourceProgramId:string){
  if(!activeTeam||!canManageGroupView())return;
  const member=members.find((m:any)=>m.user_id===memberUserId);
  if(!member)return;
  const{programId,error}=await customizeProgramForMember(supabase,activeTeam.id,memberUserId,sourceProgramId);
  if(error||!programId)return alert(error||'Could not customize program.');
  const freshAssignments=await loadMemberAssignments();
  if(memberDashboard?.user_id===memberUserId)await loadMemberDashboardData(member,freshAssignments);
  if(session?.user?.id===memberUserId&&mode==='team')await loadPrograms('training',{assignmentsOverride:freshAssignments});
  alert('Custom program created and assigned.');
 }
 function generateProgramForMemberHandler(memberUserId:string){
  if(!canManageGroupView())return alert('Only owners and managers can generate programs for members.');
  openGroupsProgramWizard('generate',{memberUserId});
 }
 async function leaveTeamHandler(){
  if(!activeTeam)return;
  if(!confirm(`Leave ${activeTeam.name}?`))return;
  const{error}=await leaveTeam(supabase,activeTeam.id);
  if(error)return alert(error);
  await loadTeams();
  setMemberDashboard(null);
 }
 async function deleteTeamHandler(){
  if(!activeTeam||!isOwner())return;
  if(!confirm(`Delete ${activeTeam.name}? This archives the team. Workout history is preserved.`))return;
  const{error}=await deleteTeam(supabase,activeTeam.id);
  if(error)return alert(error);
  await loadTeams();
  setMemberDashboard(null);
 }
 async function saveGroupPermissions(flags:GroupPermissionFlags){
  if(!activeTeam||!isOwner())return alert('Only the group owner can change these permissions.');
  const{error}=await supabase.from('st_teams').update(flags).eq('id',activeTeam.id);
  if(error){
   if(/members_can_|schema cache|does not exist/i.test(error.message||''))return alert('Run migration 20261005_054_group_architecture_phase1.sql in Supabase first.');
   return alert(error.message);
  }
  await loadTeams();
 }
 async function transferGroupOwnership(userId:string){
  if(!activeTeam||!isOwner())return alert('Only the group owner can transfer ownership.');
  const{error}=await supabase.rpc('st_transfer_group_ownership',{p_team_id:activeTeam.id,p_new_owner_user_id:userId});
  if(error){
   if(/could not find the function|schema cache/i.test(error.message||''))return alert('Run migration 20261005_054_group_architecture_phase1.sql in Supabase first.');
   return alert(error.message);
  }
  await loadTeams();
  await loadMembers();
 }
 function beginSessionFeedbackLoad(key:string|null){
  const gen=++sessionFeedbackLoadGenRef.current;
  if(sessionFeedbackIdentityRef.current!==key){
    sessionFeedbackIdentityRef.current=key;
    sessionFeedbackDirtyRef.current=false;
    setSessionFeedbackExpanded(false);
    setSessionFeel('');
    setSessionPain('');
    setSessionNotes('');
    if(!key)setSessionSkipReason('');
  }
  return gen;
 }
 function applySessionFeedbackLoad(key:string|null,gen:number,row:any){
  if(!shouldApplySessionFeedbackHydration({
    loadKey:key,
    currentKey:sessionFeedbackIdentityRef.current,
    loadGeneration:gen,
    currentGeneration:sessionFeedbackLoadGenRef.current,
    dirty:sessionFeedbackDirtyRef.current,
  }))return;
  const next=sessionFeedbackStateFromRow(row||null);
  setSessionFeel(next.feel);
  setSessionPain(next.pain);
  setSessionNotes(next.notes);
 }
 async function loadLogs(p:any,userId?:string,dateOverride?:string){
  const ownLog=!userId||userId===session?.user?.id;
  if(ownLog&&loggerProtected())return;
  const uid=userId||session?.user?.id;
  const day=dateOverride||logDate;
  const extras=extraWorkoutsForLogging();
  if(!uid||(!p&&!extras.length)){setLogs({});logsRef.current={};beginSessionFeedbackLoad(null);return;}
  const ids:any[]=[];
  const seen=new Set<string>();
  [...(p?.st_workouts||[]),...extras].forEach((w:any)=>{
    if(!w?.id||seen.has(w.id))return;
    seen.add(w.id);
    (w.st_exercises||[]).forEach((e:any)=>(e.st_planned_sets||[]).forEach((s:any)=>{if(!s.is_deleted)ids.push(s.id);}));
  });
  // Prefer exact planned_set links, then overlay same-date snapshot matches so a
  // regenerated group program still shows the last weeks of logging.
  const [{data:linked},{data:dateLogs}]=await Promise.all([
   ids.length
    ? supabase.from('st_set_logs').select('*').in('planned_set_id',ids).eq('user_id',uid).eq('log_date',day)
    : Promise.resolve({data:[] as any[]}),
   supabase.from('st_set_logs').select('*').eq('user_id',uid).eq('log_date',day).limit(400),
  ]);
  const by:any={};
  (linked||[]).forEach((l:any)=>{if(l?.planned_set_id)by[l.planned_set_id]=l;});
  const activityOpen=!!groupActivityLogRef.current;
  const workoutOnDay=p&&!activityOpen?workoutForDate(p,day,undefined,workoutDayMovesFromActivities(userCalendarActivities)):null;
  // BIQ-0308: shared historical projection — orphan planned_set_ids paint onto the
  // current day's workout when snapshot match is strong; unrelated programs stay unmatched.
  if(p&&!activityOpen&&workoutOnDay){
    const projected=projectDateLogsOntoWorkout(dateLogs||[],p,workoutOnDay,{logDate:day});
    Object.keys(projected.byPlannedSetId).forEach((sid)=>{if(!by[sid])by[sid]=projected.byPlannedSetId[sid];});
  }
  logsRef.current=by;
  setLogs(by);
  const workoutIds=[...(p?.st_workouts||[]),...extras].map((w:any)=>w?.id).filter(Boolean);
  if(workoutIds.length){
    setExtraSetLogs(extraLogsFromSetLogs(dateLogs||[]));
    const sessionWorkoutId=groupActivityLogRef.current?.workoutId||workoutOnDay?.id||workoutIds[0];
    const feedbackKey=sessionFeedbackIdentityKey({userId:uid,workoutId:sessionWorkoutId,logDate:day});
    const feedbackGen=beginSessionFeedbackLoad(feedbackKey);
    const {data:sessionRow,error:sessionErr}=sessionWorkoutId?await supabase.from('st_workout_sessions').select('*').eq('user_id',uid).eq('log_date',day).eq('workout_id',sessionWorkoutId).maybeSingle():{data:null,error:null};
    if(sessionErr && /st_workout_sessions|does not exist/i.test(sessionErr.message||'')) setPhase2a1Pending(true);
    if(sessionRow){
      setSessionOutcome(sessionRow.status||'not_started');
      setSessionSkipReason(sessionRow.skip_reason||'');
      completedSessionKeyRef.current=sessionRow.status==='completed'&&sessionWorkoutId?`${uid}|${sessionWorkoutId}|${day}`:null;
    } else {
      setSessionOutcome(deriveSessionStatus({workout:workoutOnDay,logs:by}));
      completedSessionKeyRef.current=null;
      if(sessionFeedbackIdentityRef.current===feedbackKey&&!sessionFeedbackDirtyRef.current)setSessionSkipReason('');
    }
    if(feedbackKey){
      const loaded=await loadWorkoutFeedback(supabase,{userId:uid,workoutId:sessionWorkoutId,logDate:day,feedbackId:sessionRow?.feedback_id||null});
      if(loaded.pendingMigration)setPhase2a1Pending(true);
      if(!loaded.error)applySessionFeedbackLoad(feedbackKey,feedbackGen,loaded.row);
    }
    setAdaptationSummary(null);
    const {data:exSessions,error:exSessErr}=await supabase.from('st_exercise_sessions').select('exercise_id,status').eq('user_id',uid).eq('log_date',day);
    if(exSessErr && /st_exercise_sessions|does not exist/i.test(exSessErr.message||'')) setPhase2a1Pending(true);
    const skipped:Record<string,boolean>={};
    (exSessions||[]).forEach((row:any)=>{ if(row.status==='skipped' && row.exercise_id) skipped[row.exercise_id]=true; });
    setSkippedExerciseIds(skipped);
  } else {
    beginSessionFeedbackLoad(null);
  }
 }

 async function checkHistoryRestoreOffer(p:any){
  if(!session?.user||!p)return;
  // Silent reconnect once per program in this browser session so regenerating
  // group programming does not leave Training looking empty.
  const autoKey=`biq_history_restore_auto:${session.user.id}:${p.id}`;
  if(typeof window!=='undefined'&&sessionStorage.getItem(autoKey))return;
  const since=addDaysYmd(today(),-56);
  const counts=await countUnlinkedLogs(supabase,session.user.id,p,{sinceYmd:since});
  if(counts.unlinked<5)return;
  setHistoryRestoreBusy(true);
  try{
   const result=await reattachUserLogsToProgram(supabase,session.user.id,p,{
    sinceYmd:since,
    teamId:mode==='team'?activeTeam?.id||null:p.team_id||null,
   });
   if(typeof window!=='undefined')sessionStorage.setItem(autoKey,'1');
   if(result.rematched>0){
    await Promise.all([loadLogs(p,session.user.id,logDate),loadLiftHistory(),loadProgressLogs()]);
   }
  } finally {
   setHistoryRestoreBusy(false);
  }
 }

 async function restoreLoggedHistoryToProgram(){
  if(!session?.user||historyRestoreBusy)return;
  let targetProgram=program;
  if(!targetProgram||!targetProgram.st_workouts?.length){
   // Progress tab may open without Training program loaded — load team/personal published program
   if(activeTeam){
    const{data}=await supabase.from('st_programs').select('*, st_workouts(*, st_exercises(*, st_planned_sets(*)))').eq('visibility','team').eq('team_id',activeTeam.id).order('created_at',{ascending:false});
    const list=(data||[]).filter((p:any)=>isPublishedProgram(p));
    targetProgram=pickProgramForMember(list,{user_id:session.user.id},activeTeam.default_program_id)
      ||pickProgram(list,activeTeam.default_program_id,{teamDefault:true})
      ||null;
   }
   if(!targetProgram){
    const{data}=await supabase.from('st_programs').select('*, st_workouts(*, st_exercises(*, st_planned_sets(*)))').eq('visibility','personal').eq('owner_user_id',session.user.id).order('created_at',{ascending:false});
    const list=(data||[]).filter((p:any)=>isPublishedProgram(p));
    targetProgram=list[0]||null;
   }
  }
  if(!targetProgram){
   return alert('Open Training and select (or publish) a program first, then tap Restore history again.');
  }
  const ok=window.confirm(
   `Reconnect your completed sets from the past ~8 weeks onto "${targetProgram.name||'this program'}"?\n\nThis does not invent data — it only relinks existing logs so Training and Groups show what you already logged.`
  );
  if(!ok)return;
  setHistoryRestoreBusy(true);
  try{
   const since=addDaysYmd(today(),-56);
   const result=await reattachUserLogsToProgram(supabase,session.user.id,targetProgram,{
    sinceYmd:since,
    teamId:targetProgram.visibility==='team'?(activeTeam?.id||targetProgram.team_id||null):null,
   });
   if(result.errors.length)console.warn(result.errors.join('; '));
   if(program?.id===targetProgram.id){
    await Promise.all([loadLogs(program,session.user.id,logDate),loadLiftHistory(),loadProgressLogs()]);
   } else {
    await loadProgressLogs();
   }
   alert(
    result.rematched
     ?`Restored ${result.rematched} logged set${result.rematched===1?'':'s'} onto ${targetProgram.name||'your program'}.${result.unmatched?` ${result.unmatched} could not be matched (different exercises) — they still appear under Progress.`:''}`
     : result.unlinked
      ? 'Could not match those logs onto this program’s exercises. If Progress below is empty, the old program delete may have wiped rows — check Supabase backups.'
      : 'No unlinked workout history found for this account on that program.'
   );
  } finally {
   setHistoryRestoreBusy(false);
  }
 }

 async function loadLiftHistory(){
  const uid=logUserId();
  if(!uid) return;
  const cutoff=activeLogDateForLogging();

  const { data, error } = await supabase
    .from('st_set_logs')
    .select('*, st_planned_sets(set_type,set_number,st_exercises(name,muscle_group,section,catalog_exercise_id))')
    .eq('user_id', uid)
    .lt('log_date', cutoff)
    .order('log_date', { ascending:false })
    .order('updated_at', { ascending:false })
    .limit(800);

  if(error){
    console.warn(error.message);
    return;
  }

  const by:any = {};
  (data || []).forEach((row:any)=>{
    if(!(row.completed===true || logHasPerformance(row))) return;
    const { exerciseKey, setType, setNumber, catalogId, name } = logHistoryKeys(row);
    if(!exerciseKey) return;

    const aliases=historyAliases(catalogId,name);
    aliases.forEach((ek)=>{
      if(!by[ek]) by[ek] = [];
      by[ek].push(row);
      const setKey=`${ek}|${setType}|${setNumber}`;
      if(!by[setKey]) by[setKey] = row;
    });
  });

  setHistory(by);
  setLiftHistoryRows(data || []);
 }

 async function loadProgressLogs(){
  if(!session?.user) return;
  // Pull recent set logs for this user. Include rows with performance even if
  // `completed` was never toggled — otherwise Progress looks empty after heavy logging.
  const { data, error } = await supabase
    .from('st_set_logs')
    .select('*')
    .eq('user_id', session.user.id)
    .order('log_date', { ascending:false })
    .order('updated_at', { ascending:false })
    .limit(800);
  if(error){
   console.warn(error.message);
   setProgressLogs([]);
   return;
  }
  const rows=(data||[]).filter((row:any)=>row?.completed===true||logHasPerformance(row));
  setProgressLogs(rows);
 }

 function previousLogById(id?:string|null){
  const key=String(id||'').trim();
  if(!key) return null;
  return (liftHistoryRows||[]).find((row:any)=>String(row.id||'')===key)||null;
 }
 function previousPerformanceViewFor(ex:any, set:any, equipment?:string, copyLastDisabled?:boolean){
  const result=classifyPreviousPerformance({
    catalog,
    catalogExerciseId:ex?.catalog_exercise_id,
    exerciseName:ex?.name,
    equipment,
    setType:set?.set_type,
    setNumber:set?.set_number,
    sessionDate:activeLogDateForLogging(),
    userId:logUserId(),
    rows:liftHistoryRows,
  });
  const copySource=!copyLastDisabled&&loggerCopyLastEligible(result)?previousLogById(result.copyLastSource?.sourceId):null;
  return {result,copySource};
 }
 function equipmentQueueFor(exerciseId:string){
  if(!equipmentQueuesRef.current[exerciseId]) equipmentQueuesRef.current[exerciseId]=createEquipmentWriteQueue();
  return equipmentQueuesRef.current[exerciseId];
 }
 function equipmentChoiceFor(ex:any,catItem:any){
  const pending=ex?.id
    ?(pendingEquipmentById[ex.id]||equipmentQueuesRef.current[ex.id]?.intent()?.value)
    :undefined;
  return equipmentForSetSnapshot({
    persisted:ex?.equipment,
    pending,
    options:compatibleEquipmentOptions(catItem,ex?.equipment),
  });
 }
 function changeExerciseEquipment(ex:any,value:string){
  const next=String(value||'').trim();
  if(!ex?.id||!next)return;
  const sourceId=String(ex.id);
  const queue=equipmentQueueFor(sourceId);
  queue.enqueue(next, async (selected, isCurrent)=>{
    const result=await updateExerciseField(ex,'equipment',selected,{
      onResolved:(matchedId)=>{
        if(!matchedId||matchedId===sourceId)return;
        if(equipmentQueuesRef.current[sourceId]) equipmentQueuesRef.current[matchedId]=equipmentQueuesRef.current[sourceId];
        setPendingEquipmentById((prev)=>remapPendingByExerciseId(prev,sourceId,matchedId));
      },
    });
    if(!isCurrent())return;
    if(!result.ok)return;
    const clearIds=[sourceId,result.matchedId];
    setPendingEquipmentById((prev)=>{
      if(!isCurrent())return prev;
      return clearPendingEquipmentIds(prev,clearIds,selected,(a,b)=>canonicalEquipment(a).key===canonicalEquipment(b).key);
    });
  });
  setPendingEquipmentById((prev)=>({...prev,[sourceId]:queue.intent()?.value||next}));
 }

 function priorCompletedLogsForPr(excludeSetId:string,excludeDate:string){
  const byKey=new Map<string,any>();
  const rowKey=(l:any)=>`${l.planned_set_id}|${l.log_date}`;
  progressLogs.filter((l:any)=>l?.completed).forEach((l:any)=>byKey.set(rowKey(l),l));
  Object.values(logsRef.current).filter((l:any)=>l?.completed).forEach((l:any)=>byKey.set(rowKey(l),l));
  byKey.delete(`${excludeSetId}|${excludeDate}`);
  return Array.from(byKey.values());
 }
 function showPrCelebration(payload:{exerciseName:string;message:string;subtext:string}){
  setPrCelebration(payload);
  if(prCelebrationTimerRef.current)clearTimeout(prCelebrationTimerRef.current);
  prCelebrationTimerRef.current=setTimeout(()=>setPrCelebration(null),4500);
 }

 function collectCurrentExerciseLogRows(ex:any,workoutRef:any,logsMap:any,logDateYmd:string){
  if(!workoutRef||!logDateYmd)return [];
  return (ex.st_planned_sets||[]).filter((s:any)=>!s.is_deleted).map((set:any)=>{
   const log=logsMap[set.id];
   if(!log||!(log.completed===true||logHasPerformance(log)))return null;
   return {...log,log_date:log.log_date||logDateYmd,snapshot_exercise_name:ex.name||'',snapshot_catalog_exercise_id:ex.catalog_exercise_id||null,snapshot_set_type:set.set_type||'working',snapshot_set_number:set.set_number||1,snapshot_day_label:workoutRef.day_label||'',snapshot_week:workoutRef.week??null,snapshot_workout_type:workoutRef.workout_type||''};
  }).filter(Boolean);
 }
 function mergeExerciseHistoryRows(histRows:any[],currentRows:any[]){
  const rowKey=(r:any)=>r?.id?`id:${r.id}`:`${r?.planned_set_id||''}|${r?.log_date||''}|${r?.snapshot_set_number??''}|${r?.actual_weight||''}|${r?.actual_reps||''}`;
  const seen=new Set<string>();
  const merged:any[]=[];
  [...(histRows||[]),...(currentRows||[])].forEach((r:any)=>{
   if(!r)return;
   const key=rowKey(r);
   if(!key||seen.has(key))return;
   seen.add(key);
   merged.push(r);
  });
  return merged;
 }
 function collectHistoryRowsForExercise(ex:any){
  const aliases=historyAliases(ex.catalog_exercise_id||'',ex.name||'');
  return mergeExerciseHistoryRows(aliases.flatMap((ek)=>history[ek]||[]),[]);
 }
 function openExerciseWeekHistory(ex:any,exType:any,workoutRef:any){
  const histRows=collectHistoryRowsForExercise(ex);
  const currentRows=collectCurrentExerciseLogRows(ex,workoutRef,logs,activeLogDateForLogging());
  const merged=mergeExerciseHistoryRows(histRows,currentRows);
  let sessions=buildExerciseSessionHistory(merged,exType,{dayLabel:workoutRef?.day_label,matchDayLabel:true});
  // If same-day filter finds nothing (common after program redo / missing snapshots), show all weeks for this exercise.
  if(!sessions.length)sessions=buildExerciseSessionHistory(merged,exType,{matchDayLabel:false});
  const catItem=catalog.find((c:any)=>c.id===ex.catalog_exercise_id);
  const currentEquipment=loggerSelectedEquipment(resolveExerciseEquipment(ex,catItem),pendingEquipmentById[ex.id]);
  const progressTarget=exerciseProgressTargetFromLogger({
   catalogExerciseId:ex.catalog_exercise_id||null,
   exerciseName:ex.name||'Exercise',
   equipment:resolveExerciseEquipment(ex,catItem),
   pendingEquipment:pendingEquipmentById[ex.id],
   laterality:ex.laterality,
  });
  setExerciseHistoryModal({
   exerciseName:ex.name||'Exercise',
   dayLabel:workoutRef?.day_label,
   sessions,
   currentEquipment,
   progress:exerciseProgressRequest({
    ...progressTarget,
    returnTo:'training',
    returnSection:'training',
   }),
  });
 }
 function openExerciseProgress(ex:any,catItem:any){
  const target=exerciseProgressTargetFromLogger({
   catalogExerciseId:ex.catalog_exercise_id||null,
   exerciseName:ex.name||'Exercise',
   equipment:resolveExerciseEquipment(ex,catItem),
   pendingEquipment:pendingEquipmentById[ex.id],
   laterality:ex.laterality,
  });
  setExerciseHistoryModal(null);
  goNav('Progress',{progressSub:'strength',keepExercise:true});
  setProgressExercise(exerciseProgressRequest({
   ...target,
   returnTo:'training',
   returnSection:'training',
  }));
 }
 function closeExerciseProgress(mode:'back'|'dismiss'='back'){
  const request=progressExercise;
  setProgressExercise(null);
  if(mode!=='back'||!request)return;
  if(request.returnTo==='training')setAppNav('Training');
  else if(request.returnSection)setProgressSection(request.returnSection);
 }

 async function submitBugReport(){if(!session?.access_token)return alert('Sign in to report a bug.'); const description=bugDescription.trim(); if(description.length<8)return alert('Please describe what went wrong (at least 8 characters).'); setBugSending(true); try{const res=await fetch('/api/bug-reports',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({title:bugTitle.trim(),description,pageContext:`nav=${appNav}; training=${trainingSubNav}; mode=${mode}; program=${program?.id||'none'}; week=${week}`,appNav,userAgent:typeof navigator!=='undefined'?navigator.userAgent:''})}); const data=await res.json().catch(()=>({})); if(!res.ok)throw new Error(data?.error||`Could not send report (${res.status})`); setBugSentId(data.id||'ok'); setBugTitle(''); setBugDescription('');}catch(e:any){alert(e?.message||'Could not send bug report.');}finally{setBugSending(false);}}
 function catalogPayloadFromItem(catalogItem:any,section:string,current?:any){const meta=prescriptionColumnsFromSources({catalogItem,section,role:current?.program_role});return{name:catalogItem.name,muscle_group:catalogItem.muscle_group||'',catalog_exercise_id:catalogItem.id,exercise_type:inferExerciseType(catalogItem.name,catalogItem.muscle_group,section,catalogItem.exercise_type),equipment:defaultCatalogEquipment(catalogItem,current),program_role:meta.program_role,measurement_type:meta.measurement_type,laterality:meta.laterality};}
 function openAddExercisePanel(section:string,supersetGroupId?:string|null){if(!canEdit())return; const pending=supersetGroupId||pendingSupersetGroup[section]; const config=pending?{...emptyAddPanelConfig(),mode:'superset' as const,supersetGroupId:pending}:emptyAddPanelConfig(); if(supersetGroupId)setPendingSupersetGroup({...pendingSupersetGroup,[section]:supersetGroupId}); setAddExercisePanel({section,step:'search',query:'',filters:emptyAddPanelFilters(),picked:null,config,custom:emptyAddPanelCustom(),replaceTarget:null});}
 function openReplaceExercisePanel(ex:any){if(!canEdit())return; const section=exerciseSection(ex); setAddExercisePanel({section,step:'search',query:ex.name||'',filters:emptyAddPanelFilters(),picked:null,config:emptyAddPanelConfig(),custom:emptyAddPanelCustom(),replaceTarget:ex});}
 async function replaceExerciseWithCatalog(ex:any,catalogItem:any,scope?:'current'|'future'){
  const ctx=await ensurePersonalCopyForTrainingEdit();
  if(!ctx||!catalogItem)return;
  const current=ctx.workout||planEditRef.current?.workout||workout;
  if(!current)return;
  const section=exerciseSection(ex);
  const payload=catalogPayloadFromItem(catalogItem,section,ex);
  const baseProgram=ctx.program||planEditRef.current?.program||program;
  const targets=targetWorkoutsFrom(current,baseProgram,scope);
  exerciseEditEpochRef.current+=1;
  const applied:Array<{workoutId:string;exerciseId:string;patch:Record<string,unknown>}>=[];
  let writeError='';
  for(const tw of targets){
   const match=resolveExerciseTarget(tw,ex,current);
   if(!match?.id)continue;
   let written:any=payload;
   let{error}=await supabase.from('st_exercises').update(written).eq('id',match.id);
   if(error&&written.equipment!==undefined&&/equipment/i.test(error.message||'')){
    const{equipment:_eq,...rest}=written;
    written=rest;
    ({error}=await supabase.from('st_exercises').update(written).eq('id',match.id));
   }
   if(error){writeError=friendlyWriteError(error);break;}
   applied.push({workoutId:String(tw.id),exerciseId:String(match.id),patch:written});
  }
  if(!applied.length)return alert(writeError||'Could not update that exercise. Try this week only.');
  const openId=current.id;
  setProgram((prev:any)=>{
   const preferred=planEditRef.current?.program;
   const base=preferred?.id&&preferred.id!==prev?.id?preferred:prev;
   const next=patchExerciseCatalogInProgram(base,applied)||base;
   const visible=findWorkoutInProgram(next,openId)||planEditRef.current?.workout||current;
   planEditRef.current={workout:visible,program:next};
   return next;
  });
  setCalendarWorkouts((prev:any[])=>patchExerciseCatalogInProgram({st_workouts:prev||[]},applied)?.st_workouts||prev);
  setGroupActivityWorkout((prev:any)=>{
   if(!prev?.id)return prev;
   const next=patchExerciseCatalogInProgram({st_workouts:[prev]},applied)?.st_workouts?.[0]||prev;
   if(next?.id===openId&&planEditRef.current)planEditRef.current={...planEditRef.current,workout:next};
   return next;
  });
  setExerciseNameSearch((cur:any)=>applied.some((row)=>row.exerciseId===cur?.exerciseId)?null:cur);
  if(session?.user?.id)markScreenStale(session.user.id,['program','schedule']);
  if(writeError)alert(writeError);
 }
 function remainingSameDayWorkouts(current:any){if(!current||isPersonalCalendarWorkout(current.id))return current?[current]:[]; const prog=planEditRef.current?.program||program; return (prog?.st_workouts||[]).filter((w:any)=>w.day_order===current.day_order&&w.week>=(current.week||1));}
 async function requestReplaceExercise(ex:any,catalogItem:any){if(!catalogItem)return; const ctx=await ensurePersonalCopyForTrainingEdit(); if(!ctx)return; const current=ctx.workout||workout; const remaining=remainingSameDayWorkouts(current).length; if(remaining<=1){await replaceExerciseWithCatalog(ex,catalogItem,'current'); setAddExercisePanel(null); return;} setAddExercisePanel(null); setExerciseSwapPrompt({ex,catalogItem,remaining,fromName:ex?.name||'this exercise',toName:catalogItem.name});}
 async function pickExerciseForPanel(item:any){if(!addExercisePanel)return; if(addExercisePanel.replaceTarget){await requestReplaceExercise(addExercisePanel.replaceTarget,item); return;} const defaultSets=sectionDefaultSets(addExercisePanel.section); setAddExercisePanel({...addExercisePanel,step:'configure',picked:item,config:{...addExercisePanel.config,setCount:defaultSets}});}
 async function createCustomInPanel(){if(!addExercisePanel||!session?.user)return; const d=addExercisePanel.custom; const name=d.name.trim(); if(!name)return alert('Enter exercise name.'); const movement=resolveCatalogMovementPattern(d.movement_pattern); if(movement.error)return alert(movement.error); const{data,error}=await supabase.from('st_exercise_catalog').insert({user_id:session.user.id,name,category:d.category||addExercisePanel.section,muscle_group:d.muscle_group.trim()||null,equipment:d.equipment.trim()||null,movement_pattern:movement.value,is_system:false,is_archived:false}).select().single(); if(error)return alert(error.message); await loadCatalog(); setAddExercisePanel({...addExercisePanel,step:'configure',picked:data,config:{...addExercisePanel.config,setCount:sectionDefaultSets(addExercisePanel.section)}});}
 async function confirmAddExercise(scope?:'current'|'future'){
  if(!addExercisePanel?.picked||addExerciseFlightRef.current)return;
  addExerciseFlightRef.current=true;
  const dropPending=(rows:Array<{workoutId:string;exercise:any}>)=>{
   const spec=rows.map((row)=>({workoutId:row.workoutId,exerciseId:row.exercise.id}));
   if(!spec.length)return;
   setProgram((prev:any)=>dropExercisesFromProgram(prev,spec));
   setCalendarWorkouts((prev:any[])=>removeExercisesFromWorkoutList(prev,spec).workouts);
  };
  let stagedRows:Array<{workoutId:string;exercise:any}>=[];
  const confirmedIds=new Set<string>();
  try{
   const ctx=await ensurePersonalCopyForTrainingEdit();
   if(!ctx?.workout||!ctx.program)return;
   const current=ctx.workout;
   const weekScope=scope||pendingAddScope||'current';
   if(scope)setPendingAddScope(scope);
   const{section,picked,config}=addExercisePanel;
   const exType=exerciseTypeOf(picked,picked);
   let groupId:string|null=null;
   let supersetLabel:string|null=null;
   let slotOrder:number|null=null;
   let existing:any[]=[];
   if(config.mode==='superset'){
    if(!config.supersetGroupId||config.supersetGroupId==='__new__')groupId=makeSupersetGroupId();
    else groupId=config.supersetGroupId;
    if(groupId){
     existing=sectionExercises(current,section).filter((item:any)=>item.superset_group_id===groupId);
     if(existing.length>=3)return alert('That superset already has 3 exercises.');
     if(!existing.length){supersetLabel=nextSupersetLabel(current,section);slotOrder=1;}
     else {supersetLabel=existing[0].superset_label;slotOrder=existing.length+1;}
    }
   }
   let sortOrder=nextSortOrder(current,section);
   if(groupId&&existing.length)sortOrder=existing[0].sort_order??sortOrder;
   const setCount=Math.max(1,Number(config.setCount)||sectionDefaultSets(section));
   const existingInGroup=groupId?sectionExercises(current,section).filter((item:any)=>item.superset_group_id===groupId).length:0;
   const baseProgram=program?.id===ctx.program.id?program:ctx.program;
   const targets=targetWorkoutsFrom(current,baseProgram,weekScope);
   if(!targets.length)return alert('Could not find a workout for that exercise.');
   const addMeta=prescriptionColumnsFromSources({catalogItem:picked,section});
   const pendingRows=targets.map((tw:any)=>({
    workoutId:tw.id,
    exercise:{
     id:createPendingExerciseId(),
     client_pending:true,
     workout_id:tw.id,
     section,
     sort_order:sortOrder,
     name:picked.name,
     muscle_group:picked.muscle_group||'',
     equipment:defaultCatalogEquipment(picked),
     catalog_exercise_id:picked.id,
     exercise_type:exType,
     superset_group_id:groupId,
     superset_label:supersetLabel,
     superset_order:slotOrder,
     program_role:addMeta.program_role,
     measurement_type:addMeta.measurement_type,
     laterality:addMeta.laterality,
     st_planned_sets:[],
    },
   }));
   exerciseEditEpochRef.current+=1;
   const started=beginExerciseEdit('add');
   const nextProgram=insertExercisesIntoProgram(baseProgram,pendingRows);
   const nextCalendar=insertExercisesIntoWorkoutList(calendarWorkouts,pendingRows);
   setProgram(nextProgram);
   setCalendarWorkouts(nextCalendar);
   const visible=findWorkoutInProgram(nextProgram,current.id)||nextCalendar.find((item:any)=>item.id===current.id)||current;
   planEditRef.current={workout:visible,program:nextProgram};
   exerciseVisualRef.current={kind:'add',mark:started,ids:pendingRows.filter((row)=>row.workoutId===current.id).map((row)=>row.exercise.id),workoutId:current.id};
   setAddExercisePanel(null);
   const mutationStarted=typeof performance!=='undefined'?performance.now():Date.now();
   stagedRows=pendingRows;
   const confirmed=confirmedIds;
   for(const row of pendingRows){
    if(cancelledExerciseIdsRef.current.has(row.exercise.id))continue;
    const addPayload:any={workout_id:row.workoutId,section,sort_order:sortOrder,name:picked.name,muscle_group:picked.muscle_group||'',equipment:defaultCatalogEquipment(picked),catalog_exercise_id:picked.id,exercise_type:exType,superset_group_id:groupId,superset_label:supersetLabel,superset_order:slotOrder,program_role:addMeta.program_role,measurement_type:addMeta.measurement_type,laterality:addMeta.laterality};
    let{data:created,error}=await supabase.from('st_exercises').insert(addPayload).select().single();
    if(error&&/equipment/i.test(error.message||'')){delete addPayload.equipment;({data:created,error}=await supabase.from('st_exercises').insert(addPayload).select().single());}
    if(error&&/program_role|measurement_type|laterality/i.test(error.message||'')){delete addPayload.program_role;delete addPayload.measurement_type;delete addPayload.laterality;({data:created,error}=await supabase.from('st_exercises').insert(addPayload).select().single());}
    if(error||!created?.id){
     dropPending(pendingRows.filter((item)=>!confirmed.has(item.exercise.id)));
     noteExerciseEditFailure('add',error?.message);
     return alert(friendlyWriteError(error));
    }
    if(cancelledExerciseIdsRef.current.has(row.exercise.id)){
     await supabase.from('st_exercises').delete().eq('id',created.id);
     continue;
    }
    const setRows:any[]=[];
    for(let i=0;i<setCount;i++)setRows.push({exercise_id:created.id,sort_order:i,set_number:i+1,set_type:'working',target_weight:config.targetWeight||'',target_reps:config.targetReps||''});
    const insertedSets=setRows.length?await supabase.from('st_planned_sets').insert(setRows).select():{data:[],error:null};
    if(insertedSets.error||!(insertedSets.data||[]).length){
     await supabase.from('st_exercises').delete().eq('id',created.id);
     dropPending(pendingRows.filter((item)=>!confirmed.has(item.exercise.id)));
     noteExerciseEditFailure('add',insertedSets.error?.message);
     return alert(friendlyWriteError(insertedSets.error||'Could not add the planned sets.'));
    }
    if(cancelledExerciseIdsRef.current.has(row.exercise.id)){
     await supabase.from('st_exercises').delete().eq('id',created.id);
     continue;
    }
    const real={...created,client_pending:false,st_planned_sets:insertedSets.data};
    confirmed.add(row.exercise.id);
    setProgram((prev:any)=>replaceExerciseInProgram(prev,row.workoutId,row.exercise.id,real));
    setCalendarWorkouts((prev:any[])=>replaceExerciseInProgram({st_workouts:prev},row.workoutId,row.exercise.id,real)?.st_workouts||prev);
   }
   const finished=typeof performance!=='undefined'?performance.now():Date.now();
   noteExerciseEditMutation('add',finished-mutationStarted);
   if(session?.user?.id)markScreenStale(session.user.id,['program']);
   const newGroupCount=existingInGroup+1;
   if(config.mode==='superset'&&groupId&&newGroupCount<3){
    setPendingSupersetGroup({...pendingSupersetGroup,[section]:groupId});
    setAddExercisePanel({section,step:'search',query:'',picked:null,config:{...emptyAddPanelConfig(),mode:'superset',supersetGroupId:groupId,setCount:sectionDefaultSets(section),targetReps:'8-12',targetWeight:''},custom:emptyAddPanelCustom()});
    return;
   }
   setPendingSupersetGroup({...pendingSupersetGroup,[section]:null});
   setPendingAddScope(null);
  }catch(error){
   dropPending(stagedRows.filter((row)=>!confirmedIds.has(row.exercise.id)));
   noteExerciseEditFailure('add',error instanceof Error?error.message:'');
   alert(friendlyWriteError(error));
  }finally{
   addExerciseFlightRef.current=false;
  }
 }
 async function renameSuperset(ex:any,newLabel:string){
  if(!ex.superset_group_id||!newLabel.trim())return;
  if(!(await ensurePersonalCopyForTrainingEdit()))return;
  const current=planEditRef.current?.workout||workout;
  for(const tw of targetWorkoutsFrom(current)){
   const targets=(tw.st_exercises||[]).filter((e:any)=>e.superset_group_id===ex.superset_group_id&&exerciseSection(e)===exerciseSection(ex));
   for(const t of targets){const{error}=await supabase.from('st_exercises').update({superset_label:newLabel.trim()}).eq('id',t.id); if(error)return alert(error.message);}
  }
  await reloadKeepDay();
 }
 async function breakSuperset(ex:any){
  if(!ex.superset_group_id)return;
  if(!(await ensurePersonalCopyForTrainingEdit()))return;
  const current=planEditRef.current?.workout||workout;
  for(const tw of targetWorkoutsFrom(current)){
   const targets=(tw.st_exercises||[]).filter((e:any)=>e.superset_group_id===ex.superset_group_id&&exerciseSection(e)===exerciseSection(ex));
   for(const t of targets){
    const{error}=await supabase.from('st_exercises').update({superset_group_id:null,superset_label:null,superset_order:null}).eq('id',t.id);
    if(error)return alert(error.message);
   }
  }
  await reloadKeepDay();
  if(ex.superset_group_id)setPendingSupersetGroup((prev:any)=>{const next={...prev};Object.keys(next).forEach((k)=>{if(next[k]===ex.superset_group_id)next[k]=null;});return next;});
 }
 async function renumberSupersetGroup(section:string,groupId:string){
  const current=planEditRef.current?.workout||workout;
  const ordered=sectionExercises(current,section).filter((e:any)=>e.superset_group_id===groupId).sort((a:any,b:any)=>(a.superset_order||0)-(b.superset_order||0));
  for(let i=0;i<ordered.length;i++){
   const order=i+1;
   if((ordered[i].superset_order||0)===order)continue;
   for(const tw of targetWorkoutsFrom(current)){
    const match=resolveExerciseTarget(tw,ordered[i],current);
    if(match) await supabase.from('st_exercises').update({superset_order:order}).eq('id',match.id);
   }
  }
 }
 async function removeFromSuperset(ex:any){
  if(!ex.superset_group_id)return;
  if(!(await ensurePersonalCopyForTrainingEdit()))return;
  const current=planEditRef.current?.workout||workout;
  const section=exerciseSection(ex);
  const gid=ex.superset_group_id;
  for(const tw of targetWorkoutsFrom(current)){
   const match=resolveExerciseTarget(tw,ex,current);
   if(match) await supabase.from('st_exercises').update({superset_group_id:null,superset_label:null,superset_order:null}).eq('id',match.id);
  }
  await renumberSupersetGroup(section,gid);
  await cleanupSupersetOrphans(section,gid);
  await reloadKeepDay();
 }
 async function addExerciseToSuperset(ex:any,groupId:string){
  if(!groupId||ex.superset_group_id===groupId)return;
  if(!(await ensurePersonalCopyForTrainingEdit()))return;
  const current=planEditRef.current?.workout||workout;
  if(!current)return;
  const section=exerciseSection(ex);
  const existing=sectionExercises(current,section).filter((e:any)=>e.superset_group_id===groupId);
  if(existing.length>=3)return alert('That superset already has 3 exercises.');
  const label=existing[0]?.superset_label||nextSupersetLabel(current,section);
  const sortOrder=existing.length?existing[0].sort_order??ex.sort_order:ex.sort_order;
  const slotOrder=existing.length+1;
  for(const tw of targetWorkoutsFrom(current)){
   const match=resolveExerciseTarget(tw,ex,current);
   if(!match)continue;
   const{error}=await supabase.from('st_exercises').update({superset_group_id:groupId,superset_label:label,superset_order:slotOrder,sort_order:sortOrder}).eq('id',match.id);
   if(error)return alert(error.message);
  }
  await renumberSupersetGroup(section,groupId);
  await reloadKeepDay();
 }
 async function pairIntoNewSuperset(exA:any,exB:any){
  if(!exA||!exB||exA.id===exB.id)return;
  if(!(await ensurePersonalCopyForTrainingEdit()))return;
  const current=planEditRef.current?.workout||workout;
  if(!current)return;
  const section=exerciseSection(exA);
  if(exerciseSection(exB)!==section)return alert('Both exercises must be in the same section.');
  if(exA.superset_group_id||exB.superset_group_id)return alert('Remove exercises from their current superset first.');
  const groupId=makeSupersetGroupId();
  const label=nextSupersetLabel(current,section);
  const sortOrder=Math.min(exA.sort_order||0,exB.sort_order||0);
  const ordered=[exA,exB].sort((a:any,b:any)=>(a.sort_order||0)-(b.sort_order||0));
  for(const tw of targetWorkoutsFrom(current)){
   for(let i=0;i<ordered.length;i++){
    const src=ordered[i];
    const match=resolveExerciseTarget(tw,src,current);
    if(!match)continue;
    const{error}=await supabase.from('st_exercises').update({superset_group_id:groupId,superset_label:label,superset_order:i+1,sort_order:sortOrder}).eq('id',match.id);
    if(error)return alert(error.message);
   }
  }
  await reloadKeepDay();
 }
 async function startSupersetWithCatalog(ex:any){
  if(!(await ensurePersonalCopyForTrainingEdit()))return;
  const current=planEditRef.current?.workout||workout;
  if(!current)return;
  const section=exerciseSection(ex);
  const groupId=makeSupersetGroupId();
  const label=nextSupersetLabel(current,section);
  const sortOrder=ex.sort_order??nextSortOrder(current,section);
  for(const tw of targetWorkoutsFrom(current)){
   const match=resolveExerciseTarget(tw,ex,current);
   if(!match)continue;
   const{error}=await supabase.from('st_exercises').update({superset_group_id:groupId,superset_label:label,superset_order:1,sort_order:sortOrder}).eq('id',match.id);
   if(error)return alert(error.message);
  }
  setPendingSupersetGroup({...pendingSupersetGroup,[section]:groupId});
  await reloadKeepDay();
  openAddExercisePanel(section,groupId);
 }
 async function cleanupSupersetOrphans(section:string,groupId:string){
  for(const tw of targetWorkoutsFrom(workout)){
   const remaining=(tw.st_exercises||[]).filter((e:any)=>e.superset_group_id===groupId&&exerciseSection(e)===section);
   if(remaining.length===1) await supabase.from('st_exercises').update({superset_group_id:null,superset_label:null,superset_order:null}).eq('id',remaining[0].id);
  }
 }
 async function createCustomExercise(section:string, addToWorkout=true){
 if(!session?.user)return alert('Sign in to create exercises.');
 const draft=customDraft;
 const name=draft.name.trim(); if(!name)return alert('Enter an exercise name.');
 const movement=resolveCatalogMovementPattern(draft.movement_pattern); if(movement.error)return alert(movement.error);
 const{data,error}=await supabase.from('st_exercise_catalog').insert({user_id:session.user.id,name,category:draft.category||section,muscle_group:draft.muscle_group.trim()||null,equipment:draft.equipment.trim()||null,movement_pattern:movement.value,is_system:false,is_archived:false}).select().single();
 if(error)return alert(error.message);
 await loadCatalog();
 if(addToWorkout&&canEdit()&&workout){
  openAddExercisePanel(section);
  setAddExercisePanel((prev:any)=>prev?{...prev,step:'configure',picked:data,config:{...emptyAddPanelConfig(),setCount:sectionDefaultSets(section)}}:null);
  setCustomDraft({name:'',category:section,muscle_group:'',equipment:'',movement_pattern:''});
  setShowCustomForm({...showCustomForm,[section]:false});
 } else {
  setCustomDraft({name:'',category:section,muscle_group:'',equipment:'',movement_pattern:''});
  setShowCustomForm({...showCustomForm,[section]:false});
  alert('Saved to your exercise catalog.');
 }
 }
 async function saveCustomExerciseEdit(){
 if(!catalogEditId)return;
 const movement=resolveCatalogMovementPattern(catalogEditDraft.movement_pattern); if(movement.error)return alert(movement.error);
 const payload={name:catalogEditDraft.name.trim(),category:catalogEditDraft.category.trim(),muscle_group:catalogEditDraft.muscle_group.trim()||null,equipment:catalogEditDraft.equipment.trim()||null,movement_pattern:movement.value};
 if(!payload.name)return alert('Exercise name is required.');
 const{error}=await supabase.from('st_exercise_catalog').update(payload).eq('id',catalogEditId).eq('user_id',session.user.id);
 if(error)return alert(error.message);
 setCatalogEditId(null);
 await loadCatalog();
 }
 async function archiveCustomExercise(item:any,archived=true){
 if(item.is_system)return alert('System exercises cannot be archived.');
 const{error}=await supabase.from('st_exercise_catalog').update({is_archived:archived}).eq('id',item.id).eq('user_id',session.user.id);
 if(error)return alert(error.message);
 await loadCatalog();
 }
 async function archiveAllCustomExercises(){
 const custom=catalog.filter((c:any)=>!c.is_system&&c.user_id===session?.user?.id&&!c.is_archived);
 if(!custom.length)return;
 if(!confirm(`Remove all ${custom.length} custom exercise${custom.length===1?'':'s'} from your catalog? They will be archived and hidden from workout search.`))return;
 const{error}=await supabase.from('st_exercise_catalog').update({is_archived:true}).eq('user_id',session.user.id).eq('is_system',false).eq('is_archived',false);
 if(error)return alert(error.message);
 await loadCatalog();
 }
 function applyExercisePatchesWhileLogging(applied:Array<{workoutId:string;exerciseId:string;patch:Record<string,unknown>}>,openWorkoutId?:string|null){
  if(!applied.length)return;
  const openId=openWorkoutId||planEditRef.current?.workout?.id||activeWorkout||null;
  setProgram((prev:any)=>{
   const preferred=planEditRef.current?.program;
   const base=preferred?.id&&preferred.id!==prev?.id?preferred:prev;
   const next=patchExerciseCatalogInProgram(base,applied)||base;
   const visible=(openId&&findWorkoutInProgram(next,openId))||planEditRef.current?.workout||null;
   planEditRef.current=visible||next?{workout:visible||planEditRef.current?.workout||null,program:next}:planEditRef.current;
   return next;
  });
  setCalendarWorkouts((prev:any[])=>patchExerciseCatalogInProgram({st_workouts:prev||[]},applied)?.st_workouts||prev);
  setGroupActivityWorkout((prev:any)=>{
   if(!prev?.id)return prev;
   const next=patchExerciseCatalogInProgram({st_workouts:[prev]},applied)?.st_workouts?.[0]||prev;
   if(openId&&next?.id===openId&&planEditRef.current)planEditRef.current={...planEditRef.current,workout:next};
   return next;
  });
  if(session?.user?.id)markScreenStale(session.user.id,['program','schedule']);
 }
 async function updateExerciseField(ex:any,field:string,value:string,opts?:{onResolved?:(matchedId:string)=>void}):Promise<{ok:boolean;matchedId?:string;error?:string}>{
 const fail=(message:string)=>{alert(message);return {ok:false as const,error:message};};
 if(!(await ensurePersonalCopyForTrainingEdit()))return fail('Could not open your private copy for this edit.');
 const current=planEditRef.current?.workout||workout;
 if(!current)return fail('Could not find this workout after making your private copy.');
 const section=exerciseSection(ex);
 let payload:Record<string,any>={[field]:value};
 if(field==='name'){
  const trimmed=value.trim();
  if(!trimmed)return fail('Enter an exercise name.');
  const searchPool=workoutSearchCatalogItems(catalog,session?.user?.id);
  const hit=matchExerciseToCatalog(trimmed,searchPool,catalogByName(searchPool))||pickCanonicalCatalogItem(catalog,trimmed);
  if(hit)payload=catalogPayloadFromItem(hit,section,ex);
  else payload={name:trimmed,catalog_exercise_id:null};
 }
 const currentMatch=resolveExerciseTarget(current,ex,current);
 if(!currentMatch?.id)return fail('Could not find this exercise after making your private copy.');
 opts?.onResolved?.(String(currentMatch.id));
 const equipmentScope=field==='equipment'
  ?equipmentEditScope({applyScope,scopeControlVisible:showEditScope})
  :undefined;
 const targets=equipmentScope
  ?targetWorkoutsFrom(current,planEditRef.current?.program||program,equipmentScope)
  :targetWorkoutsFrom(current);
 const previousEquipment=field==='equipment'?String(currentMatch.equipment||'').trim():'';
 const applied:Array<{workoutId:string;exerciseId:string;patch:Record<string,unknown>}>=[];
 let wroteCurrent=false;
 for(const tw of targets){
  const match=resolveExerciseTarget(tw,ex,current);
  if(!match?.id){
   if(tw?.id===current?.id)return fail('Could not find this exercise after making your private copy.');
   continue;
  }
  let written:Record<string,any>=payload;
  if(field==='equipment'){
   const decision=equipmentWriteForTarget({
    selected:value,
    previousEquipment,
    targetEquipment:match.equipment,
    isCurrent:tw?.id===current?.id,
   });
   if(!decision.write){
    if(tw?.id===current?.id)return fail('Could not save this equipment choice.');
    continue;
   }
   written={equipment:decision.equipment};
  }
  let{data,error}=await supabase.from('st_exercises').update(written).eq('id',match.id).select('id');
  if(error&&written.equipment!==undefined&&/equipment/i.test(error.message||'')){
   const{equipment:_eq,...rest}=written;
   if(!Object.keys(rest).length)return fail(error.message);
   written=rest;
   ({data,error}=await supabase.from('st_exercises').update(written).eq('id',match.id).select('id'));
  }
  if(error)return fail(friendlyWriteError(error));
  if(!exerciseUpdateTouchedRow(data))return fail('Could not save this exercise change.');
  applied.push({workoutId:String(tw.id),exerciseId:String(match.id),patch:written});
  if(tw?.id===current?.id)wroteCurrent=true;
 }
 if(!wroteCurrent)return fail('Could not save this exercise change.');
 // Logger-open reloads are blocked from replacing the program tree, so patch the
 // live workout immediately. Otherwise equipment pending clears and the picker
 // snaps back to "Select equipment" until the user leaves and returns.
 applyExercisePatchesWhileLogging(applied,current.id);
 await reloadKeepDay();
 return {ok:true,matchedId:String(currentMatch.id)};
}
 function restoreExerciseEdit(programRemoved:RemovedExercise[],calendarRemoved:RemovedExercise[]){
  if(programRemoved.length)setProgram((prev:any)=>restoreRemovedExercises(prev,programRemoved));
  if(calendarRemoved.length)setCalendarWorkouts((prev:any[])=>restoreRemovedWorkoutList(prev,calendarRemoved));
 }
 function keepUnsavedSetValues(setIds:string[]){
  setLogs((prev:any)=>{
   const next={...prev};
   setIds.forEach((id)=>{
    const ledger=setLogLedgersRef.current.get(id);
    if(!ledger||!Object.keys(ledger.overlay||{}).length)return;
    next[id]={...(next[id]||{}),...ledger.overlay,planned_set_id:id};
   });
   return next;
  });
 }
 function setEditsForRemoval(setIds:string[]){
  const gate=unsavedSetLogGate(setLogLedgersRef.current,new Set(setIds));
  const fieldKeys:string[]=[];
  loggerPendingKeysRef.current.forEach((read)=>{fieldKeys.push(...read());});
  const debounced=setIdsInPendingFieldKeys(setIds,fieldKeys);
  const queued=setIds.filter((id)=>!!upsertQueueRef.current[id]);
  const pending:string[]=[];
  [...gate.pending,...debounced,...queued].forEach((id)=>{
   if(gate.failed.indexOf(id)===-1&&pending.indexOf(id)===-1)pending.push(id);
  });
  return exerciseRemovalAfterSetEdits({pendingSetIds:pending,failedSetIds:gate.failed});
 }
 async function removeExercise(e:any){
  if(!e?.id||exerciseMutationRef.current.has(e.id))return;
  exerciseMutationRef.current.add(e.id);
  const locked=new Set<string>([e.id]);
  let programResult:{program:any;removed:RemovedExercise[]}|null=null;
  let calendarResult:{workouts:any[];removed:RemovedExercise[]}|null=null;
  const deleted=new Set<string>();
  try{
   const ctx=await ensurePersonalCopyForTrainingEdit();
   if(!ctx?.workout||!ctx.program)return;
   const current=ctx.workout;
   const msg=(!isSharedTemplateEditor()||applyScope!=='future')?'Remove this exercise from this workout only?':'Remove this exercise from this week and all future weeks?';
   if(!confirm(msg))return;
   const baseProgram=program?.id===ctx.program.id?program:ctx.program;
   const targets=targetWorkoutsFrom(current,baseProgram);
   const matches:Array<{workoutId:string;exercise:any}>=[];
   targets.forEach((tw:any)=>{
    const match=resolveExerciseTarget(tw,e,current);
    if(match?.id)matches.push({workoutId:tw.id,exercise:match});
   });
   if(!matches.length)return alert('Could not find this exercise to remove. Try "This workout only" scope or break the superset first.');
   if(matches.some((match)=>!locked.has(match.exercise.id)&&exerciseMutationRef.current.has(match.exercise.id)))return;
   matches.forEach((match)=>{exerciseMutationRef.current.add(match.exercise.id);locked.add(match.exercise.id);});
   const spec=matches.map((match)=>({workoutId:match.workoutId,exerciseId:match.exercise.id}));
   const pendingMatches=matches.filter((match)=>isPendingExercise(match.exercise));
   pendingMatches.forEach((match)=>cancelledExerciseIdsRef.current.add(match.exercise.id));
   const realMatches=matches.filter((match)=>!isPendingExercise(match.exercise));
   const setIds=plannedSetIdsOf(realMatches.map((match)=>match.exercise));
   const groupId=e.superset_group_id;
   const section=exerciseSection(e);
   const started=beginExerciseEdit('remove');
   let step=setEditsForRemoval(setIds);
   if(step==='wait'){
    await flushMountedSetEdits();
    await awaitQueuedSetWrites();
    step=setEditsForRemoval(setIds);
   }
   if(step==='blocked'){
    keepUnsavedSetValues(setIds);
    noteExerciseEditFailure('remove','unsaved-set');
    alert('This exercise was not removed. A set did not save. Use Retry on that set, then remove the exercise again.');
    return;
   }
   if(step==='wait'){
    noteExerciseEditFailure('remove','still-saving');
    alert('This exercise was not removed. A set is still saving. Try again when that save finishes.');
    return;
   }
   exerciseEditEpochRef.current+=1;
   programResult=removeExercisesFromProgram(baseProgram,spec);
   calendarResult=removeExercisesFromWorkoutList(calendarWorkouts,spec);
   exerciseWriteHoldRef.current=realMatches.length?targets.filter((tw:any)=>realMatches.some((match)=>match.workoutId===tw.id)):[];
   setProgram(programResult.program);
   setCalendarWorkouts(calendarResult.workouts);
   const visible=findWorkoutInProgram(programResult.program,current.id)||calendarResult.workouts.find((item:any)=>item.id===current.id)||current;
   planEditRef.current={workout:visible,program:programResult.program};
   exerciseVisualRef.current={kind:'remove',mark:started,ids:matches.filter((match)=>match.workoutId===current.id).map((match)=>match.exercise.id),workoutId:current.id};
   const mutationStarted=typeof performance!=='undefined'?performance.now():Date.now();
   for(const match of matches){
    if(isPendingExercise(match.exercise)){deleted.add(match.exercise.id);continue;}
    const{error}=await supabase.from('st_exercises').delete().eq('id',match.exercise.id);
    if(error){
     restoreExerciseEdit(programResult.removed.filter((row)=>!deleted.has(row.exercise.id)),calendarResult.removed.filter((row)=>!deleted.has(row.exercise.id)));
     noteExerciseEditFailure('remove',error.message);
     alert(error.message);
     return;
    }
    deleted.add(match.exercise.id);
   }
   if(groupId)await cleanupSupersetOrphans(section,groupId);
   if(groupId&&section)setPendingSupersetGroup((prev:any)=>{const next={...prev};if(next[section]===groupId)next[section]=null;return next;});
   const finished=typeof performance!=='undefined'?performance.now():Date.now();
   noteExerciseEditMutation('remove',finished-mutationStarted);
   if(session?.user?.id)markScreenStale(session.user.id,['program']);
  }catch(error){
   if(programResult&&calendarResult)restoreExerciseEdit(programResult.removed.filter((row)=>!deleted.has(row.exercise.id)),calendarResult.removed.filter((row)=>!deleted.has(row.exercise.id)));
   const message=error instanceof Error?error.message:'Could not remove that exercise.';
   noteExerciseEditFailure('remove',message);
   alert(message);
  }finally{
   exerciseWriteHoldRef.current=[];
   locked.forEach((id)=>exerciseMutationRef.current.delete(id));
  }
 }
 async function moveExercise(e:any,dir:number){
 if(!(await ensurePersonalCopyForTrainingEdit()))return;
 const current=planEditRef.current?.workout||workout;
 if(!current)return;
 const section=exerciseSection(e);
 const gid=e.superset_group_id;
 if(gid){
  const groupMembers=sectionExercises(current,section).filter((x:any)=>x.superset_group_id===gid).sort((a:any,b:any)=>(a.superset_order||0)-(b.superset_order||0));
  const idx=groupMembers.findIndex((x:any)=>x.id===e.id);
  const innerSwap=idx+dir;
  if(innerSwap>=0&&innerSwap<groupMembers.length){
   const other=groupMembers[innerSwap];
   const myOrder=e.superset_order||idx+1;
   const otherOrder=other.superset_order||innerSwap+1;
   for(const tw of targetWorkoutsFrom(current)){
    const match=resolveExerciseTarget(tw,e,current);
    const otherMatch=resolveExerciseTarget(tw,other,current);
    if(match&&otherMatch){
     await supabase.from('st_exercises').update({superset_order:otherOrder}).eq('id',match.id);
     await supabase.from('st_exercises').update({superset_order:myOrder}).eq('id',otherMatch.id);
    }
   }
   await reloadKeepDay();
   return;
  }
 }
 const exercises=sectionExercises(current,section);
 const blocks=groupSectionBlocks(exercises);
 const blockIdx=blocks.findIndex((b:any)=>b.type==='superset'?b.exercises.some((x:any)=>x.id===e.id):b.exercises[0]?.id===e.id);
 const swapIdx=blockIdx+dir;
 if(blockIdx<0||swapIdx<0||swapIdx>=blocks.length)return;
 const reordered=[...blocks];
 const tmp=reordered[blockIdx];reordered[blockIdx]=reordered[swapIdx];reordered[swapIdx]=tmp;
 const base=SECTION_SORT_BASE[section]??100;
 let sort=base;
 const plan:any[]=[];
 reordered.forEach((b:any)=>{b.exercises.forEach((ex:any)=>{plan.push({source:ex,sort_order:sort});sort++;});});
 for(const tw of targetWorkoutsFrom(current)){
  for(const row of plan){
   const match=resolveExerciseTarget(tw,row.source,current);
   if(match) await supabase.from('st_exercises').update({sort_order:row.sort_order}).eq('id',match.id);
  }
 }
 await reloadKeepDay();
}
 async function addSet(e:any){
 if(!(await ensurePersonalCopyForTrainingEdit()))return;
 const current=planEditRef.current?.workout||workout;
 const active=(e.st_planned_sets||[]).filter((s:any)=>!s.is_deleted);
 const n=active.length?Math.max(...active.map((s:any)=>s.set_number||0))+1:1;
 const sort_order=active.length?Math.max(...active.map((s:any)=>s.sort_order||0))+1:0;
 for(const tw of targetWorkoutsFrom(current)){
  const targetEx=resolveExerciseTarget(tw,e,current);
  if(targetEx) await supabase.from('st_planned_sets').insert({exercise_id:targetEx.id,sort_order,set_number:n,set_type:'working'});
 }
 await reloadKeepDay();
}
 function sourceExerciseForSet(setId:string){
  const before=planEditRef.current?.workout||workout;
  return (before?.st_exercises||[]).find((exercise:any)=>(exercise.st_planned_sets||[]).some((set:any)=>set.id===setId))
    ||(workout?.st_exercises||[]).find((exercise:any)=>(exercise.st_planned_sets||[]).some((set:any)=>set.id===setId))
    ||null;
 }
 function plannedSetWasLogged(setId:string){
  const row=logsRef.current?.[setId];
  return !!(row&&(row.completed===true||logHasPerformance(row)));
 }
 function applyOpenPlannedSetChange(ids:string[],change:{setType?:string;deleted?:boolean}){
  const mapProgram=(prog:any)=>change.deleted?applyProgramSetDeleted(prog,ids):applyProgramSetType(prog,ids,change.setType||'working');
  const mapWorkout=(item:any)=>change.deleted?applyWorkoutSetDeleted(item,ids):applyWorkoutSetType(item,ids,change.setType||'working');
  const baseProgram=planEditRef.current?.program||program;
  const nextProgram=mapProgram(baseProgram);
  const nextWorkout=planEditRef.current?.workout?mapWorkout(planEditRef.current.workout):planEditRef.current?.workout;
  if(planEditRef.current)planEditRef.current={program:nextProgram,workout:nextWorkout};
  setProgram(nextProgram);
  setCalendarWorkouts((prev:any[])=>(prev||[]).map(mapWorkout));
  setGroupActivityWorkout((prev:any)=>prev?mapWorkout(prev):prev);
  if(change.setType){
    const next=applyLogSnapshotType(logsRef.current||{},ids,change.setType);
    logsRef.current=next;
    setLogs(next);
  }
 }
 async function editSet(s:any,field:string,value:any){
  const sourceExercise=sourceExerciseForSet(s?.id);
  const ctx=await ensurePersonalCopyForTrainingEdit();
  if(!ctx?.workout)return;
  if(!sourceExercise)return alert('Could not find this set. Nothing was changed.');
  const resolved=resolvePlannedSetTargets({sourceExercise,sourceSet:s,targetWorkouts:targetWorkoutsFrom(ctx.workout,ctx.program)});
  if(resolved.ok===false)return alert(resolved.reason);
  if(field==='set_type'){
    if(!isCorrectableSetType(String(value||'')))return alert('Choose a set type.');
    const logDate=activeLogDateForLogging();
    let outcome;
    try{
      outcome=await plannedSetEditQueue(resolved.ids,async()=>{
        await flushMountedSetEdits();
        await awaitQueuedSetWrites();
        return correctPlannedSetType(supabase,resolved.ids,String(value),logDate);
      });
    }catch(err:any){
      return alert(err?.message||'Could not change that set.');
    }
    if(!outcome.ok)return alert(outcome.error);
    applyOpenPlannedSetChange(resolved.ids,{setType:String(value)});
    await reloadKeepDay();
    return;
  }
  const rewrite=canRewritePlannedSetPrescription({plannedSetId:s.id,logs:Object.values(logsRef.current||{})});
  if(!rewrite.ok){alert(rewrite.reason);return;}
  const outcome=await plannedSetEditQueue(resolved.ids,async()=>{
    for(const id of resolved.ids){
      const{error}=await supabase.from('st_planned_sets').update({[field]:value}).eq('id',id);
      if(error)return error.message;
    }
    return '';
  });
  if(outcome)return alert(outcome);
  await reloadKeepDay();
 }
 async function removeSet(s:any){
  const sourceExercise=sourceExerciseForSet(s?.id);
  const ctx=await ensurePersonalCopyForTrainingEdit();
  if(!ctx?.workout)return;
  if(!sourceExercise)return alert('Could not find this set. Nothing was changed.');
  const resolved=resolvePlannedSetTargets({sourceExercise,sourceSet:s,targetWorkouts:targetWorkoutsFrom(ctx.workout,ctx.program)});
  if(resolved.ok===false)return alert(resolved.reason);
  const logged=resolved.ids.some((id)=>plannedSetWasLogged(id))||plannedSetWasLogged(s.id);
  if(logged&&!confirm(LOGGED_SET_REMOVAL_CONFIRMATION))return;
  let outcome;
  try{
    outcome=await plannedSetEditQueue(resolved.ids,async()=>{
      await flushMountedSetEdits();
      await awaitQueuedSetWrites();
      return softDeletePlannedSets(supabase,resolved.ids);
    });
  }catch(err:any){
    return alert(err?.message||'Could not remove that set.');
  }
  if(!outcome.ok)return alert(outcome.error);
  applyOpenPlannedSetChange(resolved.ids,{deleted:true});
  await reloadKeepDay();
 }
 function loggingSessionLinks(workoutRef?:any){
  const activity=groupActivityLogRef.current;
  if(activity){
   return {
    expectation_id:null as string|null,
    source_key:groupActivitySourceKey(activity.seriesId),
    scheduled_date:activity.scheduledDate,
    program_id:workoutRef?.program_id||groupActivityWorkoutRef.current?.program_id||null,
   };
  }
  return {
   expectation_id:activeExpectationId,
   source_key:activeExpectationSource,
   scheduled_date:activeExpectationDate,
   program_id:program?.id||null,
  };
 }
 async function completeOpenGroupActivity(activity=groupActivityLogRef.current){
  if(!activity) return true;
  const {error}=await supabase.rpc('st_complete_group_activity_occurrence',{
   p_series_id:activity.seriesId,
   p_user_id:activity.memberUserId,
   p_original_date:activity.originalDate,
  });
  if(error){
   alert(error.message);
   return false;
  }
  return true;
 }
 async function saveLog(sid:string,field:string,value:any,opts?:{completed?:boolean}):Promise<SetLogSaveResult>{
  if(isPendingExerciseId(sid))return {ok:false,stale:false,error:'This exercise is still being added.'};
  if(customizeForMeBusy||personalCopyFlightRef.current)return {ok:false,stale:false,error:'Making your private copy… try again in a moment.'};
  if(!canLog())return {ok:false,stale:false,error:'You cannot log sets for this workout.'};
  return upsertSetLog(sid,{[field]:value},opts);
 }
 async function writeSetLogRow(run:()=>PromiseLike<{data:any;error:any}>){
  return retryTransientSupabaseWrite(run,{attempts:3,delayMs:400});
 }
 function ledgerForSetLog(sid:string){
  let ledger=setLogLedgersRef.current.get(sid);
  if(!ledger){
   ledger=new SetLogIntentLedger();
   setLogLedgersRef.current.set(sid,ledger);
  }
  return ledger;
 }
 function scheduleSetLogDrain(sid:string){
  const ledger=ledgerForSetLog(sid);
  if(ledger.draining)return;
  let tracked:Promise<void>;
  tracked=drainSetLogIntent(ledger,async(updates)=>{
   const started=typeof performance!=='undefined'?performance.now():Date.now();
   const outcome=await loggerActionsRef.current.executeSetLogWrite(sid,updates);
   const finished=typeof performance!=='undefined'?performance.now():Date.now();
   noteLoggerSave(finished-started);
   return outcome||{ok:false,error:'Could not save that set.'};
  },{
   coalesceMs:SET_LOG_WRITE_COALESCE_MS,
   onApplied:async(version,data,updates)=>{
    const oldCompleted=!!logsRef.current[sid]?.completed;
    const nextLogs=loggerActionsRef.current.applyConfirmedSetLog(sid,data);
    setLogFollowRef.current.set(sid,{version,data,updates,oldCompleted,nextLogs});
   },
   onFollowUp:async(version)=>{
    await loggerActionsRef.current.runSetLogFollowUp(sid,version);
   },
  }).finally(()=>{
   if(upsertQueueRef.current[sid]===tracked)delete upsertQueueRef.current[sid];
   const again=ledgerForSetLog(sid);
   if(!again.draining&&again.snapshot())scheduleSetLogDrain(sid);
  });
  upsertQueueRef.current[sid]=tracked;
 }
 async function upsertSetLog(sid:string,fieldUpdates:Record<string,any>,opts?:{completed?:boolean}):Promise<SetLogSaveResult>{
  if(isPendingExerciseId(sid))return {ok:false,stale:false,error:'This exercise is still being added.'};
  if(customizeForMeBusy||personalCopyFlightRef.current)return {ok:false,stale:false,error:'Making your private copy… try again in a moment.'};
  if(!canLog())return {ok:false,stale:false,error:'You cannot log sets for this workout.'};
  const ledger=ledgerForSetLog(sid);
  const result=ledger.push(fieldUpdates||{},opts?.completed);
  scheduleSetLogDrain(sid);
  return result;
 }
 async function retrySetLog(sid:string):Promise<SetLogSaveResult>{
  const ledger=setLogLedgersRef.current.get(sid);
  if(!ledger)return {ok:false,stale:false,error:'Nothing to retry for that set.'};
  const result=ledger.retry();
  scheduleSetLogDrain(sid);
  return result;
 }
 async function executeSetLogWrite(sid:string,fieldUpdates:Record<string,any>){
  try{
  if(customizeForMeBusy||personalCopyFlightRef.current)return {ok:false,error:'Making your private copy… try again in a moment.'};
  const old=logsRef.current[sid]||{};
  const located=findSetInProgram(activeProgramForLogging(),sid,extraWorkoutsForLogging());
  if(!located) return {ok:false,error:'Could not save log for this set.'};
  const {workout:workoutRef,exercise:ex,plannedSet:ps}=located;
  if(isPendingExercise(ex))return {ok:false,error:'This exercise is still being added.'};
  const catItem=catalog.find((c:any)=>c.id===ex.catalog_exercise_id);
  const chosenEquipment=equipmentChoiceFor(ex,catItem);
  const equipmentBlockReason=equipmentChoiceBlockReason(chosenEquipment);
  if(equipmentBlockReason)return {ok:false,error:equipmentBlockReason};
  const exType=exerciseTypeOf(ex,catItem);
  const fieldKeys=logFieldsForType(exType).map((f:any)=>f.key);
  const uid=logUserId();
  if(!session?.user||!uid)return {ok:false,error:'You cannot log sets for this workout.'};
  const coachLogging=uid!==session.user.id;
  const activity=groupActivityLogRef.current;
  const expectationTeam=!activity&&activeExpectationSource?.startsWith('group:')&&!activeExpectationSource.startsWith('group-activity:')?activeExpectationSource.slice('group:'.length):null;
  const logTeamId=activity?.teamId||activeAssignedRecipient?.st_workout_assignments?.team_id||expectationTeam||(activeExpectationId?null:(mode==='team'&&activeTeam?activeTeam.id:null));
  const updatingCompleted=Object.prototype.hasOwnProperty.call(fieldUpdates,'completed');
  const markComplete=updatingCompleted?!!fieldUpdates.completed:!!old.completed;
  const logDay=activeLogDateForLogging();
  const snapshots=snapshotForLog(ex,ps,workoutRef,catItem,chosenEquipment.equipment);
  const payload:any={
    planned_set_id:sid,
    user_id:uid,
    logged_by_user_id:uuidOrNull(coachLogging?session.user.id:null),
    team_id:uuidOrNull(logTeamId),
    log_date:logDay,
    completed:markComplete
  };
  const allKeys=Array.from(new Set([...fieldKeys,'actual_weight','actual_reps','actual_rpe','actual_rir','actual_duration','actual_distance','actual_pace','actual_hr','actual_calories','log_notes']));
  allKeys.forEach((k:string)=>{
    const raw=Object.prototype.hasOwnProperty.call(fieldUpdates,k)?fieldUpdates[k]:old[k];
    payload[k]=coerceSetLogValue(k,raw);
  });
  const missingColumn=/actual_rir|pain_score|snapshot_|invalid input syntax for type (smallint|integer|numeric|uuid)/i;
  let body:any=old?.id?{...payload}:{...payload,...snapshots};
  let{data,error}=old?.id
    ?await writeSetLogRow(()=>supabase.from('st_set_logs').update(payload).eq('id',old.id).eq('user_id',uid).select().single())
    :await writeSetLogRow(()=>supabase.from('st_set_logs').insert(body).select().single());
  if(!old?.id && error && /duplicate key|23505/i.test(`${error.code||''} ${error.message||''}`)){
    ({data,error}=await writeSetLogRow(()=>supabase.from('st_set_logs').update(payload).eq('planned_set_id',sid).eq('user_id',uid).eq('log_date',logDay).select().single()));
  }
  for(let attempt=0;error && missingColumn.test(error.message||'') && attempt<8;attempt++){
    body=stripUnavailableLogColumns(body, error.message);
    if(old?.id){
      ({data,error}=await writeSetLogRow(()=>supabase.from('st_set_logs').update(stripUnavailableLogColumns(payload, error.message)).eq('id',old.id).eq('user_id',uid).select().single()));
    }else{
      ({data,error}=await writeSetLogRow(()=>supabase.from('st_set_logs').insert(body).select().single()));
      if(error && /duplicate key|23505/i.test(`${error.code||''} ${error.message||''}`)){
        ({data,error}=await writeSetLogRow(()=>supabase.from('st_set_logs').update(payload).eq('planned_set_id',sid).eq('user_id',uid).eq('log_date',logDay).select().single()));
      }
    }
  }
  if(error)return {ok:false,error:friendlyWriteError(error,'Could not save that set. Please try again.')};
  return {ok:true,data};
  }catch(e){
   return {ok:false,error:friendlyWriteError(e,'Could not save that set. Please try again.')};
  }
 }
 function applyConfirmedSetLog(sid:string,data:any){
  if(session?.user?.id) markScreenStale(session.user.id,['schedule','progress','dashboard']);
  const next={...logsRef.current,[sid]:data};
  logsRef.current=next;
  setLogs(next);
  setProgressLogs((prev:any[])=>{
    const rest=(prev||[]).filter((row:any)=>row?.id!==data?.id);
    return data?.completed||logHasPerformance(data)?[data,...rest]:rest;
  });
  return next;
 }
 async function runSetLogFollowUp(sid:string,version:number){
  const payload=setLogFollowRef.current.get(sid);
  if(!payload||payload.version!==version)return;
  setLogFollowRef.current.delete(sid);
  const {data,updates,oldCompleted,nextLogs}=payload;
  const located=findSetInProgram(activeProgramForLogging(),sid,extraWorkoutsForLogging());
  if(!located)return;
  const updatingCompleted=Object.prototype.hasOwnProperty.call(updates||{},'completed');
  const markComplete=updatingCompleted?!!updates.completed:!!data?.completed;
  const logDay=activeLogDateForLogging();
  const uid=logUserId();
  const activity=groupActivityLogRef.current;
  if(activeAssignedRecipient&&located.workout){
    await maybeCompleteAssignedWorkout(located.workout,nextLogs);
  }
  if(automaticSessionCompletionAllowed(finishOwnsSessionRef.current)&&updatingCompleted&&markComplete&&located.workout&&trainingSessionIntent==='log'&&uid&&session?.user&&uid===session.user.id){
    const sessionKey=`${uid}|${located.workout.id}|${logDay}`;
    const explicit=completedSessionKeyRef.current===sessionKey?'completed':(sessionOutcome==='partial'||sessionOutcome==='skipped'?sessionOutcome:null);
    const draft=completedSessionDraft({
      intent:trainingSessionIntent,
      workout:located.workout,
      logs:nextLogs,
      logDate:logDay,
      expectationId:activeExpectationId,
      sourceKey:activeExpectationSource,
      scheduledDate:activeExpectationDate,
      existingStatus:explicit,
    });
    if(draft&&completedSessionKeyRef.current!==sessionKey){
      completedSessionKeyRef.current=sessionKey;
      const links=loggingSessionLinks(located.workout);
      const savedSession=await upsertWorkoutSession(supabase,{
        user_id:uid,
        workout_id:draft.workoutId,
        program_id:links.program_id,
        log_date:draft.logDate,
        status:'completed',
        expectation_id:links.expectation_id,
        source_key:links.source_key,
        scheduled_date:links.scheduled_date,
      });
      if(savedSession.pendingMigration)setPhase2a1Pending(true);
      if(savedSession.error||savedSession.pendingMigration){
        if(completedSessionKeyRef.current===sessionKey)completedSessionKeyRef.current=null;
        if(savedSession.error)alert(friendlyWriteError(savedSession.error,'Your set was saved. Workout completion could not finish — try again.'));
      }else if(workout?.id===draft.workoutId){
        setSessionOutcome('completed');
        if(activity) await completeOpenGroupActivity(activity);
      }
    }
  }
  if(updatingCompleted&&markComplete){
   maybeAutoAdvanceExercise(located.exercise,nextLogs,located.workout);
   if(!oldCompleted){
    const weightUnit=profileDraft?.units_preference==='metric'?'kg':'lb';
    const celebration=detectSetPersonalRecord(data,priorCompletedLogsForPr(sid,logDay),weightUnit);
    if(celebration)showPrCelebration(celebration);
   }
  }
 }
 function maybeAutoAdvanceExercise(exercise:any,logMap:any,workoutRef:any){
  if(!exercise||!workoutRef||exerciseSection(exercise)==='warmup')return;
  const activeSets=(exercise.st_planned_sets||[]).filter((s:any)=>!s.is_deleted);
  if(!activeSets.length)return;
  const allDone=activeSets.every((s:any)=>logMap[s.id]?.completed);
  if(!allDone)return;
  const ordered=workoutExercisesInOrder(workoutRef);
  const nextId=nextWorkoutExerciseId(ordered,exercise.id);
  if(!nextId)return;
  const nextEx=ordered.find((e:any)=>e.id===nextId);
  if(!nextEx)return;
  setCollapsedExercises((prev:any)=>({...prev,[exercise.id]:true,[nextEx.id]:false}));
  if(typeof window!=='undefined'){
    requestAnimationFrame(()=>{
      window.setTimeout(()=>{
        const head=document.querySelector(`[data-exercise-head="${nextEx.id}"]`);
        head?.scrollIntoView({behavior:'smooth',block:'center'});
      },180);
    });
  }
 }
 function sessionFeedbackOverlayOpen(){
  return !!(addExercisePanel||exerciseHistoryModal||exerciseGuide||bugOpen||strengthSetup||trainingAddActivityOpen||trainingMoveItem||trainingEditActivity||exerciseSwapPrompt);
 }
 function collapseSessionFeedback(){
  setSessionFeedbackExpanded(false);
  sessionFeedbackOpenerRef.current?.focus?.();
 }
 function revealSessionFeedback(from?:HTMLElement|null){
  if(from)sessionFeedbackOpenerRef.current=from;
  setSessionFeedbackExpanded(true);
  if(typeof window==='undefined')return;
  const align=()=>{
    const panel=document.getElementById(SESSION_FEEDBACK_PANEL_ID);
    panel?.scrollIntoView(sessionFeedbackRevealScroll());
    document.getElementById(SESSION_FEEDBACK_TITLE_ID)?.focus?.();
  };
  requestAnimationFrame(()=>window.setTimeout(align,0));
 }
 useEffect(()=>{
  if(!sessionFeedbackExpanded)return;
  const onKey=(event:KeyboardEvent)=>{
    if(!sessionFeedbackEscapeCollapses({key:event.key,expanded:true,overlayOpen:sessionFeedbackOverlayOpen()}))return;
    event.preventDefault();
    collapseSessionFeedback();
  };
  document.addEventListener('keydown',onKey);
  return()=>document.removeEventListener('keydown',onKey);
 },[sessionFeedbackExpanded,addExercisePanel,exerciseHistoryModal,exerciseGuide,bugOpen,strengthSetup,trainingAddActivityOpen,trainingMoveItem,trainingEditActivity,exerciseSwapPrompt]);
 async function flushMountedSetEdits(){
  const flushes=Array.from(loggerFlushesRef.current);
  await Promise.all(flushes.map((flush)=>flush().catch(()=>{})));
 }
 async function awaitQueuedSetWrites(){
  for(let pass=0; pass<8; pass++){
   const pending=Object.values(upsertQueueRef.current);
   if(!pending.length)return;
   await Promise.all(pending.map((p)=>Promise.resolve(p).catch(()=>{})));
  }
 }
 function rememberSessionFeedback(extras?:{feel?:WorkoutFeel|'';pain?:PainFlag;notes?:string;skipReason?:SkipReason|''}){
  if(!extras)return;
  if(extras.feel!==undefined){sessionFeelLiveRef.current=extras.feel;setSessionFeel(extras.feel);}
  if(extras.pain!==undefined){sessionPainLiveRef.current=extras.pain;setSessionPain(extras.pain);}
  if(extras.notes!==undefined){sessionNotesLiveRef.current=extras.notes;setSessionNotes(extras.notes);}
  if(extras.skipReason!==undefined){sessionSkipLiveRef.current=extras.skipReason;setSessionSkipReason(extras.skipReason);}
 }
 function requiredSetLogGate(){
  return unsavedSetLogGate(setLogLedgersRef.current, new Set(plannedSetIdsForWorkout(workout,{loggableOnly:true})));
 }
 async function saveSessionOutcome(next:SessionStatus, extras?:{feel?:WorkoutFeel|'';pain?:PainFlag;notes?:string;skipReason?:SkipReason|''}){
  if(!session?.user||!workout)return;
  rememberSessionFeedback(extras);
  async function commitSessionOutcome(){
  const activity=groupActivityLogRef.current;
  const previousOutcome=sessionOutcome;
  const feel=sessionFeelLiveRef.current;
  const pain=sessionPainLiveRef.current;
  const notes=sessionNotesLiveRef.current;
  const skipReason=sessionSkipLiveRef.current;
  setSessionOutcome(next);
  const feelRes=await upsertWorkoutFeel(supabase,{userId:session.user.id,workoutId:workout.id,logDate:activeLogDateForLogging(),draft:{workout_feel:feel||null,pain_flag:normalizePainFlag(pain),notes}});
  if(feelRes.pendingMigration)setPhase2a1Pending(true);
  const links=loggingSessionLinks(workout);
  const saved=await upsertWorkoutSession(supabase,{
    user_id:session.user.id,
    workout_id:workout.id,
    program_id:links.program_id,
    log_date:activeLogDateForLogging(),
    status:next,
    skip_reason:skipReason||null,
    duration_minutes:null,
    feedback_id:feelRes.id,
    expectation_id:links.expectation_id,
    source_key:links.source_key,
    scheduled_date:links.scheduled_date,
  });
  if(saved.pendingMigration)setPhase2a1Pending(true);
  if(saved.error){
    setSessionOutcome(previousOutcome);
    alert(saved.error);
    return;
  }
  if(session?.user?.id) markScreenStale(session.user.id,['schedule','progress','dashboard','groups']);
  const savedKey=`${session.user.id}|${workout.id}|${activeLogDateForLogging()}`;
  if(next==='completed')completedSessionKeyRef.current=savedKey;
  else if(completedSessionKeyRef.current===savedKey)completedSessionKeyRef.current=null;
  if(activity){
    if(next==='completed'&&!saved.pendingMigration) await completeOpenGroupActivity(activity);
    return;
  }
  if(saved.pendingMigration)return;
  if(extras)return;
  if(next!=='completed'&&next!=='partial')return;
  if(!session.access_token)return;
  try{
    const {shouldTriggerCompletedWorkoutAdaptation}=await import('../lib/training/adaptationOrchestration');
    if(!shouldTriggerCompletedWorkoutAdaptation(next))return;
    const res=await fetch('/api/training/adapt-completed-workout',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
      body:JSON.stringify({workout_id:workout.id,log_date:activeLogDateForLogging()}),
    });
    const data=await res.json().catch(()=>({}));
    const summary=data as AdaptationOrchestrationResult;
    if(summary?.summary)setAdaptationSummary(summary);
    if(summary?.mutations?.length){
      setProgram((prev:any)=>patchProgramPlannedWeights(prev,summary.mutations));
    }
  }catch{
    setAdaptationSummary({
      triggered:true,
      skipped_reason:null,
      limitation:null,
      evaluated:0,
      updated:0,
      held:0,
      review:0,
      failed:1,
      already_applied:0,
      pending_retry:true,
      summary:'Workout complete. Adaptation could not finish and can retry safely.',
      mutations:[],
      results:[],
    error:'Adaptation request failed',
    orchestration_version:'2b1.0.0',
   });
  }
  }
  if(!extras){
   const joined=finishFlightRef.current.inFlight();
   const result=await finishFlightRef.current.start({
    begin(){finishOwnsSessionRef.current=true;},
    flushDebouncedEdits:flushMountedSetEdits,
    awaitSetWrites:awaitQueuedSetWrites,
    unconfirmedRequiredSets(){
     const gate=requiredSetLogGate();
     return {failed:gate.failed, pending:gate.pending};
    },
    persistSession:commitSessionOutcome,
    end(){finishOwnsSessionRef.current=false;},
   });
   if(!joined&&!result.proceeded){
    alert(result.failedSetIds.length
     ? 'A required set did not save. Retry it before finishing this workout. The entered values stay on the set.'
     : 'A required set is still saving. Wait until it finishes, then finish the workout.');
   }
   return;
  }
  if(finishFlightRef.current.inFlight())return;
  await awaitQueuedSetWrites();
  if(requiredSetLogGate().blocked)return;
  await commitSessionOutcome();
 }
 async function addExtraWorkingSet(ex:any){
  if(!session?.user||!workout||!canLog())return;
  const date=activeLogDateForLogging();
  const existing=extraSetsForExercise(extraSetLogs,ex.id,date);
  const setNumber=nextExtraSetNumber(existing);
  const catItem=catalog.find((c:any)=>c.id===ex.catalog_exercise_id);
  const chosenEquipment=equipmentChoiceFor(ex,catItem);
  const equipmentBlockReason=equipmentChoiceBlockReason(chosenEquipment);
  if(equipmentBlockReason){alert(equipmentBlockReason);return;}
  const snapshots=snapshotForLog(ex,{set_type:'working',set_number:setNumber},workout,catItem,chosenEquipment.equipment);
  const row:ExtraSetLog={
    user_id:session.user.id,
    exercise_id:ex.id,
    catalog_exercise_id:ex.catalog_exercise_id||null,
    team_id:groupActivityLogRef.current?.teamId||null,
    log_date:date,
    extra_set_number:setNumber,
    set_type:'working',
    ...snapshots
  };
  try{
  const {data,error}=await writeSetLogRow(()=>supabase.from('st_set_logs').insert(extraSetInsertPayload(row)).select().single());
  if(error){
    if(/is_extra_set|extra_set_number|does not exist/i.test(error.message||'')){setPhase2a1Pending(true);alert('Extra sets need the Phase 2A.1 migration.');return;}
    return alert(friendlyWriteError(error,'Could not add that extra set. Please try again.'));
  }
  setExtraSetLogs((prev)=>[...prev,data as ExtraSetLog]);
  }catch(e){
   alert(friendlyWriteError(e,'Could not add that extra set. Please try again.'));
  }
 }
 async function saveExtraSetField(extraId:string,field:string,value:string,opts?:{completed?:boolean}){
  if(String(field).startsWith('snapshot_'))return;
  const patch:any={[field]:value};
  if(opts?.completed!==undefined)patch.completed=opts.completed;
  if(field==='completed')patch.completed=opts?.completed??value==='true';
  try{
  const {error}=await writeSetLogRow(()=>supabase.from('st_set_logs').update(patch).eq('id',extraId));
  if(error)return alert(friendlyWriteError(error,'Could not save that set. Please try again.'));
  setExtraSetLogs((prev)=>prev.map((row)=>row.id===extraId?{...row,...patch}:row));
  }catch(e){
   alert(friendlyWriteError(e,'Could not save that set. Please try again.'));
  }
 }
 async function skipExercise(ex:any){
  if(!session?.user||!workout)return;
  const result=await upsertExerciseSession(supabase,{
    userId:session.user.id,
    exerciseId:ex.id,
    logDate:activeLogDateForLogging(),
    status:'skipped',
    skipReason:'other',
    attemptOutcome:'did_not_perform',
  });
  if(result.pendingMigration){setPhase2a1Pending(true);alert('Exercise skip needs the Phase 2A.1 migration.');return;}
  if(result.error)return alert(result.error);
  setSkippedExerciseIds((prev)=>({...prev,[ex.id]:true}));
 }
 async function duplicateSetLog(sid:string,source:any){
  if(!canLog()||!source)return;
  const keys=['actual_weight','actual_reps','actual_rpe','actual_rir','actual_duration','actual_distance','actual_pace','actual_hr','actual_calories','log_notes'];
  const updates:Record<string,any>={};
  keys.forEach((k)=>{
    if(source[k]!=null&&String(source[k]).trim()!=='') updates[k]=String(source[k]);
  });
  if(!Object.keys(updates).length)return alert('No previous values found to copy.');
  const saved=await upsertSetLog(sid,updates,{completed:false});
  if(saved&&saved.ok===false&&!saved.stale)alert(saved.error||'Could not copy the last set.');
 }
 async function setRole(member:any,role:string){if(!isOwner())return alert('Only the group owner can change roles.'); if(!isAssignableMemberRole(role))return alert('Ownership transfer is a separate action and is not available here.'); const{error}=await supabase.rpc('st_set_member_role',{p_member_id:member.id,p_role:roleForDatabase(role)}); if(error){if(/could not find the function|schema cache/i.test(error.message||'')){const{error:upErr}=await supabase.from('st_team_members').update({role:roleForDatabase(role)}).eq('id',member.id); if(upErr)return alert(upErr.message);} else return alert(error.message);} await loadMembers(); await loadTeams();}
 async function removeMember(member:any){
  if(!activeTeam||!canManageGroupView())return;
  if(member.user_id===session.user.id)return alert('You cannot remove yourself here.');
  if(!confirm(`Remove ${member.display_name||'this member'} from ${activeTeam.name}?`))return;
  const{error}=await supabase.rpc('st_remove_group_member',{p_team_id:activeTeam.id,p_member_user_id:member.user_id});
  if(error)return alert(error.message);
  if(memberDashboard?.user_id===member.user_id)setMemberDashboard(null);
  await loadMembers(); await loadTeams(); await loadMemberStats();
 }
 async function setMemberParticipation(member:any,active:boolean){
  if(!activeTeam||!canManageGroupView())return;
  const{error}=await supabase.rpc('st_set_member_participation',{p_team_id:activeTeam.id,p_member_user_id:member.user_id,p_is_active_participant:active});
  if(error)return alert(error.message);
  await loadMembers();
 }
 function focusNextInput(el: HTMLInputElement | null) {
  if (!el) return;
  const i = refs.current.indexOf(el);
  const nextEl = refs.current[i + 1];
  if (nextEl) nextEl.focus();
 }
 function next(e: React.KeyboardEvent) {
  if (e.key === 'Enter' || e.key === 'ArrowRight') {
    e.preventDefault();
    focusNextInput(e.currentTarget as HTMLInputElement);
  }
 }
 function onLogDateChange(ymd:string){setLogDate(ymd);}
 function onWeekChange(nextWeek:number){
  const w=Number(nextWeek)||1;
  if(!program){setWeek(w);return;}
  syncingCalendarRef.current=true;
  setWeek(w);
  const start=resolveProgramStartDate(program);
  const nextDate=dateForWeekKeepingWeekday(start,w,logDate);
  setLogDate(nextDate);
  const dayLabel=dayLabelFromYmd(nextDate);
  const match=(program.st_workouts||[]).find((x:any)=>x.week===w&&x.day_label===dayLabel)
    ||(program.st_workouts||[]).filter((x:any)=>x.week===w).sort((a:any,b:any)=>a.day_order-b.day_order)[0];
  if(match)setActiveWorkout(match.id);
  queueMicrotask(()=>{syncingCalendarRef.current=false;});
 }
function onSelectTrainingDay(date:string){
  setLogDate(date);
  setTrainingCalendarMonth(yearMonthOf(date));
  if(program){
    syncingCalendarRef.current=true;
    const start=resolveProgramStartDate(program);
    const nextWeek=weekForDate(start,date,program.weeks||weeks||6);
    setWeek(nextWeek);
    const dayLabel=dayLabelFromYmd(date);
    const match=(program.st_workouts||[]).find((x:any)=>x.week===nextWeek&&x.day_label===dayLabel)
      ||(program.st_workouts||[]).filter((x:any)=>x.week===nextWeek).sort((a:any,b:any)=>a.day_order-b.day_order)[0];
    if(match)setActiveWorkout(match.id);
    queueMicrotask(()=>{syncingCalendarRef.current=false;});
  }
}
 function onSelectWorkoutDay(w:any){
  setActiveWorkout(w.id);
  if(!program)return;
  syncingCalendarRef.current=true;
  const start=resolveProgramStartDate(program);
  setLogDate(dateForWeekAndDay(start,week,w.day_label));
  queueMicrotask(()=>{syncingCalendarRef.current=false;});
 }
 function onMemberLogDateChange(ymd:string){setMemberWorkoutLogDate(ymd);}
 function onMemberWeekChange(nextWeek:number){
  const w=Number(nextWeek)||1;
  if(!memberWorkoutProgram){setMemberWorkoutWeek(w);return;}
  setMemberWorkoutWeek(w);
  const current=(memberWorkoutProgram.st_workouts||[]).find((x:any)=>x.id===memberWorkoutActiveId);
  const dayLabel=current?.day_label||dayLabelFromYmd(memberWorkoutLogDate);
  const match=(memberWorkoutProgram.st_workouts||[]).find((x:any)=>x.week===w&&x.day_label===dayLabel)
    ||(memberWorkoutProgram.st_workouts||[]).filter((x:any)=>x.week===w).sort((a:any,b:any)=>a.day_order-b.day_order)[0];
  if(match)setMemberWorkoutActiveId(match.id);
 }
 function onSelectMemberWorkoutDay(w:any){
  // Keep logging date independent so coaches can log this day's plan on any calendar date.
  setMemberWorkoutActiveId(w.id);
 }
 async function updateProgramStartDate(ymd:string){
  if(!program||!canEdit()||!ymd)return;
  const anchor=mondayOfWeek(ymd);
  const{error}=await supabase.from('st_programs').update({start_date:anchor}).eq('id',program.id);
  if(error){
   if(missingProgramColumnFromError(error))return;
   return alert(error.message);
  }
  setProgram({...program,start_date:anchor});
  setProgramStartDate(anchor);
  await refreshProgramExpectations(supabase, program.id, todayYmd());
  if(draftEditProgramId&&activeWorkout)alignEditorCalendar({...program,start_date:anchor},activeWorkout);
  else {
  const aligned=weekForDate(anchor,logDate,program.weeks||weeks||6);
  setWeek(aligned);
  }
 }
 async function updateProgramWeeks(nextWeeks:number){
  if(!program||!canEdit())return;
  const w=Math.max(1,Math.min(12,Number(nextWeeks)||6));
  const start=resolveProgramStartDate({...program,weeks:w});
  const end=programEndDate(start,w);
  const{error}=await supabase.from('st_programs').update({weeks:w,cycle_length_weeks:w,end_date:end}).eq('id',program.id);
  if(error){
   const{error:fallbackError}=await supabase.from('st_programs').update({weeks:w}).eq('id',program.id);
   if(fallbackError)return alert(fallbackError.message);
   setProgram({...program,weeks:w});
   setWeeks(w);
   await refreshProgramExpectations(supabase, program.id, todayYmd());
   return;
  }
  setProgram({...program,weeks:w,cycle_length_weeks:w,end_date:end});
  setWeeks(w);
  await refreshProgramExpectations(supabase, program.id, todayYmd());
 }
 async function reloadKeepDay(){
  const keep = planEditRef.current?.workout?.id || activeWorkout;
  if(draftEditProgramId)await saveDraftProgramName(draftEditProgramId,{quiet:true});
  syncingCalendarRef.current=true;
  try{
   await loadPrograms(programLoadContext(),{preserveWorkoutId:keep||null});
  }finally{
   queueMicrotask(()=>{syncingCalendarRef.current=false;});
  }
}
 function openManageProgram(){setMemberDashboard(null);setViewingMember(null);setTrainingSessionOpen(false);setTrainingSubNav('personal');setDraftEditProgramId(null);setAppNav('Programs');}
 function restoreFollowedCalendar(){
  schedulePreviewRef.current=null;
  const followedId=profile?.followed_program_id||null;
  if((followedId||'')!==(program?.id||''))void loadPrograms('training');
 }
 function scheduleStartFromItem(item:TrainingDayItem,date:string):ScheduleStartItem|null{
  if(!item.expectationId||!item.sourceKey)return null;
  return {expectationId:item.expectationId,workoutId:item.workoutId,programId:item.programId||null,scheduledDate:date,sourceKey:item.sourceKey,teamId:item.teamId??null};
 }
 function knownWorkoutIds(){
  const ids:string[]=[];
  (program?.st_workouts||[]).forEach((item:any)=>{if(item?.id)ids.push(item.id);});
  calendarWorkouts.forEach((item:any)=>{if(item?.id)ids.push(item.id);});
  return ids;
 }
 function authorizedProgramIds(){
  const ids:string[]=[];
  if(program?.id)ids.push(program.id);
  if(profile?.followed_program_id)ids.push(profile.followed_program_id);
  (programs||[]).forEach((item:any)=>{if(item?.id)ids.push(item.id);});
  return ids;
 }
 function directOpenDecision(item:{workoutId?:string|null;programId?:string|null}){
  return directWorkoutOpenAllowed({
   userId:session?.user?.id||null,
   workoutId:item.workoutId||null,
   programId:item.programId||null,
   knownWorkoutIds:knownWorkoutIds(),
   authorizedProgramIds:authorizedProgramIds(),
   treeReady:programTreeReady,
  });
 }
 function refuseDirectOpen(decision:'wait'|'deny'){
  if(decision==='wait'){alert('That workout is still loading. Try again in a moment.');return;}
  if(session?.user?.id){
   markScreenStale(session.user.id,['schedule','dashboard']);
   setScheduleRefreshKey((value)=>value+1);
  }
  alert('That workout is not on your current schedule.');
 }
 function beginTrainingItem(item:TrainingDayItem,date:string){
  const scheduled=scheduleStartFromItem(item,date);
  if(scheduled){void startScheduledWorkout(scheduled);return;}
  const decision=directOpenDecision(item);
  if(decision!=='open'){refuseDirectOpen(decision);return;}
  void startTrainingSession(item.workoutId,date,'log');
 }
 function openLogMeal(){
  const id=nutritionLaunchSeq.current+1;
  nutritionLaunchSeq.current=id;
  goNav('Nutrition');
  setNutritionLaunch({id,openAdd:true});
 }
 function openNutritionLog(){goNav('Nutrition');}
 function openNutritionGoals(){setScrollNutritionGoals(true);goNav('Settings');}
 function openProgressOverview(){goNav('Progress');}
 function openProgressStrength(){goNav('Progress',{progressSub:'strength'});}
 function openProgressBody(){goNav('Progress',{progressSub:'body'});}
 function openAddCheckIn(){
  const id=bodyCheckInSeq.current+1;
  bodyCheckInSeq.current=id;
  goNav('Progress',{progressSub:'body'});
  setBodyCheckInLaunch({id,openForm:true});
 }
 function openTrainingWeekDay(date:string){
  setTrainingSessionOpen(false);
  setViewingWorkoutId(null);
  setWorkoutPreviewMeta(null);
  setGroupLogReturn(null);
  setLogDate(date);
  setTrainingCalendarView('day');
  setTrainingCalendarMonth(yearMonthOf(date));
  if(program)setWeek(weekForDate(resolveProgramStartDate(program),date,program.weeks||weeks||6));
  setAppNav('Training');
 }
 function openTodayTraining(nav:TodayTrainingNavigation){
  if(nav.kind==='none')return;
  if(nav.kind==='programs'){goNav('Programs');return;}
  if(nav.kind==='calendar'){
   const now=todayYmd();
   setTrainingSessionOpen(false);
   setViewingWorkoutId(null);
   setWorkoutPreviewMeta(null);
   setGroupLogReturn(null);
   setLogDate(now);
   setTrainingCalendarView('day');
   setTrainingCalendarMonth(yearMonthOf(now));
   if(program)setWeek(weekForDate(resolveProgramStartDate(program),now,program.weeks||weeks||6));
   setAppNav('Training');
   return;
  }
  if(nav.kind==='checkoff'){void toggleTrainingItemComplete(nav.item,nav.date);return;}
  if(nav.kind==='setup'){
   setLogDate(nav.date);
   setAppNav('Training');
   void setupExistingStrengthActivity(nav.activityId,nav.date);
   return;
  }
  if(nav.kind==='preview'){
   if(!nav.item.workoutId)return;
   setAppNav('Training');
   void previewTrainingItem(nav.item,nav.date);
   return;
  }
  if(!nav.item.workoutId)return;
  setAppNav('Training');
  beginTrainingItem(nav.item,nav.date);
 }
 async function scheduleItemIsCurrent(item:{expectationId:string;workoutId:string|null;scheduledDate:string}){
  if(!session?.user?.id)return false;
  const read=await readExpectationForStart(supabase,session.user.id,item.expectationId);
  if(read.error){alert(read.error);return false;}
  if(expectationStillMatches(item,read.row)==='open')return true;
  markScreenStale(session.user.id,['schedule','dashboard']);
  setScheduleRefreshKey((value)=>value+1);
  alert('That workout changed. The schedule has been refreshed.');
  return false;
 }
 async function previewTrainingItem(item:TrainingDayItem,date:string){
  const detailStarted=typeof performance!=='undefined'?performance.now():Date.now();
  const scheduled=scheduleStartFromItem(item,date);
  if(scheduled&&!(await scheduleItemIsCurrent(scheduled))){
   noteWorkoutDetailOpen(appNav==='Dashboard'?'Dashboard':'Training',detailStarted);
   return;
  }
  if(!scheduled){
   const decision=directOpenDecision(item);
   if(decision!=='open'){
    noteWorkoutDetailOpen(appNav==='Dashboard'?'Dashboard':'Training',detailStarted);
    refuseDirectOpen(decision);
    return;
   }
  }
  schedulePreviewRef.current=scheduled;
  let nextProgram=program;
  let loadError:string|null=null;
  if(scheduled?.programId&&program?.id!==scheduled.programId){
   const{data:full,error}=await fetchFullProgram(supabase,scheduled.programId);
   if(error||!full){
    loadError=error||'Could not open that workout.';
   }else{
    nextProgram=full;
    setProgram(full);
   }
  }
  const resolved=resolveTrainingPreviewWorkout({
   workoutId:item.workoutId,
   programId:item.programId||scheduled?.programId||null,
   loadedProgram:loadError?null:nextProgram,
   loadError,
   fallbackWorkouts:calendarWorkouts,
  });
  if(!loadError&&resolved.workout&&nextProgram&&item.workoutId){
   const start=resolveProgramStartDate(nextProgram);
   setWeek(weekForDate(start,date,nextProgram.weeks||weeks||6));
   setActiveWorkout(item.workoutId);
  }
  setLogDate(date);
  setWorkoutPreviewMeta({
   sourceName:trainingSourceLabel(item),
   error:resolved.error,
   completed:!!item.completed,
   workout:resolved.workout,
   duration:item.duration||null,
  });
  if(item.workoutId)setViewingWorkoutId(item.workoutId);
  noteWorkoutDetailOpen(appNav==='Dashboard'?'Dashboard':'Training',detailStarted);
 }
 async function startScheduledWorkout(item:ScheduleStartItem){
  if(!(await scheduleItemIsCurrent(item)))return;
  let nextProgram=program;
  if(item.programId&&program?.id!==item.programId){
   const{data:full,error}=await fetchFullProgram(supabase,item.programId);
   if(error||!full){alert(error||'Could not open that workout.');return;}
   nextProgram=full;
   setProgram(full);
  }
  await startTrainingSession(item.workoutId,item.scheduledDate,'log');
  setActiveExpectationId(item.expectationId);
  setActiveExpectationSource(item.sourceKey);
  setActiveExpectationDate(item.scheduledDate);
  if(nextProgram){
   const start=resolveProgramStartDate(nextProgram);
   setWeek(weekForDate(start,item.scheduledDate,nextProgram.weeks||weeks||6));
  }
 }
 async function startTrainingSession(workoutId:string|null,dateYmd:string,intent:'log'|'edit'='log'){
  setGroupLogReturn(null);
  setGroupActivityLog(null);
  setGroupActivityWorkout(null);
  setActiveExpectationId(null);
  setActiveExpectationSource(null);
  setActiveExpectationDate(null);
  if(program){
   const start=resolveProgramStartDate(program);
   const nextWeek=weekForDate(start,dateYmd,program.weeks||weeks||6);
   setWeek(nextWeek);
  }
  if(workoutId){
   setActiveWorkout(workoutId);
  } else if(program){
   const start=resolveProgramStartDate(program);
   const nextWeek=weekForDate(start,dateYmd,program.weeks||weeks||6);
   const dayLabel=dayLabelFromYmd(dateYmd);
   const match=(program.st_workouts||[]).find((w:any)=>w.week===nextWeek&&w.day_label===dayLabel)
    ||(program.st_workouts||[]).filter((w:any)=>w.week===nextWeek).sort((a:any,b:any)=>a.day_order-b.day_order)[0];
   if(match)setActiveWorkout(match.id);
  }
  setLogDate(dateYmd);
  setTrainingSessionIntent(intent);
  if(intent!=='log')setSessionFeedbackExpanded(false);
  setViewingWorkoutId(null);
  setWorkoutPreviewMeta(null);
  setTrainingSessionOpen(true);
  if(intent==='log'||intent==='edit')setApplyScope('current');
  if(intent==='edit'&&needsJustMeCopy(program)&&!isPersonalCalendarWorkout(workoutId)){
   const source=findWorkoutAnywhere(workoutId)||workout;
   await ensurePersonalCopyForTrainingEdit(source);
  }
 }
 async function refreshCalendarForDate(dateYmd:string){
  if(!session?.user)return {activities:userCalendarActivities,workouts:calendarWorkouts};
  const win=monthWindow(yearMonthOf(dateYmd));
  const cal=await fetchUserCalendarActivities(supabase,session.user.id,win.from,win.to);
  const activities=cal.data||[];
  setUserCalendarActivities(activities);
  const linkedIds=activities.map((a)=>a.workout_id).filter(Boolean) as string[];
  const extraIds=linkedIds.filter((id)=>!(program?.st_workouts||[]).some((w:any)=>w.id===id));
  const extras=await fetchWorkoutsByIds(supabase,extraIds);
  const workouts=extras.data||[];
  setCalendarWorkouts(workouts);
  return {activities,workouts};
 }
 function nativeDateForTrainingItem(item:TrainingDayItem,fromDate:string){
  if(item.source==='calendar'){
   const activity=userCalendarActivities.find((a)=>a.id===item.activityId);
   return activity?.activity_date||fromDate;
  }
  if(!program)return fromDate;
  if(item.workoutId){
   const workout=(program.st_workouts||[]).find((w:any)=>w.id===item.workoutId);
   if(workout)return nativeDateForWorkout(program,workout);
  }
  const activity=trainingActivities.find((a)=>a.id===item.activityId||a.id===item.id||(item.workoutId&&a.workout_id===item.workoutId));
  if(activity)return nativeDateForActivity(program,activity);
  return fromDate;
 }
 async function moveTrainingItem(item:TrainingDayItem,fromDate:string,toDate:string){
  if(!session?.user||!toDate||toDate===fromDate)return;
  setTrainingMoveBusy(true);
  try{
   if(item.source==='calendar'&&item.activityId){
    const activity=userCalendarActivities.find((a)=>a.id===item.activityId);
    if(!activity)throw new Error('Could not find that activity.');
    const{error}=await moveCalendarActivityToDate(supabase,activity,fromDate,toDate);
    if(error)throw new Error(error);
   }else{
    const key=moveKeyForItem(item);
    if(!key)throw new Error('This item cannot be moved.');
    const native=nativeDateForTrainingItem(item,fromDate);
    const{error}=await saveWorkoutDayMove(supabase,session.user.id,userCalendarActivities,key,toDate===native?null:toDate);
    if(error)throw new Error(error);
   }
   await refreshCalendarForDate(toDate);
   setLogDate(toDate);
   setTrainingCalendarMonth(yearMonthOf(toDate));
   if(program)setWeek(weekForDate(resolveProgramStartDate(program),toDate,program.weeks||weeks||6));
   if(item.workoutId)setActiveWorkout(item.workoutId);
   setTrainingMoveItem(null);
  }finally{setTrainingMoveBusy(false);}
 }
 async function resetTrainingItemDay(item:TrainingDayItem,fromDate:string){
  if(!session?.user)return;
  const native=nativeDateForTrainingItem(item,fromDate);
  if(item.source==='calendar'&&item.activityId){
   await moveTrainingItem(item,fromDate,native);
   return;
  }
  const key=moveKeyForItem(item);
  if(!key)return;
  setTrainingMoveBusy(true);
  try{
   const{error}=await saveWorkoutDayMove(supabase,session.user.id,userCalendarActivities,key,null);
   if(error)throw new Error(error);
   await refreshCalendarForDate(native);
   setLogDate(native);
   setTrainingCalendarMonth(yearMonthOf(native));
   if(program)setWeek(weekForDate(resolveProgramStartDate(program),native,program.weeks||weeks||6));
   setTrainingMoveItem(null);
  }finally{setTrainingMoveBusy(false);}
 }
 async function openStrengthSetup(activityId:string,dateYmd:string,workoutId:string,title:string){
  setStrengthSetupError('');
  setStrengthSetup({activityId,workoutId,date:dateYmd,title});
 }
 async function setupExistingStrengthActivity(activityId:string,dateYmd:string){
  if(!session?.user)return;
  const activity=userCalendarActivities.find((a)=>a.id===activityId);
  if(!activity)return;
  if(activity.workout_id){
   await openStrengthSetup(activity.id,dateYmd,activity.workout_id,activity.title);
   return;
  }
  const created=await createPersonalStrengthWorkout(supabase,session.user.id,dateYmd,activity.title||'Strength');
  if(created.error||!created.workout?.id)return alert(created.error||'Could not create a strength workout.');
  const link=await linkCalendarActivityWorkout(supabase,activity.id,String(created.workout.id));
  if(link.error)return alert(link.error);
  if(created.workout)setCalendarWorkouts((prev)=>[created.workout,...prev.filter((w:any)=>w.id!==created.workout?.id)]);
  await refreshCalendarForDate(dateYmd);
  await openStrengthSetup(activity.id,dateYmd,String(created.workout.id),activity.title||'Strength');
 }
 async function toggleTrainingItemComplete(item:TrainingDayItem,dateYmd:string){
  if(item.workoutId){
   beginTrainingItem(item,dateYmd);
   return;
  }
  if(!session?.user||!itemAllowsCheckoff(item)||!item.activityId)return;
  setTrainingCompleteBusy(item.id);
  try{
   if(item.source==='calendar'){
    const activity=userCalendarActivities.find((a)=>a.id===item.activityId);
    if(!activity)return;
    const next=!isActivityCompletedOnDate(activity,dateYmd);
    const{error}=await setUserCalendarActivityCompleted(supabase,activity,dateYmd,next);
    if(error)return alert(error);
   }else{
    const next=!isProgramItemCompletedOnDate(userCalendarActivities,item.activityId,dateYmd);
    const{error}=await setProgramItemCompleted(supabase,session.user.id,userCalendarActivities,item.activityId,dateYmd,next);
    if(error)return alert(error);
   }
   await refreshCalendarForDate(dateYmd);
  }finally{
   setTrainingCompleteBusy(null);
  }
 }
 async function generateStrengthForSetup(promptText:string){
  if(!strengthSetup)return;
  if(!session?.access_token){setStrengthSetupError('Sign in to generate this workout.');return;}
  const dayLabel=dayLabelFromYmd(strengthSetup.date);
  const prompt=promptText.trim()||`One ${strengthSetup.title||'strength'} workout for ${dayLabel}.`;
  const dayType=inferSingleDayTypeFromPrompt(prompt);
  const sessionMinutes=inferSessionMinutesFromPrompt(prompt)||Number(profileDraft?.preferred_session_minutes)||60;
  setStrengthSetupGenerating(true);
  setStrengthSetupError('');
  try{
   const res=await fetch('/api/programs/generate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({
    targetWorkoutId:strengthSetup.workoutId,
    weeks:1,
    days:[dayLabel],
    dayTypes:{[dayLabel]:dayType},
    focusMuscles:focusMusclesForSingleDayType(dayType),
    prompt,
    structuredIntake:true,
    sessionMinutes,
    availableEquipment:normalizeEquipmentList(profileDraft.available_equipment),
    primaryGoal:profileDraft.primary_goal,
    experienceLevel:profileDraft.experience_level,
    mode:'personal',
   })});
   const raw=await res.text();
   let data:any={};
   try{data=raw?JSON.parse(raw):{};}catch{setStrengthSetupError('Could not generate this workout. Please try again.');return;}
   if(!res.ok||data.error){
    setStrengthSetupError(data.error||'Could not generate this workout.');
    return;
   }
   if(strengthSetup.activityId){
    await supabase.from('st_user_calendar_activities').update({duration_minutes:sessionMinutes}).eq('id',strengthSetup.activityId);
   }
   await refreshCalendarForDate(strengthSetup.date);
   const workoutId=strengthSetup.workoutId;
   const date=strengthSetup.date;
   setStrengthSetup(null);
   startTrainingSession(workoutId,date,'edit');
  }catch(e:any){
   setStrengthSetupError(e?.message||'Could not generate this workout.');
  }finally{
   setStrengthSetupGenerating(false);
  }
 }
 function switchTrainingContext(next:'personal'|'group'){setMode(next==='group'?'team':'personal');if(next==='group'&&teams.length&&!selectedTeamId)setSelectedTeamId(teams[0].id);}
 function handleGroupsWorkspaceTabChange(tab:string){
  if(tab==='calendar'||tab==='programs')loadPrograms('setup');
  if(tab==='members')return;
  if(viewingMember&&viewingMember.user_id!==session?.user?.id)closeMemberView();
  else if(memberDashboard){setMemberDashboard(null);setMemberPerformance(null);}
 }
 function goNav(n:string, opts?:{progressSub?:'strength'|'body'|'training';keepExercise?:boolean}){
  setNutritionLaunch(null);
  setBodyCheckInLaunch(null);
  if(!(n==='Progress'&&opts?.keepExercise))setProgressExercise(null);
  if(n!=='Groups'&&viewingMember&&viewingMember.user_id!==session?.user?.id){
   clearMemberWorkoutView();
  }
  beginScreenTiming(n);
  if(n==='Training'&&appNav==='Training') completeScreenPhase('Training','schedule');
  setAppNav(n);
  if(n==='Progress') setProgressSection(opts?.progressSub==='body'?'body':opts?.progressSub==='strength'?'strength':opts?.progressSub==='training'?'training':'overview');
  if(n==='Progress'||n==='Dashboard'||n==='Training'){loadProgressLogs();}
  if(n==='Settings'){loadCatalog(); loadGuidedImportStatus(); loadMasterImportStatus(); if(activeTeam)loadMembers();}
  if(n==='Groups'){
   if(teams.length){if(!selectedTeamId)setSelectedTeamId(teams[0].id);setMode('team');}
   loadMembers(); loadMemberStats(); loadMemberAssignments(); loadClassifications();
   if(appNav==='Groups'){loadGroupProgramForAssign(); void loadPrograms('setup');}
  }
  if(n==='Training'){
   setTrainingSubNav('personal');
   if(teams.length&&!selectedTeamId)setSelectedTeamId(teams[0].id);
   if(!draftEditProgramId&&appNav==='Training') void loadPrograms('training');
  }
  if(n==='Programs'){if(teams.length&&!selectedTeamId)setSelectedTeamId(teams[0].id);}
 }
 function openNotificationTarget(row:{destination_kind?:string|null;destination_id?:string|null;team_id?:string|null}){
  const kind=row?.destination_kind;
  if(kind==='conversation'&&row.team_id&&row.destination_id){
   setSelectedTeamId(row.team_id);
   setPendingGroupMessage({teamId:row.team_id,conversationId:row.destination_id});
   goNav('Groups');
   return;
  }
  if(kind==='group'||kind==='invitation'||kind==='member') goNav('Groups');
  else if(kind==='program'||kind==='workout') goNav('Training');
  else if(kind==='progress') goNav('Progress');
 }

function targetWorkoutsFrom(current:any,sourceProgram:any=program,scopeOverride?:'current'|'future'){
  if(!current&&!planEditRef.current?.workout) return [];
  const active=planEditRef.current?.workout||current;
  const prog=planEditRef.current?.program||sourceProgram;
  if(!active) return [];
  if(isPersonalCalendarWorkout(active.id)) return [active];
  const all=(prog?.st_workouts||[]).filter((w:any)=>w.day_order===active.day_order);
  const scope=scopeOverride||applyScope;
  const onTheFly=trainingSessionOpen&&!isSharedTemplateEditor()&&!scopeOverride;
  const scoped=workoutsInEditScope(all,active,scope,onTheFly);
  return scoped.length?scoped:[active];
}
function resolveExerciseTarget(targetWorkout:any,sourceExercise:any,currentWorkout:any){
  return resolveExerciseTargetSafe(targetWorkout,sourceExercise,currentWorkout,exerciseSection);
}

 const weekWorkouts=(program?.st_workouts||[]).filter((w:any)=>w.week===week).sort((a:any,b:any)=>a.day_order-b.day_order);
 const extraActiveWorkout=calendarWorkouts.find((w:any)=>w.id===activeWorkout)||null;
 const activityWorkout=groupActivityWorkout?.id===activeWorkout?groupActivityWorkout:null;
 const sessionKeep=planEditRef.current?.workout;
 const workout=activityWorkout
  ||extraActiveWorkout
  ||findWorkoutInProgram(program,activeWorkout)
  ||weekWorkouts.find((w:any)=>w.id===activeWorkout)
  ||(sessionKeep&&(sessionKeep.id===activeWorkout||trainingSessionOpen)?sessionKeep:null)
  ||(trainingSessionOpen?(program?.st_workouts||[]).find((w:any)=>w.week===week&&w.day_label===dayLabelFromYmd(logDate)):null)
  ||(!trainingSessionOpen?weekWorkouts[0]:null);
 useEffect(()=>{
  if(!session?.user?.id||!program?.id)return;
  if(viewingMember&&viewingMember.user_id!==session.user.id)return;
  if(needsJustMeCopy(program)&&!isSharedTemplateEditor())return;
  if(!canEdit())return;
  const pendingIds=new Set(Object.keys(pendingEquipmentById));
  const fills=blankExercisesInheritingProgramEquipment(equipmentRowsFromProgram(program,exerciseSection)).filter((fill)=>{
   if(pendingIds.has(fill.exerciseId))return false;
   return !equipmentQueuesRef.current[fill.exerciseId]?.intent()?.value;
  });
  if(!fills.length)return;
  const signature=`${program.id}|${fills.map((fill)=>`${fill.exerciseId}:${fill.equipment}`).join('|')}`;
  if(equipmentInheritFlightRef.current===signature)return;
  equipmentInheritFlightRef.current=signature;
  const openId=planEditRef.current?.workout?.id||activeWorkout||null;
  void (async()=>{
   const applied:Array<{workoutId:string;exerciseId:string;patch:Record<string,unknown>}>=[];
   for(const fill of fills){
    const {data,error}=await supabase.from('st_exercises').update({equipment:fill.equipment}).eq('id',fill.exerciseId).or('equipment.is.null,equipment.eq.').select('id');
    if(error||!exerciseUpdateTouchedRow(data))continue;
    applied.push({workoutId:fill.workoutId,exerciseId:fill.exerciseId,patch:{equipment:fill.equipment}});
   }
   if(equipmentInheritFlightRef.current===signature)equipmentInheritFlightRef.current='';
   if(!applied.length)return;
   applyExercisePatchesWhileLogging(applied,openId);
  })();
 },[program,pendingEquipmentById,session?.user?.id,viewingMember?.user_id,appNav,draftEditProgramId,activeWorkout]);
 useEffect(()=>{
  if(!session?.user||!workout?.id||trainingSessionIntent!=='log'||sessionOutcome!=='completed')return;
  const openIds=outstandingRequiredSetIds(workout, logs);
  if(!openIds.length)return;
  if(sessionStatusAfterPlanChange({existingStatus:sessionOutcome,workout,logs})!=='partial')return;
  const day=activeLogDateForLogging();
  const key=`${session.user.id}|${workout.id}|${day}|${openIds.join(',')}`;
  if(planChangePartialRef.current===key)return;
  planChangePartialRef.current=key;
  const workoutId=workout.id;
  void upsertWorkoutSession(supabase,{
    user_id:session.user.id,
    workout_id:workoutId,
    program_id:program?.id||null,
    log_date:day,
    status:'partial',
    expectation_id:activeExpectationId,
    source_key:activeExpectationSource,
    scheduled_date:activeExpectationDate,
  }).then((saved)=>{
    if(saved.pendingMigration)setPhase2a1Pending(true);
    if(saved.error){
      planChangePartialRef.current=null;
      alert(saved.error);
      return;
    }
    if(completedSessionKeyRef.current===`${session.user.id}|${workoutId}|${day}`)completedSessionKeyRef.current=null;
    setSessionOutcome('partial');
  });
 },[session?.user?.id,workout,logs,sessionOutcome,trainingSessionIntent,program?.id,activeExpectationId,activeExpectationSource,activeExpectationDate]);
 const loggedCompletionKey=Object.keys(logs).filter((id)=>!!logs[id]?.completed).sort().join(',');
 const progressCompletionKey=(progressLogs||[]).filter((row:any)=>row?.completed&&row?.planned_set_id).map((row:any)=>`${row.planned_set_id}|${String(row.log_date||'').slice(0,10)}`).sort().join(',');
 const trainingCalendarPlans=useMemo(()=>{
  const trainingCompletionWorkouts=(()=>{const byId=new Map<string,any>();[...(program?.st_workouts||[]),...calendarWorkouts,workout].forEach((w:any)=>{if(!w?.id)return;const prev=byId.get(w.id);if(!prev||(w.st_exercises||[]).length>=(prev.st_exercises||[]).length)byId.set(w.id,w);});return Array.from(byId.values());})();
  const workoutDayMoves=workoutDayMovesFromActivities(userCalendarActivities);
  const trainingCompletionOpts={activities:userCalendarActivities,workouts:trainingCompletionWorkouts,progressLogs,sessionLogs:logs,selectedDate:logDate,program};
  return {
   trainingTodayPlan:decorateDayPlanCompletion(planForCalendarDate(program,trainingActivities,userCalendarActivities,logDate,todayYmd(),workoutDayMoves),trainingCompletionOpts),
   trainingTomorrowPlan:decorateDayPlanCompletion(planForCalendarDate(program,trainingActivities,userCalendarActivities,tomorrowDate(logDate),todayYmd(),workoutDayMoves),trainingCompletionOpts),
   trainingWeekPlans:weekPlansForMonday(mondayOfWeek(logDate),program,trainingActivities,userCalendarActivities,todayYmd(),workoutDayMoves).map((plan)=>decorateDayPlanCompletion(plan,trainingCompletionOpts)),
   trainingMonthCells:monthCalendarCells(program,trainingActivities,trainingCalendarMonth,todayYmd(),userCalendarActivities,workoutDayMoves).map((cell)=>({...cell,plan:cell.plan?decorateDayPlanCompletion(cell.plan,trainingCompletionOpts):cell.plan})),
   trainingCompletionWorkouts,
   workoutDayMoves,
  };
 },[loggedCompletionKey,progressCompletionKey,program,calendarWorkouts,workout,userCalendarActivities,trainingActivities,logDate,trainingCalendarMonth]);
 const {trainingTodayPlan,trainingTomorrowPlan,trainingWeekPlans,trainingMonthCells,trainingCompletionWorkouts,workoutDayMoves}=trainingCalendarPlans;
 const trainingExpectationRange=(()=>{const weekFrom=mondayOfWeek(logDate);const weekTo=addDaysYmd(weekFrom,6);const month=monthWindow(trainingCalendarMonth);const tomorrow=addDaysYmd(logDate,1);const from=weekFrom<month.from?weekFrom:month.from;const to=[weekTo,month.to,tomorrow].sort().slice(-1)[0]||weekTo;return {from,to};})();
 const trainingCalendarEditing=trainingEditActivity?userCalendarActivities.find((a)=>a.id===trainingEditActivity.id)||null:null;
 const trainingMonthLabel=monthLabel(trainingCalendarMonth);
 const trainingCompletedDates=mergeTrainingCompletedDates(progressLogs.filter((row:any)=>row.completed).map((row:any)=>String(row.log_date||'').slice(0,10)),userCalendarActivities);
 const followingGroupTemplate=isLiveGroupProgram(program);
 const personalizedCopy=isPersonalizedGroupFollow(program);
 const canCustomizeForMe=needsJustMeCopy(program);
 const followedTeamId=program?.team_id
  ||programs.find((p:any)=>p.id===program?.source_program_id)?.team_id
  ||((personalizedCopy||followingGroupTemplate)&&(activeTeam?.id||null))
  ||null;
 const followedFromGroup=(program?.visibility==='team'||program?.source_program_id)
  ?(teams.find((t:any)=>t.id===followedTeamId)?.name||activeTeam?.name||null)
  :null;
 const planned=(workout?.st_exercises||[]).reduce((n:number,e:any)=>n+(e.st_planned_sets||[]).filter((s:any)=>!s.is_deleted).length,0);
 const logged=Object.values(logs).filter((x:any)=>x.completed).length;
 const progressWeightUnit=profileDraft?.units_preference==='metric'?'kg':'lb';
 const userCatalog=catalog.filter((c:any)=>!c.is_system&&c.user_id===session?.user?.id);
 const activeUserCatalog=userCatalog.filter((c:any)=>!c.is_archived);
 const archivedUserCatalog=userCatalog.filter((c:any)=>c.is_archived);
 const todayDayLabel=dayLabelFromYmd(today());
 const greetingHour=new Date().getHours();
 const greeting=greetingHour<12?'Good morning':greetingHour<18?'Good afternoon':'Good evening';
 const teamActiveCount=members.filter((m:any)=>(memberStats[m.user_id]?.sets||0)>0).length;
 const teamTotalSets=members.reduce((n:number,m:any)=>n+(memberStats[m.user_id]?.sets||0),0);
 const teamPlanCount=members.filter((m:any)=>(m.training_source||'team')==='team').length;
 const memberTodayWorkout=memberDashProgram?(memberDashProgram.st_workouts||[]).find((w:any)=>w.week===week&&w.day_label===todayDayLabel)||(memberDashProgram.st_workouts||[]).find((w:any)=>w.week===1&&w.day_label===todayDayLabel):null;
 const memberWorkoutStatus=workoutStatusFor(memberTodayWorkout,memberDashLogs);
 const workoutSearchCatalog=useMemo(()=>workoutSearchCatalogItems(catalog,session?.user?.id),[catalog,session?.user?.id]);
 const equipmentForSearch=normalizeEquipmentList(profileDraft.available_equipment);
 const panelFilterOptions=useMemo(()=>addExercisePanel?buildCatalogFilterOptions(workoutSearchCatalog):null,[addExercisePanel,workoutSearchCatalog]);
 const panelSearchOpts=addExercisePanel?{query:addExercisePanel.query||'',filters:{...(addExercisePanel.filters||emptyAddPanelFilters()),availableEquipment:hasEquipmentFilter(equipmentForSearch)?equipmentForSearch:undefined},limit:60,section:addExercisePanel.section}:null;
 const panelMatchCount=panelSearchOpts?countCatalogMatches(workoutSearchCatalog,panelSearchOpts):0;
 const panelResults=panelSearchOpts?searchCatalog(workoutSearchCatalog,panelSearchOpts):[];
 const panelHasSearch=panelSearchOpts?hasCatalogSearchInput(panelSearchOpts.query,panelSearchOpts.filters):false;
 const panelSupersetGroups=addExercisePanel&&workout?getSupersetGroupsForSection(workout,addExercisePanel.section).filter((g:any)=>g.count<3):[];
 const pendingGroupId=addExercisePanel?pendingSupersetGroup[addExercisePanel.section]:null;
 const pendingGroupInfo=pendingGroupId?panelSupersetGroups.find((g:any)=>g.id===pendingGroupId):null;
 const showEditScope=canEdit()&&!isPersonalCalendarWorkout(activeWorkout)&&isSharedTemplateEditor()&&(!!draftEditProgramId||!!addExercisePanel);
 const showGroupsMemberWorkout=appNav==='Groups'&&!!viewingMember&&viewingMember.user_id!==session?.user?.id;
 const memberWeekWorkouts=(memberWorkoutProgram?.st_workouts||[]).filter((w:any)=>w.week===memberWorkoutWeek).sort((a:any,b:any)=>a.day_order-b.day_order);
 const memberWorkout=memberWeekWorkouts.find((w:any)=>w.id===memberWorkoutActiveId)||memberWeekWorkouts[0];
 const displayWorkout=showGroupsMemberWorkout&&memberWorkoutProgram?memberWorkout:workout;
 const canManageTrainingProgram=mode==='personal'?canEdit():!!activeTeam&&canEditGroupProgram(activeTeam.my_role);
 const memberAssignment=memberDashboard?memberAssignments[memberDashboard.user_id]:null;
 const renderWarmupExerciseCard=(ex:any)=>{const catItem=catalog.find((c:any)=>c.id===ex.catalog_exercise_id);const exThumb=getExerciseThumb(catItem);const showGuide=hasExerciseGuide(catItem);const guidePayload=getExerciseGuidePayload(catItem,ex.name);const sortedSets=(ex.st_planned_sets||[]).filter((s:any)=>!s.is_deleted).sort((a:any,b:any)=>(a.sort_order||0)-(b.sort_order||0));const notes=String(ex.notes||'');const badge=/power primer/i.test(notes)?'Power Primer':/dynamic warm-up/i.test(notes)?'Warm-up':undefined;return <WarmupExerciseCard key={ex.id} name={ex.name||'Exercise'} badge={badge} sets={sortedSets} thumbUrl={exThumb} showGuide={showGuide&&!!guidePayload} guideLabel={guidePayload?.hasVideo?'Watch form':'Form guide'} onOpenGuide={guidePayload?()=>setExerciseGuide(guidePayload):undefined} canEdit={canEdit()} onChange={canEdit()?()=>openReplaceExercisePanel(ex):undefined} onAddSet={canEdit()?()=>addSet(ex):undefined} onRemove={canEdit()?()=>removeExercise(ex):undefined}/>;};
 loggerActionsRef.current.saveLog=saveLog;
 loggerActionsRef.current.retrySetLog=retrySetLog;
 loggerActionsRef.current.editSet=editSet;
 loggerActionsRef.current.removeSet=removeSet;
 loggerActionsRef.current.duplicateSetLog=duplicateSetLog;
 loggerActionsRef.current.addExtraWorkingSet=addExtraWorkingSet;
 loggerActionsRef.current.saveExtraSetField=saveExtraSetField;
 loggerActionsRef.current.skipExercise=skipExercise;
 loggerActionsRef.current.next=next;
 loggerActionsRef.current.focusNextInput=focusNextInput;
 loggerActionsRef.current.executeSetLogWrite=executeSetLogWrite;
 loggerActionsRef.current.applyConfirmedSetLog=applyConfirmedSetLog;
 loggerActionsRef.current.runSetLogFollowUp=runSetLogFollowUp;
 const previousPerformanceKey=(workout?.st_exercises||[]).map((ex:any)=>`${ex.id}:${ex.catalog_exercise_id||''}:${ex.name||''}:${ex.equipment||''}:${pendingEquipmentById[ex.id]||''}:${(ex.st_planned_sets||[]).filter((s:any)=>!s.is_deleted).map((s:any)=>`${s.id}:${s.set_type}:${s.set_number}`).join('.')}`).join('|');
 const previousSetViews=useMemo(()=>{
  const map:Record<string,any>={};
  (workout?.st_exercises||[]).forEach((ex:any)=>{
   const catItem=catalog.find((c:any)=>c.id===ex.catalog_exercise_id);
   const currentEq=loggerSelectedEquipment(resolveExerciseEquipment(ex,catItem),pendingEquipmentById[ex.id]);
   const equipmentSavePending=!!pendingEquipmentById[ex.id];
   (ex.st_planned_sets||[]).filter((s:any)=>!s.is_deleted).forEach((s:any)=>{
    map[s.id]=previousPerformanceViewFor(ex,s,currentEq,equipmentSavePending);
   });
  });
  return map;
 },[previousPerformanceKey,catalog,liftHistoryRows,logDate,memberWorkoutLogDate,viewingMember?.user_id,session?.user?.id]);
 const renderExerciseCard=(ex:any,inSuperset=false,mark='')=>{const catItem=catalog.find((c:any)=>c.id===ex.catalog_exercise_id);const rx=trainingExercisePrescription({exercise:ex,catalogItem:catItem,mark,omitRest:inSuperset||!!String(mark||'').trim()});const exType=exerciseTypeOf(ex,catItem);const eqOptions=compatibleEquipmentOptions(catItem,ex.equipment);const persistedEq=resolveExerciseEquipment(ex,catItem);const currentEq=loggerSelectedEquipment(persistedEq,pendingEquipmentById[ex.id]);const equipmentChoice=equipmentChoiceFor(ex,catItem);const equipmentBlockReason=equipmentChoiceBlockReason(equipmentChoice)||'';const equipmentBlocked=!!equipmentBlockReason;const weightCaption=loadEntryCaption(equipmentChoice.ok?equipmentChoice.equipment:currentEq,ex.laterality);const equipmentSavePending=!!pendingEquipmentById[ex.id];const plannedSets=(ex.st_planned_sets||[]).filter((s:any)=>!s.is_deleted).length;const exThumb=getExerciseThumb(catItem);const showGuide=hasExerciseGuide(catItem);const guidePayload=getExerciseGuidePayload(catItem,ex.name);const cardKey=`${ex.id}:${ex.catalog_exercise_id||'n'}:${ex.name}`;const isEditingName=exerciseNameSearch?.exerciseId===ex.id;const nameQuery=isEditingName?exerciseNameSearch!.query:(ex.name||'');const nameSearchResults=isEditingName&&nameQuery.trim()?searchCatalog(workoutSearchCatalog,{query:nameQuery,filters:{availableEquipment:hasEquipmentFilter(equipmentForSearch)?equipmentForSearch:undefined},limit:8,section:exerciseSection(ex)}):[];const sortedSets=(ex.st_planned_sets||[]).filter((s:any)=>!s.is_deleted).sort((a:any,b:any)=>(a.sort_order||0)-(b.sort_order||0));const showPreviousSets=!isMobilityStretchExercise(ex,catItem,exType);const weightUnit=profileDraft?.units_preference==='metric'?'kg':'lb';const isCollapsed=!!collapsedExercises[ex.id];const doneSets=sortedSets.filter((s:any)=>logs[s.id]?.completed).length;const allDone=plannedSets>0&&doneSets===plannedSets;const exSection=exerciseSection(ex);const sectionSupersetGroups=workout?getSupersetGroupsForSection(workout,exSection).filter((g:any)=>g.count<3):[];const standalonePeers=workout?sectionExercises(workout,exSection).filter((e:any)=>!e.superset_group_id&&e.id!==ex.id):[];return <div className={`card exercise-card${inSuperset?' in-superset':''}${isCollapsed?' exercise-collapsed':''}${allDone?' exercise-all-done':''}`} data-exercise-id={ex.id} key={cardKey}>
        <div className="exercise-head" data-exercise-head={ex.id}><div className="exercise-head-main">{exThumb&&(showGuide&&guidePayload?<button type="button" className="exercise-card-thumb-btn" title={guidePayload.hasVideo?"Watch form":"Form guide"} onClick={()=>setExerciseGuide(guidePayload)}><img className="exercise-card-thumb" src={exThumb} alt="" loading="lazy" referrerPolicy="no-referrer"/></button>:<img className="exercise-card-thumb" src={exThumb} alt="" loading="lazy" referrerPolicy="no-referrer"/>)}<div className="exercise-meta">{canEdit()?<>
          <div className="exercise-title-row">
            {mark?<span className="te-ex-mark">{mark}</span>:null}
            <div className="typeahead-wrap exercise-name-wrap"><textarea className="exercise-name" rows={1} key={`${cardKey}-name`} value={nameQuery} title="Type to search catalog — pick a match or blur to save custom name" onFocus={()=>setExerciseNameSearch({exerciseId:ex.id,query:ex.name||''})} onChange={e=>setExerciseNameSearch({exerciseId:ex.id,query:e.target.value})} onBlur={e=>{const v=e.target.value.trim();setTimeout(()=>{if(namePickRef.current){namePickRef.current=false;return;}setExerciseNameSearch((cur:any)=>cur?.exerciseId===ex.id?null:cur);if(v&&v!==ex.name)updateExerciseField(ex,'name',v);},180);}} onKeyDown={e=>{if(e.key==='Escape')setExerciseNameSearch(null);}}/>{isEditingName&&nameQuery.trim()&&nameSearchResults.length>0&&<div className="typeahead-menu exercise-name-menu">{nameSearchResults.map((item:any)=><button type="button" key={item.id} className="typeahead-item catalog-search-item" onMouseDown={ev=>ev.preventDefault()} onClick={()=>{namePickRef.current=true;setExerciseNameSearch(null);void requestReplaceExercise(ex,item);}}>{getExerciseThumb(item)&&<img className="catalog-search-thumb" src={getExerciseThumb(item)} alt="" loading="lazy" referrerPolicy="no-referrer"/>}<span className="catalog-search-body"><b>{item.name}</b><span className="muted">{catalogResultMeta(item)}</span></span></button>)}</div>}{isEditingName&&nameQuery.trim()&&!nameSearchResults.length&&<div className="typeahead-menu exercise-name-menu"><p className="muted typeahead-empty">No catalog matches — blur to keep a custom name</p></div>}</div>
            <input className="exercise-muscle" key={`${cardKey}-muscle`} placeholder="Muscle" defaultValue={ex.muscle_group||''} onBlur={e=>{if((e.target.value||'')!==(ex.muscle_group||''))updateExerciseField(ex,'muscle_group',e.target.value);}}/>
            {eqOptions.length>1?<select className={`exercise-equipment${equipmentBlocked?' exercise-equipment-required':''}`} key={`${cardKey}-eq`} value={currentEq} onChange={e=>void changeExerciseEquipment(ex,e.target.value)} aria-label="Equipment" aria-invalid={equipmentBlocked||undefined} aria-describedby={equipmentBlocked?`${cardKey}-eq-note`:undefined}>{!currentEq?<option value="">Select equipment</option>:null}{eqOptions.map((eq:string)=><option key={eq} value={eq}>{eq}</option>)}</select>:currentEq?<span className="badge exercise-equipment-badge">{currentEq}</span>:null}{equipmentBlocked?<p className="exercise-equipment-note exercise-equipment-note-required" id={`${cardKey}-eq-note`} role="status">{equipmentBlockReason||'Choose equipment to log this exercise.'}</p>:null}
            <span className="badge exercise-type-badge">{exType}</span>
          </div>
        </>:<>
          <div className="exercise-title-row">
            {mark?<span className="te-ex-mark">{mark}</span>:null}
            <h3 className="exercise-name-text">{ex.name}</h3>
            <span className="badge exercise-muscle-badge">{ex.muscle_group||'Muscle'}</span>
            {canLog()&&eqOptions.length>1?<select className={`exercise-equipment${equipmentBlocked?' exercise-equipment-required':''}`} key={`${cardKey}-eq-log`} value={currentEq} onChange={e=>void changeExerciseEquipment(ex,e.target.value)} aria-label="Equipment" aria-invalid={equipmentBlocked||undefined} aria-describedby={equipmentBlocked?`${cardKey}-eq-note`:undefined}>{!currentEq?<option value="">Select equipment</option>:null}{eqOptions.map((eq:string)=><option key={eq} value={eq}>{eq}</option>)}</select>:currentEq?<span className="badge exercise-equipment-badge">{currentEq}</span>:null}
            <span className="badge exercise-type-badge">{exType}</span>
          </div>
          {canLog()&&equipmentBlocked?<p className="exercise-equipment-note exercise-equipment-note-required" id={`${cardKey}-eq-note`} role="status">{equipmentBlockReason||'Choose equipment to log this exercise.'}</p>:null}
        </>}{trainingRxLines(rx)}{canEdit()&&!ex.catalog_exercise_id&&<p className="muted exercise-link-hint">No catalog link — edit name or use Change to get form guide</p>}{isCollapsed&&<p className="muted exercise-collapse-summary">{allDone&&<span className="exercise-done-badge" aria-hidden="true">✓</span>}{plannedSets} set{plannedSets===1?'':'s'} · {doneSets} logged{allDone?' · complete':''}{inSuperset?' · superset':''}</p>}</div></div><div className="exercise-head-actions"><button type="button" className="btn small secondary exercise-collapse-btn" onClick={()=>setCollapsedExercises((prev:any)=>({...prev,[ex.id]:!prev[ex.id]}))} aria-expanded={!isCollapsed}>{isCollapsed?'Expand':'Collapse'}</button>{!isCollapsed&&showGuide&&guidePayload&&<button type="button" className="btn small secondary" onClick={()=>setExerciseGuide(guidePayload)}>{guidePayload.hasVideo?'Watch form':'Form guide'}</button>}{!isCollapsed&&!isMobilityStretchExercise(ex,catItem,exType)&&<button type="button" className="btn small secondary" onClick={()=>openExerciseProgress(ex,catItem)}>View Progress</button>}{!isCollapsed&&!isMobilityStretchExercise(ex,catItem,exType)&&<button type="button" className="btn small secondary" title="See what you logged for this exercise by week" onClick={()=>openExerciseWeekHistory(ex,exType,displayWorkout)}>History</button>}{!isCollapsed&&canEdit()&&<button type="button" className="btn small secondary" onClick={()=>addSet(ex)}>+ Set</button>}{!isCollapsed&&canEdit()&&<ExerciseLogMoreMenu items={bindExerciseLogMoreItems(exerciseLogMoreItemSpecs({inSuperset,supersetOpen:supersetEditExerciseId===ex.id}),{supersetEdit:()=>setSupersetEditExerciseId(supersetEditExerciseId===ex.id?null:ex.id),change:()=>openReplaceExercisePanel(ex),moveUp:()=>moveExercise(ex,-1),moveDown:()=>moveExercise(ex,1),supersetOut:()=>removeFromSuperset(ex),removeExercise:()=>removeExercise(ex)})}/>}{!isCollapsed&&canEdit()&&!inSuperset&&supersetEditExerciseId===ex.id&&<div className="exercise-superset-edit"><select className="superset-join-select" defaultValue="" aria-label="Join existing superset" onChange={e=>{const v=e.target.value;if(v){void addExerciseToSuperset(ex,v);setSupersetEditExerciseId(null);}e.currentTarget.value='';}} disabled={!sectionSupersetGroups.length}><option value="">{sectionSupersetGroups.length?'Join superset…':'No supersets'}</option>{sectionSupersetGroups.map((g:any)=><option key={g.id} value={g.id}>{g.label} ({g.count}/3)</option>)}</select><select className="superset-join-select" defaultValue="" aria-label="Pair with exercise" onChange={e=>{const v=e.target.value;if(v){const peer=standalonePeers.find((p:any)=>p.id===v);if(peer){void pairIntoNewSuperset(ex,peer);setSupersetEditExerciseId(null);}}e.currentTarget.value='';}} disabled={!standalonePeers.length}><option value="">{standalonePeers.length?'Pair with…':'No other exercises'}</option>{standalonePeers.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="btn small secondary" title="Start a new superset and add another exercise" onClick={()=>{setSupersetEditExerciseId(null);void startSupersetWithCatalog(ex);}}>New superset</button></div>}</div></div>
        {!isCollapsed&&<WorkoutSetLogger section={exerciseSection(ex)} exType={exType} sets={sortedSets} logs={logs} prevBySetId={previousSetViews} showPreviousSets={showPreviousSets} weightUnit={weightUnit} distanceUnit={logDistanceUnit} onDistanceUnitChange={setLogDistanceUnit} canEdit={canEdit()} canLog={canLog()&&exerciseIsLoggable(ex)} weightCaption={weightCaption} onEditSet={editSetStable} onRemoveSet={removeSetStable} onSaveField={saveLogStable} registerFlush={registerLoggerFlush} registerPending={registerLoggerPending} onRetrySet={retrySetLogStable} onDuplicateSet={duplicateSetLogStable} extraSets={extraSetsForExercise(extraSetLogs,ex.id,activeLogDateForLogging()).map((row)=>({id:row.id||`extra-${row.extra_set_number}`,set_type:'working',set_number:row.extra_set_number,target_reps:'',target_weight:''}))} extraLogs={Object.fromEntries(extraSetsForExercise(extraSetLogs,ex.id,activeLogDateForLogging()).map((row)=>[row.id||`extra-${row.extra_set_number}`,row]))} onAddExtraSet={trainingSessionIntent==='log'?()=>{void loggerActionsRef.current.addExtraWorkingSet?.(ex);}:undefined} onSaveExtraField={(id,field,value,opts)=>loggerActionsRef.current.saveExtraSetField?.(id,field,value,opts)} onSkipExercise={trainingSessionIntent==='log'?()=>{void loggerActionsRef.current.skipExercise?.(ex);}:undefined} exerciseSkipped={!!skippedExerciseIds[ex.id]} registerInputRef={el=>{if(el&&!refs.current.includes(el))refs.current.push(el)}} onInputKeyDown={(e)=>loggerActionsRef.current.next?.(e)} onFocusNextInput={(el)=>loggerActionsRef.current.focusNextInput?.(el)}/>}
      </div>;};
 const trainingHeading=trainingPageHeading({sessionOpen:trainingSessionOpen,sessionIntent:trainingSessionIntent,selectedDateLabel:formatLongWeekday(logDate)});
 const showSessionFinish=showFinishWorkoutAction({sessionOpen:trainingSessionOpen,sessionIntent:trainingSessionIntent})&&!!workout;
 const sessionFeedbackCopy=sessionFeedbackSummary({status:sessionOutcome,feel:sessionFeel,pain:sessionPain,notes:sessionNotes,skipReason:sessionSkipReason});
 const workoutExerciseSections=<>
  {displayWorkout&&<div className="card training-workout-panel"><div className="topline" style={{justifyContent:'space-between'}}><h2>{displayWorkout.day_label} · {displayWorkout.workout_type}</h2><div className="actions"><button type="button" className="btn small secondary" onClick={()=>{const ids=(displayWorkout.st_exercises||[]).map((e:any)=>e.id);setCollapsedExercises((prev:any)=>{const next={...prev};ids.forEach((id:string)=>next[id]=false);return next;});}}>Expand all</button><button type="button" className="btn small secondary" onClick={()=>{const ids=(displayWorkout.st_exercises||[]).map((e:any)=>e.id);setCollapsedExercises((prev:any)=>{const next={...prev};ids.forEach((id:string)=>next[id]=true);return next;});}}>Collapse all</button><span className="muted">{workingExerciseCountLabel(workingExerciseCount(displayWorkout))||'No working exercises'}</span></div></div></div>}
  {displayWorkout&&workoutSectionsForDisplay(displayWorkout,{hideEmpty:trainingSessionIntent==='log'}).map((sec:any)=>{
   const exercises=sectionExercises(displayWorkout,sec.id);
   const primerExercises=sec.id==='warmup'?exercises.filter((e:any)=>/power primer/i.test(String(e.notes||''))):[];
   const displayExercises=sec.id==='warmup'?exercises.filter((e:any)=>!/power primer/i.test(String(e.notes||''))):exercises;
   const blocks=groupSectionBlocks(displayExercises);
   const primerBlocks=groupSectionBlocks(primerExercises);
   return <div className={`section-block${sec.id==='cooldown'?' section-cooldown':''}`} key={sec.id}><div className="section-head"><h2>{sec.label}</h2><div className="section-head-actions"><span className="badge">{exercises.length}</span>{exercises.length>0&&<><button type="button" className="btn small secondary" onClick={()=>{const ids=exercises.map((e:any)=>e.id);setCollapsedExercises((prev:any)=>{const next={...prev};ids.forEach((id:string)=>next[id]=false);return next;});}}>Expand</button><button type="button" className="btn small secondary" onClick={()=>{const ids=exercises.map((e:any)=>e.id);setCollapsedExercises((prev:any)=>{const next={...prev};ids.forEach((id:string)=>next[id]=true);return next;});}}>Collapse</button></>}</div></div>
   {sec.id==='warmup'&&primerBlocks.length>0&&<p className="muted" style={{margin:'0 0 8px'}}>Session warm-up is separate from the optional power primer below.</p>}
   {blocks.map((block:any)=>sec.id==='warmup'
    ?(block.type==='superset'?block.exercises.map((ex:any)=>renderWarmupExerciseCard(ex)):renderWarmupExerciseCard(block.exercises[0]))
    :block.type==='superset'
    ?<div className="superset-block" key={block.groupId}><div className="superset-head"><div className="superset-head-left"><span className="superset-tag">Superset</span>{canEdit()?<input className="superset-label-input" defaultValue={block.label||'Superset'} onBlur={e=>{if(e.target.value.trim()&&e.target.value!==block.label)renameSuperset(block.exercises[0],e.target.value);}}/>:<span className="badge superset-badge">{block.label||'Superset'}</span>}</div><div className="superset-head-actions"><span className="muted">{block.exercises.length} exercises</span>{canEdit()&&block.exercises.length<3&&<button className="btn small secondary" onClick={()=>openAddExercisePanel(sec.id,block.groupId)}>+ Add</button>}{canEdit()&&<button className="btn small secondary" onClick={()=>breakSuperset(block.exercises[0])}>Break</button>}</div></div><div className="superset-exercises">{block.exercises.map((ex:any,idx:number)=>renderExerciseCard(ex,true,supersetMarks(block.label,block.exercises.length)[idx]))}</div>{blockRestLabel(block.exercises)?<p className="muted te-superset-rest">Rest: {String(blockRestLabel(block.exercises)).replace(' rest','')} after the pair</p>:null}</div>
    :renderExerciseCard(block.exercises[0]))}
   {sec.id==='warmup'&&primerBlocks.length>0&&<div className="section-head" style={{marginTop:12}}><h2>Power Primer</h2><span className="badge">{primerExercises.length}</span></div>}
   {sec.id==='warmup'&&primerBlocks.map((block:any)=>block.type==='superset'?block.exercises.map((ex:any)=>renderWarmupExerciseCard(ex)):renderWarmupExerciseCard(block.exercises[0]))}
   {canEdit()&&<div className="section-add-row"><button type="button" className="btn secondary" onClick={()=>openAddExercisePanel(sec.id)}>+ Add Exercise</button></div>}
   {!exercises.length&&!canEdit()&&<p className="muted section-empty">No {sec.label.toLowerCase()} exercises.</p>}
   </div>;
  })}
 </>;
 const memberWorkoutLoggingPanel=<>
  <div className="card viewing-banner groups-member-workout-banner"><div className="topline" style={{justifyContent:'space-between',alignItems:'flex-start',gap:12}}><div><h2>{viewingMember?.display_name||'Member'}&apos;s workout</h2><p className="muted">{assignmentTypeLabel(memberAssignments[viewingMember?.user_id]?.assignment_type||(viewingMember?.training_source||'team')==='personal'?'personal':'team')} · {memberWorkoutProgram?.name||'No program'}{canManageGroupView()?' · manager can log':''}</p></div><button type="button" className="btn small secondary" onClick={closeMemberView}>Close workout</button></div></div>
  {!memberWorkoutProgram&&<div className="card"><p className="muted">No published program assigned for this member yet.</p></div>}
  {memberWorkoutProgram&&<div className="training-plan-card ui-card ui-card--elevated"><TrainingWeekSelector week={memberWorkoutWeek} program={memberWorkoutProgram} weeksFallback={weeks} onWeekChange={onMemberWeekChange} logDate={memberWorkoutLogDate} onLogDateChange={onMemberLogDateChange}/></div>}
  {memberWorkoutProgram&&memberWeekWorkouts.length>0&&<TrainingWorkoutDays program={memberWorkoutProgram} week={memberWorkoutWeek} workouts={memberWeekWorkouts} activeWorkoutId={memberWorkout?.id||''} logDate={memberWorkoutLogDate} onSelectWorkout={onSelectMemberWorkoutDay}/>}
  <div className="groups-member-workout">{workoutExerciseSections}</div>
 </>;
 const equipmentChips=(list:string[],onToggle:(id:string)=>void,muted?:string)=><><label>Available equipment</label><p className="muted">{muted||'AI plans and exercise search only use gear you select here (bodyweight stretches always allowed).'}</p><div className="focus-muscle-grid equipment-grid">{EQUIPMENT_OPTIONS.map((o:any)=><button type="button" key={o.id} className={`focus-chip${list.includes(o.id)?' active':''}`} onClick={()=>onToggle(o.id)}>{o.label}</button>)}</div>{hasEquipmentFilter(list)&&<p className="muted">Active filter: {equipmentFilterLabel(list)}</p>}</>;
 const teamPrograms=(programs||[]).filter((p:any)=>p.visibility==='team'&&p.team_id===activeTeam?.id);
 const assignableTeamPrograms=teamPrograms.filter((p:any)=>isPublishedProgram(p));
 const profileFields=(compact=false)=><>
  <label>Display name</label>
  <input value={profileDraft.display_name} onChange={e=>setProfileDraft({...profileDraft,display_name:e.target.value})} placeholder="Your name"/>
  <div className="row"><div><label>Height (in)</label><input type="number" min="0" step="0.1" value={profileDraft.height_inches} onChange={e=>setProfileDraft({...profileDraft,height_inches:e.target.value})} placeholder="70"/></div><div><label>Weight (lb)</label><input type="number" min="0" step="0.1" value={profileDraft.weight_lbs} onChange={e=>setProfileDraft({...profileDraft,weight_lbs:e.target.value})} placeholder="185"/></div></div>
  <div className="row"><div><label>Birth year</label><input type="number" min="1900" max="2100" value={profileDraft.birth_year} onChange={e=>setProfileDraft({...profileDraft,birth_year:e.target.value})} placeholder="1990"/></div><div><label>Sex</label><select value={profileDraft.sex} onChange={e=>setProfileDraft({...profileDraft,sex:e.target.value})}><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></div></div>
  <div className="row"><div><label>What best describes your fitness experience?</label><select value={profileDraft.experience_level} onChange={e=>setProfileDraft({...profileDraft,experience_level:e.target.value})}><option value="beginner">I&apos;m new to fitness</option><option value="intermediate">I work out occasionally</option><option value="advanced">I train regularly</option><option value="athlete">I&apos;m an athlete</option></select></div><div><label>Primary goal</label><select value={profileDraft.primary_goal} onChange={e=>setProfileDraft({...profileDraft,primary_goal:e.target.value})}><option value="general_health">General health</option><option value="strength">Strength</option><option value="muscle">Build muscle</option><option value="fat_loss">Fat loss</option></select></div></div>
  <label>Units preference</label>
  <select value={profileDraft.units_preference} onChange={e=>setProfileDraft({...profileDraft,units_preference:e.target.value})}><option value="imperial">Imperial (lb, in)</option><option value="metric">Metric (future display)</option></select>
  {equipmentChips(normalizeEquipmentList(profileDraft.available_equipment),(id)=>setProfileDraft({...profileDraft,available_equipment:toggleEquipmentList(normalizeEquipmentList(profileDraft.available_equipment),id)}))}
  {!compact&&<p className="muted">Height and weight help personalize training and progress tracking.</p>}
 </>;

 if(!authReady||(session&&profileLoading))return <div className="auth-shell"><div className="login"><div className="panel auth-loading"><div className="brand">Build<span>IQ</span> Health</div><p className="muted">Loading your account...</p></div></div></div>;
 if(!session)return <div className="auth-shell"><header className="header"><div><div className="brand">Build<span>IQ</span> Health</div><div className="muted">Training · nutrition · progress</div></div></header><div className="login"><div className="panel auth-panel"><div className="tabs auth-tabs"><button className={authMode==='signin'?'active':''} onClick={()=>setAuthMode('signin')}>Sign In</button><button className={authMode==='signup'?'active':''} onClick={()=>setAuthMode('signup')}>Create Account</button></div>{authMode==='signin'?<form onSubmit={e=>{e.preventDefault();signIn();}}><label htmlFor="signin-email">Email</label><input id="signin-email" name="email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/><label htmlFor="signin-password">Password</label><input id="signin-password" name="password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/><label className="remember-row"><input type="checkbox" checked={rememberEmail} onChange={e=>setRememberEmail(e.target.checked)}/> Remember email on this device</label><button className="btn full" style={{marginTop:10}} type="submit">Sign In</button><p className="muted">Use your browser&apos;s password manager to save your password.</p></form>:<form onSubmit={e=>{e.preventDefault();signUp();}}><label htmlFor="signup-email">Email</label><input id="signup-email" name="email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/><label htmlFor="signup-password">Password</label><input id="signup-password" name="password" type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/><label htmlFor="signup-confirm">Confirm password</label><input id="signup-confirm" name="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/><h3 style={{marginTop:14}}>Your profile</h3>{profileFields()}<label className="remember-row"><input type="checkbox" checked={rememberEmail} onChange={e=>setRememberEmail(e.target.checked)}/> Remember email on this device</label><button className="btn green full" style={{marginTop:10}} type="submit" disabled={profileSaving}>{profileSaving?'Creating account...':'Create Account'}</button></form>}</div></div></div>;
 if(profileNeedsSetup(profile))return <div className="auth-shell"><header className="header"><div className="brand">Build<span>IQ</span> Health</div><button className="btn secondary" onClick={signOut}>Sign Out</button></header><div className="login"><div className="panel auth-panel"><h2>Complete your profile</h2><p className="muted">A few details help BuildIQ Health personalize workouts and track progress.</p>{profileFields()}<button className="btn green full" style={{marginTop:10}} onClick={createProfile} disabled={profileSaving}>{profileSaving?'Saving...':'Continue to BuildIQ Health'}</button></div></div></div>;

 return <>
 <AppHeader
  displayName={displayName}
  contextLabel={appNav==='Groups'?`${displayName||'You'} · ${activeTeam?.name||'Groups'}`:`${displayName||'You'} · ${activeTeam?.name||'Personal'}`}
  userId={session?.user?.id}
  onOpenNotification={openNotificationTarget}
  onOpenSettings={()=>goNav('Settings')}
  onOpenProgress={()=>goNav('Progress')}
  onOpenAiCoach={()=>goNav('AI Coach')}
  onSignOut={signOut}
  onReportIssue={()=>{setBugOpen(true);setBugSentId('');}}
 >
  <PrimaryNav active={appNav} onNavigate={goNav} />
 </AppHeader>
 <div className="app-shell" key={session?.user?.id||'signed-out'}>
 <main className="main page-main">
  {appNav==='Dashboard'&&<section className="dashboard"><div className="dash-hero"><h1>{greeting}, {displayName||'there'}</h1></div><div className="dash-grid">{session?.user&&<TodaysTrainingHero userId={session.user.id} teams={teams.map((t:any)=>({id:t.id,name:t.name}))} inputsReady={trainingScheduleReady&&userCalendarReady} programReady={programTreeReady} scheduleRepairGeneration={scheduleRepairGeneration} loadError={userCalendarError} program={program} programName={program?.name||null} followedFromGroup={followedFromGroup} followedSourceProgramId={personalizedCopy?program?.source_program_id||null:null} activities={trainingActivities} calendarActivities={userCalendarActivities} workouts={trainingCompletionWorkouts} progressLogs={progressLogs} sessionLogs={logDate===todayYmd()&&!(viewingMember&&viewingMember.user_id!==session.user.id)?logs:{}} onNavigate={openTodayTraining}/>}{session?.user&&<DashboardQuickActions showGroup={teams.length>0} onLogMeal={openLogMeal} onAddCheckIn={openAddCheckIn} onViewProgress={openProgressOverview} onViewGroup={()=>goNav('Groups')}/>}{session?.user&&<WeeklyAdherenceCard userId={session.user.id} onSelectDate={openTrainingWeekDay}/>}{session?.user&&<NutritionDashboardCard userId={session.user.id} onViewLog={openNutritionLog} onSetGoals={openNutritionGoals}/>}{session?.user&&<ProgressDashboardCard userId={session.user.id} unitsPreference={profileDraft?.units_preference} onViewProgress={openProgressOverview} onOpenStrength={openProgressStrength} onOpenBody={openProgressBody}/>}</div></section>}
  {appNav==='Nutrition'&&session?.user&&<LazyScreen loader={nutritionScreenLoader} fallback={<p className="muted">Loading nutrition…</p>}>{(NutritionTracker)=><NutritionTracker userId={session.user.id} launch={nutritionLaunch} onLaunchConsumed={()=>setNutritionLaunch(null)} onOpenSettings={()=>goNav('Settings')}/>}</LazyScreen>}
  {appNav==='AI Coach'&&<section><div className="card dash-accent"><h2>AI Coach</h2><p className="muted">Your BuildIQ Health wellness coach will analyze workouts, nutrition, and recovery to give safe, practical guidance.</p><p className="dash-insight">Coming soon: readiness check-ins, workout adjustments, and weekly coaching summaries.</p></div></section>}
  {appNav==='Progress'&&<LazyScreen loader={progressScreenLoader} fallback={<p className="muted">Loading progress…</p>}>{(ProgressScreen)=><ProgressScreen userId={session?.user?.id||null} unitsPreference={profileDraft?.units_preference} weightUnit={progressWeightUnit} section={progressSection} onSectionChange={setProgressSection} exerciseRequest={progressExercise} onOpenExercise={setProgressExercise} onCloseExercise={()=>closeExerciseProgress('back')} onDismissExercise={()=>closeExerciseProgress('dismiss')} onOpenNutrition={()=>goNav('Nutrition')} onBodyDataChange={()=>{if(session?.user?.id)bumpDashboardCardEpoch(session.user.id,'progress');}}/>}</LazyScreen>}
  {appNav==='Groups'&&session?.user&&<LazyScreen loader={groupsScreenLoader} fallback={<p className="muted">Loading group…</p>}>{(GroupsHub)=><GroupsHub sessionUserId={session.user.id} teams={teams} selectedTeamId={selectedTeamId} activeTeam={activeTeam} members={members} memberStats={memberStats} memberRosterMeta={memberRosterMeta} memberPerformance={memberPerformance} performanceLoading={memberPerformanceLoading} restoreMemberHistoryBusy={memberHistoryRestoreBusy} weightUnit={profileDraft?.units_preference==='metric'?'kg':'lb'} memberDashboard={memberDashboard} memberDashProgram={memberDashProgram} memberDashLogs={memberDashLogs} memberDashLastDate={memberDashLastDate} memberTodayWorkout={memberTodayWorkout} memberWorkoutStatus={memberWorkoutStatus} memberAssignment={memberAssignment} memberAssignments={memberAssignments} assignDraft={assignDraft} programs={programs} assignableTeamPrograms={assignableTeamPrograms} teamPrograms={teamPrograms} groupProgramForAssign={groupProgramForAssign} assignWorkoutPrograms={assignWorkoutPrograms} classifications={classifications} memberClassificationIds={memberClassificationIds} canViewGroupProgress={!!activeTeam&&canViewGroupMemberProgress(activeTeam.my_role, groupPermissionFlags(activeTeam))} teamActiveCount={teamActiveCount} teamTotalSets={teamTotalSets} teamPlanCount={teamPlanCount} canManage={canManageGroupView()} isOwner={isOwner()} logDate={logDate} week={week} memberWorkoutPanel={showGroupsMemberWorkout?memberWorkoutLoggingPanel:null} onWorkspaceTabChange={handleGroupsWorkspaceTabChange} onSelectTeam={selectTeam} defaultTeamId={profile?.default_team_id||null} onSetDefaultTeam={setDefaultTeam} onCreateGroup={createTeam} onJoinGroup={joinTeam} accessToken={session?.access_token||null} onRefreshMembers={()=>{loadMembers();loadMemberStats();loadMemberClassificationLinks();}} onOpenMember={openMemberDashboard} onLogGroupWorkout={logOwnGroupWorkout} onLogGroupActivity={logOwnGroupActivity} groupLogResume={groupTrainingResume} onGroupLogResumeConsumed={()=>setGroupTrainingResume(null)} onCloseMemberDashboard={()=>{setMemberDashboard(null);setMemberPerformance(null);}} onOpenMemberWorkout={openMemberView} onSetMemberTrainingSource={setMemberTrainingSource} onSetMemberRole={setRole} onRemoveMember={removeMember} onSetParticipation={setMemberParticipation} onAssignDraftChange={setAssignDraft} onApplyAssignment={()=>memberDashboard&&assignMemberProgram(memberDashboard,assignDraft.type,assignDraft.programId||null,assignDraft.notes)} onAssignWorkout={assignWorkoutToTargets} onCreateClassification={createClassification} onDeleteClassification={deleteClassification} onToggleMemberClassification={toggleMemberClassification} onSetModeTeam={()=>setMode('team')} onOpenGroupsProgramWizard={openGroupsProgramWizard} onDuplicateProgram={duplicateTeamProgramHandler} onEditTeamProgram={editTeamProgramFromGroups} onPublishTeamProgram={(id)=>publishProgram(id,false)} onAssignTeamProgram={assignTeamProgramHandler} assignmentResume={assignmentResume} onAssignmentResumeConsumed={()=>setAssignmentResume(null)} onCreateAssignmentProgram={openAssignmentProgramDesign} onSubmitAssignment={submitGroupAssignment} onDeleteProgram={deleteProgramHandler} onCustomizeProgramForMember={customizeProgramForMemberHandler} onGenerateProgramForMember={generateProgramForMemberHandler} onRefreshMemberPerformance={()=>refreshMemberPerformance()} onRestoreMemberHistory={restoreMemberLoggedHistory} onRestoreTeamHistory={restoreLoggedHistoryToProgram} restoreTeamHistoryBusy={historyRestoreBusy} onLeaveTeam={leaveTeamHandler} onDeleteTeam={deleteTeamHandler} onSaveGroupPermissions={saveGroupPermissions} onTransferOwnership={transferGroupOwnership} pendingConversation={pendingGroupMessage} onPendingConversationHandled={()=>setPendingGroupMessage(null)} sectionExercises={sectionExercises} statusLabel={statusLabel}/>}</LazyScreen>}
  {appNav==='Settings'&&<section><div className="card"><div className="topline" style={{justifyContent:'space-between'}}><h2>Profile</h2><button className="btn small green" onClick={()=>saveProfile(true)} disabled={profileSaving}>{profileSaving?'Saving...':'Save Profile'}</button></div><p className="muted">Update your account details used across BuildIQ Health.</p>{profileFields(true)}</div>{session?.user&&<NotificationPreferences userId={session.user.id}/>}{session?.user&&<div id="nutrition-goals"><NutritionGoalsSettings userId={session.user.id} onSaved={()=>{if(session?.user?.id)bumpDashboardCardEpoch(session.user.id,'nutrition');}}/></div>}<BugReportsAdmin accessToken={session?.access_token||null}/>{(masterImportStatus?.isCatalogAdmin||guidedImportStatus?.isCatalogAdmin)&&<div className="card guided-import-card"><div className="topline" style={{justifyContent:'space-between'}}><h2>BuildIQ Master Library</h2><div className="actions"><button type="button" className="btn small secondary" onClick={()=>void downloadCatalogCsv()}>Download CSV</button><button type="button" className="btn small secondary" onClick={()=>{loadMasterImportStatus(); loadGuidedImportStatus();}} disabled={masterImportRunning||guidedImportRunning}>Refresh status</button></div></div><p className="muted">Replace the old 1,300+ GIF dump with the curated movement library. Current workout plans keep their names, sets, and history. Catalog links remap to the new cards. Old system exercises are archived, not deleted.</p><div className="dash-metrics" style={{marginTop:8}}><div><b>{masterImportStatus?.masterCount??'—'}</b><span className="muted">Master exercises live</span></div><div><b>{masterImportStatus?.expectedCount??254}</b><span className="muted">Expected after import</span></div><div><b>{masterImportStatus?.canImport?'Ready':'Setup needed'}</b><span className="muted">Server import</span></div></div><p className="muted" style={{marginTop:8}}>{masterImportStatus?.message||'Open Settings to check import status.'}</p>{masterImportStatus?.canImport?<button className="btn green" style={{marginTop:10}} onClick={importMasterCatalog} disabled={masterImportRunning}>{masterImportRunning?'Importing master library…':'Import Master Library'}</button>:<p className="muted dash-insight" style={{marginTop:10}}>Add <code>SUPABASE_SERVICE_ROLE_KEY</code> on the server, restart, then import here.</p>}</div>}{guidedImportStatus?.isCatalogAdmin&&<div className="card guided-import-card"><div className="topline" style={{justifyContent:'space-between'}}><h2>Legacy Guided Library</h2><div className="actions"><button type="button" className="btn small secondary" onClick={()=>void downloadCatalogCsv()}>Download CSV</button><button className="btn small secondary" onClick={loadGuidedImportStatus} disabled={guidedImportRunning}>Refresh status</button></div></div><p className="muted">ExerciseDB import is paused until commercial rights are verified. Stored rows stay in the database. GIF demos and ExerciseDB instructions stay hidden.</p><div className="dash-metrics" style={{marginTop:8}}><div><b>{guidedImportStatus?.guidedCount??'—'}</b><span className="muted">ExerciseDB rows stored</span></div><div><b>Paused</b><span className="muted">New import</span></div></div><p className="muted" style={{marginTop:8}}>{guidedImportStatus?.message||'Open Settings to check how many ExerciseDB rows are stored.'}</p><button className="btn green" style={{marginTop:10}} type="button" disabled>Import Guided Library unavailable</button><button className="btn secondary" style={{marginTop:10}} onClick={runCatalogDedupe} disabled={catalogDedupeRunning||!guidedImportStatus?.canImport}>{catalogDedupeRunning?'Merging duplicates…':'Merge duplicate exercises'}</button><p className="muted" style={{marginTop:6}}>Keeps one Pull Up / Pull-ups style entry in search. Never deletes catalog rows that have logged history — those stay and history merges by name.</p></div>}<div className="card"><div className="topline" style={{justifyContent:'space-between'}}><h2>My Exercise Catalog</h2><div className="actions">{activeUserCatalog.length>0&&<button className="btn small red" onClick={archiveAllCustomExercises}>Remove all custom exercises</button>}<button className="btn small secondary" onClick={loadCatalog}>Refresh</button></div></div><p className="muted">Custom exercises are private to your account. Built-in exercises with form guides are used in workout search and AI program generation.</p>{activeUserCatalog.length===0&&archivedUserCatalog.length===0&&<p className="muted">No custom exercises yet. Create one from Training or below.</p>}{activeUserCatalog.map((item:any)=><div key={item.id} className="catalog-row">{catalogEditId===item.id?<div className="catalog-edit-grid"><input value={catalogEditDraft.name} onChange={e=>setCatalogEditDraft({...catalogEditDraft,name:e.target.value})} placeholder="Name"/><select value={catalogEditDraft.category} onChange={e=>setCatalogEditDraft({...catalogEditDraft,category:e.target.value})}><option value="warmup">Warmup</option><option value="strength">Strength</option><option value="mobility">Mobility</option><option value="plyometric">Plyometric</option><option value="other">Other</option></select><input value={catalogEditDraft.muscle_group} onChange={e=>setCatalogEditDraft({...catalogEditDraft,muscle_group:e.target.value})} placeholder="Muscle group"/><input value={catalogEditDraft.equipment} onChange={e=>setCatalogEditDraft({...catalogEditDraft,equipment:e.target.value})} placeholder="Equipment"/><select value={catalogEditDraft.movement_pattern} onChange={e=>setCatalogEditDraft({...catalogEditDraft,movement_pattern:e.target.value})}><option value="">Movement pattern (optional)</option>{MOVEMENT_PATTERNS.map(p=><option key={p} value={p}>{p.replace(/_/g,' ')}</option>)}</select><div className="actions"><button className="btn small green" onClick={saveCustomExerciseEdit}>Save</button><button className="btn small secondary" onClick={()=>setCatalogEditId(null)}>Cancel</button></div></div>:<><div><b>{item.name}</b><div className="muted">{item.muscle_group||'Muscle'}{item.equipment?` · ${item.equipment}`:''}{item.movement_pattern?` · ${item.movement_pattern}`:''}</div></div><div className="actions"><button className="btn small secondary" onClick={()=>{setCatalogEditId(item.id); setCatalogEditDraft({name:item.name,category:item.category||'strength',muscle_group:item.muscle_group||'',equipment:item.equipment||'',movement_pattern:item.movement_pattern||''});}}>Edit</button><button className="btn small red" onClick={()=>archiveCustomExercise(item,true)}>Archive</button></div></>}</div>)}{archivedUserCatalog.length>0&&<><h3 style={{marginTop:12}}>Archived</h3>{archivedUserCatalog.map((item:any)=><div key={item.id} className="catalog-row archived"><div><b>{item.name}</b><div className="muted">Archived · not shown in workout search</div></div><button className="btn small secondary" onClick={()=>archiveCustomExercise(item,false)}>Restore</button></div>)}</>}</div><div className="card"><h2>Create Custom Exercise</h2><div className="catalog-edit-grid"><input value={customDraft.name} onChange={e=>setCustomDraft({...customDraft,name:e.target.value})} placeholder="Exercise name"/><select value={customDraft.category} onChange={e=>setCustomDraft({...customDraft,category:e.target.value})}><option value="warmup">Warmup</option><option value="strength">Strength</option><option value="mobility">Mobility</option><option value="plyometric">Plyometric</option><option value="other">Other</option></select><input value={customDraft.muscle_group} onChange={e=>setCustomDraft({...customDraft,muscle_group:e.target.value})} placeholder="Muscle group"/><input value={customDraft.equipment} onChange={e=>setCustomDraft({...customDraft,equipment:e.target.value})} placeholder="Equipment"/><select value={customDraft.movement_pattern} onChange={e=>setCustomDraft({...customDraft,movement_pattern:e.target.value})}><option value="">Movement pattern (optional)</option>{MOVEMENT_PATTERNS.map(p=><option key={p} value={p}>{p.replace(/_/g,' ')}</option>)}</select></div><button className="btn green" style={{marginTop:8}} onClick={()=>createCustomExercise(customDraft.category||'strength', false)}>Save to My Catalog</button></div></section>}
  {appNav==='Programs'&&session?.user&&<LazyScreen loader={programDesignScreenLoader} fallback={<p className="muted">Loading programs…</p>}>{(ProgramDesignHome)=><ProgramDesignHome supabase={supabase} userId={session.user.id} teams={teams.map((t:any)=>({id:t.id,name:t.name,my_role:t.my_role,default_program_id:t.default_program_id,members_can_create_shared_workouts:t.members_can_create_shared_workouts,members_can_edit_shared_workouts:t.members_can_edit_shared_workouts,members_can_assign_workouts:t.members_can_assign_workouts,members_can_view_member_progress:t.members_can_view_member_progress}))} selectedTeamId={selectedTeamId||activeTeam?.id||null} followedProgramId={profile?.followed_program_id||null} onSelectTeam={(id)=>selectTeam(id)} launch={programsLaunch} onLaunchConsumed={()=>setProgramsLaunch(null)} onAssignmentProgramReady={assignmentProgramReady} onFollowed={(programId, opts)=>{setProfile((p:any)=>p?{...p,followed_program_id:programId}:p);if(programId){setMode('personal');if(opts?.openTraining!==false){setAppNav('Training');setTrainingSessionOpen(false);}void loadPrograms('training');}else{setProgram(null);setTrainingActivities([]);setActiveWorkout('');void loadPrograms('training');}}}/>}</LazyScreen>}
  {appNav==='Training'&&<section>
    <div className="training-screen-head">
      <SectionHeader
        title={trainingHeading.title}
        subtitle={trainingHeading.subtitle}
        actions={trainingSessionOpen?(
          <button type="button" className="btn small secondary" onClick={closeTrainingLogger}>Back to calendar</button>
        ):undefined}
      />
    </div>
    {trainingSessionOpen&&groupLogReturn&&<p className="group-log-date" data-testid="group-log-date">Scheduled {formatDisplayDate(groupLogReturn.scheduledDate)}</p>}
    {!viewingMember&&!trainingSessionOpen&&<AssignedWorkoutsPanel assignments={assignedWorkouts} activeRecipientId={activeAssignedRecipient?.id||null} onOpen={openAssignedWorkout} onCloseActive={activeAssignedRecipient?closeAssignedWorkout:undefined} onCopyToPersonal={copyAssignedWorkoutToPersonal} onDismiss={dismissAssignedWorkout} copyingRecipientId={assignmentCopyBusy} dismissingRecipientId={assignmentDismissBusy} getWorkoutStatus={assignmentPanelStatus} statusLabel={statusLabel}/>}
    {!viewingMember&&!activeAssignedRecipient&&!trainingSessionOpen&&session?.user&&<LazyScreen loader={trainingScheduleLoader} fallback={<p className="muted">Loading training…</p>}>{(UnifiedTrainingSchedule)=><UnifiedTrainingSchedule userId={session.user.id} teams={teams} rangeFrom={trainingExpectationRange.from} rangeTo={trainingExpectationRange.to} scheduleRefreshKey={scheduleRefreshKey} scheduleRepairGeneration={scheduleRepairGeneration} calendar={{
      programName:program?.name||null,
      followedFromGroup,
      followingGroupTemplate,
      personalizedCopy,
      followedProgramId:program?.id||null,
      followedSourceProgramId:personalizedCopy?program?.source_program_id||null:null,
      onCustomizeForMe:canCustomizeForMe?()=>void customizeFollowedProgramForMeHandler():undefined,
      customizeBusy:customizeForMeBusy,
      today:trainingTodayPlan,
      tomorrow:trainingTomorrowPlan,
      weekDays:trainingWeekPlans,
      monthCells:trainingMonthCells,
      monthLabel:trainingMonthLabel,
      selectedDate:logDate,
      weekNumber:week,
      totalWeeks:cycleLengthOf(program||{weeks}),
      calendarView:trainingCalendarView,
      onCalendarViewChange:(view)=>{setTrainingCalendarView(view);if(view==='month')setTrainingCalendarMonth(yearMonthOf(logDate));},
      onPrevWeek:()=>{const next=addDaysYmd(mondayOfWeek(logDate),-7);setLogDate(next);setTrainingCalendarMonth(yearMonthOf(next));if(program)setWeek(weekForDate(resolveProgramStartDate(program),next,program.weeks||weeks||6));},
      onNextWeek:()=>{const next=addDaysYmd(mondayOfWeek(logDate),7);setLogDate(next);setTrainingCalendarMonth(yearMonthOf(next));if(program)setWeek(weekForDate(resolveProgramStartDate(program),next,program.weeks||weeks||6));},
      onThisWeek:()=>{const now=todayYmd();setLogDate(now);setTrainingCalendarMonth(yearMonthOf(now));if(program)setWeek(weekForDate(resolveProgramStartDate(program),now,program.weeks||weeks||6));},
      onPrevMonth:()=>setTrainingCalendarMonth((m)=>shiftYearMonth(m,-1)),
      onNextMonth:()=>setTrainingCalendarMonth((m)=>shiftYearMonth(m,1)),
      onThisMonth:()=>{const now=todayYmd();setTrainingCalendarMonth(yearMonthOf(now));setLogDate(now);},
      onSelectDay:onSelectTrainingDay,
      onStartWorkout:(item,date)=>beginTrainingItem(item,date),
      onViewWorkout:(item,date)=>{void previewTrainingItem(item,date);},
      onOpenPrograms:()=>goNav('Programs'),
      onAddActivity:(date)=>{setLogDate(date);setTrainingAddActivityOpen(true);},
      onEditActivity:(activityId,date)=>setTrainingEditActivity({id:activityId,date}),
      onSetupWorkout:(activityId,date)=>void setupExistingStrengthActivity(activityId,date),
      onCompleteItem:(item,date)=>void toggleTrainingItemComplete(item,date),
      onMoveItem:(item,date)=>setTrainingMoveItem({item,date}),
      completingItemId:trainingCompleteBusy,
      completedDates:trainingCompletedDates,
      workoutsById:Object.fromEntries((program?.st_workouts||[]).filter((w:any)=>w?.id).map((w:any)=>[w.id,w])),
      workoutDayMoves,
    }}/>}</LazyScreen>}
    {!viewingMember&&!trainingSessionOpen&&!session?.user&&<div className="card"><p className="muted">Sign in to see your training schedule.</p></div>}
    {viewingWorkoutId&&<LazyScreen loader={workoutPlanSheetLoader} fallback={null}>{(WorkoutPlanSheet)=><WorkoutPlanSheet
      workout={workoutPreviewMeta&&('workout' in workoutPreviewMeta)?workoutPreviewMeta.workout:findWorkoutAnywhere(viewingWorkoutId)}
      dateLabel={formatDisplayDate(logDate)}
      sourceName={workoutPreviewMeta?.sourceName||null}
      duration={workoutPreviewMeta?.duration||null}
      catalog={catalog}
      error={workoutPreviewMeta?.error||null}
      completed={!!workoutPreviewMeta?.completed}
      canEdit={canShowTrainingPreviewEdit({
        authorized: canEdit(),
        personalCalendar: isPersonalCalendarWorkout(viewingWorkoutId),
        hasWorkout: !!(workoutPreviewMeta && workoutPreviewMeta.workout),
        loadError: workoutPreviewMeta?.error || null,
      })}
      onClose={()=>{setViewingWorkoutId(null);setWorkoutPreviewMeta(null);restoreFollowedCalendar();}}
      onStart={()=>{const pending=schedulePreviewRef.current;if(pending&&pending.workoutId===viewingWorkoutId)void startScheduledWorkout(pending);else startTrainingSession(viewingWorkoutId,logDate,'log');}}
      onEdit={()=>startTrainingSession(viewingWorkoutId,logDate,'edit')}
    />}</LazyScreen>}
    {trainingSessionOpen&&trainingSessionIntent==='log'&&followingGroupTemplate&&!activeAssignedRecipient&&<div className="card program-draft-banner"><p className="muted" role={customizeForMeBusy?'status':undefined}>{customizeForMeBusy?'Making your private copy so edits stay just for you…':'Logging is only yours. If you change exercises or planned sets, BuildIQ makes a private copy so the group plan stays the same.'}</p></div>}
    {trainingSessionOpen&&customizeForMeBusy&&trainingSessionIntent==='log'&&!followingGroupTemplate&&!activeAssignedRecipient&&<div className="card program-draft-banner" role="status"><p className="muted">Making your private copy so edits stay just for you…</p></div>}
    {trainingSessionOpen&&trainingSessionIntent==='edit'&&!activeAssignedRecipient&&<div className="card program-draft-banner"><div className="topline" style={{justifyContent:'space-between',alignItems:'flex-start',gap:12}}>{customizeForMeBusy?<p className="muted" role="status">Making your private copy so edits stay just for you…</p>:<><p className="muted">{personalizedCopy||!followingGroupTemplate?'This copy is only yours. The group plan is unchanged. ':'Edits during Training stay on your private copy. The group plan is unchanged. '}Change exercises and sets here. Start Workout is only for logging.</p><button type="button" className="btn small green" onClick={()=>setTrainingSessionIntent('log')}>Start Workout</button></>}</div></div>}
    {trainingAddActivityOpen&&session?.user&&<AddActivitySheet
      dayLabel={formatDisplayDate(logDate)}
      allowRecurrence
      allowMultiDay
      defaultWeekday={weekdayIndexFromYmd(logDate)}
      onClose={()=>setTrainingAddActivityOpen(false)}
      onSave={async(draft)=>{
        let workoutId:string|null=null;
        let createdWorkout:any=null;
        if(draft.activity_type==='strength'){
          const created=await createPersonalStrengthWorkout(supabase,session.user.id,logDate,draft.title||'Strength');
          if(created.error||!created.workout?.id)throw new Error(created.error||'Could not create a strength workout.');
          workoutId=String(created.workout.id);
          createdWorkout=created.workout;
        }
        const{error}=await createUserCalendarActivity(supabase,session.user.id,logDate,draft,{workoutId});
        if(error)throw new Error(error);
        if(createdWorkout)setCalendarWorkouts((prev)=>[createdWorkout,...prev.filter((w:any)=>w.id!==createdWorkout.id)]);
        await refreshCalendarForDate(logDate);
        setTrainingAddActivityOpen(false);
        if(workoutId)await openStrengthSetup('',logDate,workoutId,draft.title||'Strength');
      }}
    />}
    {strengthSetup&&session?.user&&<StrengthWorkoutSetupSheet
      dayLabel={formatDisplayDate(strengthSetup.date)}
      title={strengthSetup.title}
      generating={strengthSetupGenerating}
      error={strengthSetupError}
      onClose={()=>setStrengthSetup(null)}
      onManual={()=>{const{workoutId,date}=strengthSetup;setStrengthSetup(null);startTrainingSession(workoutId,date,'edit');}}
      onGenerate={generateStrengthForSetup}
    />}
    {trainingMoveItem&&session?.user&&<LazyScreen loader={moveWorkoutSheetLoader} fallback={null}>{(MoveWorkoutSheet)=><MoveWorkoutSheet
      title={trainingMoveItem.item.title}
      fromDate={trainingMoveItem.date}
      nativeDate={nativeDateForTrainingItem(trainingMoveItem.item,trainingMoveItem.date)}
      busy={trainingMoveBusy}
      onMove={(toDate)=>moveTrainingItem(trainingMoveItem.item,trainingMoveItem.date,toDate)}
      onReset={()=>resetTrainingItemDay(trainingMoveItem.item,trainingMoveItem.date)}
      onClose={()=>setTrainingMoveItem(null)}
    />}</LazyScreen>}
    {trainingEditActivity&&trainingCalendarEditing&&session?.user&&<AddActivitySheet
      dayLabel={formatDisplayDate(trainingEditActivity.date)}
      calendarExisting={trainingCalendarEditing}
      occurrenceDate={trainingEditActivity.date}
      allowRecurrence
      allowMultiDay
      defaultWeekday={weekdayIndexFromYmd(trainingEditActivity.date)}
      onClose={()=>setTrainingEditActivity(null)}
      onSave={async(draft)=>{const{error}=await saveUserCalendarOccurrence(supabase,trainingCalendarEditing,trainingEditActivity.date,draft);if(error)throw new Error(error);const win=monthWindow(yearMonthOf(logDate));const cal=await fetchUserCalendarActivities(supabase,session.user.id,win.from,win.to);setUserCalendarActivities(cal.data||[]);setTrainingEditActivity(null);}}
      onDelete={async(scope)=>{const{error}=await deleteUserCalendarOccurrence(supabase,trainingCalendarEditing,trainingEditActivity.date,scope||'this-day');if(error)throw new Error(error);const win=monthWindow(yearMonthOf(logDate));const cal=await fetchUserCalendarActivities(supabase,session.user.id,win.from,win.to);setUserCalendarActivities(cal.data||[]);setTrainingEditActivity(null);}}
    />}
    {activeAssignedRecipient&&<div className="card viewing-banner assigned-workout-banner"><div className="topline" style={{justifyContent:'space-between',alignItems:'flex-start',gap:12}}><div><h2>Assigned workout</h2><p className="muted">{activeAssignedRecipient.st_workout_assignments?.st_teams?.name||'Group'} · {formatDisplayDate(activeAssignedRecipient.st_workout_assignments?.scheduled_date||logDate)}{activeAssignedRecipient.st_workout_assignments?.notes?` · ${activeAssignedRecipient.st_workout_assignments.notes}`:''}</p>{!assignedHasPersonalCopy(activeAssignedRecipient)?<p className="muted assigned-copy-hint">Group template is read-only. Copy to your personal plan to adjust exercises and sets.</p>:<p className="muted assigned-copy-hint">You are logging your personal copy. Edits stay on your account; completion still counts for the group assignment.</p>}</div><div className="assigned-banner-actions"><button className="btn small secondary" onClick={closeAssignedWorkout}>Back to personal program</button>{assignedHasPersonalCopy(activeAssignedRecipient)?<span className="badge personal-copy-badge">Personal copy</span>:<button type="button" className="btn small green" onClick={()=>copyAssignedWorkoutToPersonal()} disabled={!!assignmentCopyBusy}>{assignmentCopyBusy===activeAssignedRecipient.id?'Copying…':'Copy to personal plan'}</button>}</div></div></div>}
    {!viewingMember&&!activeAssignedRecipient&&program&&isDraftProgram(program)&&canEdit()&&<div className="card program-draft-banner"><div className="topline" style={{justifyContent:'space-between',alignItems:'flex-start',gap:12}}><div><h2>Draft program</h2><p className="muted"><b>{program.name}</b> is a draft — it will not appear here for logging until you publish it in Programs.</p></div><button type="button" className="btn small green" onClick={()=>{setTrainingSubNav('personal');setDraftEditProgramId(null);setAppNav('Programs');}}>Open in Programs</button></div></div>}
    {showEditScope&&<div className="applybox-compact"><label htmlFor="apply-scope">Apply this change to</label><select id="apply-scope" value={applyScope} onChange={e=>setApplyScope(e.target.value as any)}><option value="current">Just today</option><option value="future">Rest of program</option></select></div>}
    {showSessionFinish&&<div className="card session-outcome-card session-outcome-card--collapsed"><button type="button" className="session-outcome-toggle" aria-expanded={sessionFeedbackExpanded} aria-controls={SESSION_FEEDBACK_PANEL_ID} onClick={(e)=>revealSessionFeedback(e.currentTarget)}><span className="session-outcome-toggle-copy"><span className="session-outcome-toggle-label">How did it go?</span>{sessionFeedbackCopy?<span className="muted">{sessionFeedbackCopy}</span>:null}</span><span className="muted">Show</span></button></div>}
    {trainingSessionOpen&&trainingSessionIntent==='log'&&adaptationSummary&&<AdaptationSummaryCard result={adaptationSummary}/>}
    {(trainingSessionOpen||!!activeAssignedRecipient)&&workoutExerciseSections}
    {showSessionFinish&&<div className="finish-workout-row"><button type="button" className="btn green finish-workout-btn" aria-expanded={sessionFeedbackExpanded} aria-controls={SESSION_FEEDBACK_PANEL_ID} onClick={(e)=>{if(sessionFeedbackExpanded)collapseSessionFeedback();else revealSessionFeedback(e.currentTarget);}}>{finishWorkoutActionLabel(sessionOutcome,sessionFeedbackExpanded)}</button></div>}
    {showSessionFinish&&<div id={SESSION_FEEDBACK_PANEL_ID} className="card session-feedback-inline" role="region" aria-labelledby={SESSION_FEEDBACK_TITLE_ID} hidden={!sessionFeedbackExpanded}><SessionOutcomeCard status={sessionOutcome} feel={sessionFeel} pain={sessionPain} notes={sessionNotes} skipReason={sessionSkipReason} canEdit={canLog()} pendingMigration={phase2a1Pending} notice={(sessionOutcome==='completed'||sessionOutcome==='partial')&&outstandingRequiredSetIds(workout, logs).length?'Additional required sets are still open. Logged sets and feedback stay. Choose Completed when that work is done.':null} embedded onStatus={(s)=>void saveSessionOutcome(s)} onFeel={(v)=>{sessionFeedbackDirtyRef.current=true;void saveSessionOutcome(sessionOutcome,{feel:v});}} onPain={(v)=>{sessionFeedbackDirtyRef.current=true;void saveSessionOutcome(sessionOutcome,{pain:v});}} onNotes={(v)=>{sessionFeedbackDirtyRef.current=true;void saveSessionOutcome(sessionOutcome,{notes:v});}} onSkipReason={(v)=>{sessionFeedbackDirtyRef.current=true;void saveSessionOutcome('skipped',{skipReason:v});}}/></div>}
  </section>}
  {addExercisePanel&&<div className="panel-overlay" onClick={()=>{setPendingAddScope(null);setAddExercisePanel(null);}}><div className="add-exercise-panel card" onClick={e=>e.stopPropagation()}><div className="topline" style={{justifyContent:'space-between'}}><h2>{addExercisePanel.replaceTarget?'Replace exercise':'Add Exercise'} · {addPanelSectionLabel(addExercisePanel.section)}</h2><button type="button" className="btn small secondary" onClick={()=>{setPendingAddScope(null);setAddExercisePanel(null);}}>Cancel</button></div>
    {addExercisePanel.step==='search'&&<>{addExercisePanel.replaceTarget&&<p className="muted" style={{marginBottom:8}}>Replacing <b>{addExercisePanel.replaceTarget.name}</b> — pick a catalog exercise. Sets and logs are kept.</p>}{pendingGroupId&&!addExercisePanel.replaceTarget&&<p className="muted" style={{marginBottom:8}}>Building superset ({pendingGroupInfo?.count||1}/3) — pick the next exercise</p>}<p className="muted catalog-search-meta">Search the full BuildIQ Health exercise library.</p><input className="typeahead-input catalog-search-input" placeholder={`Search exercises (${workoutSearchCatalog.length} available)…`} value={addExercisePanel.query||''} onChange={e=>setAddExercisePanel({...addExercisePanel,query:e.target.value})} autoFocus/><div className="catalog-search-filters"><select value={addExercisePanel.filters?.muscle||''} onChange={e=>setAddExercisePanel({...addExercisePanel,filters:{...(addExercisePanel.filters||emptyAddPanelFilters()),muscle:e.target.value}})} aria-label="Filter by muscle"><option value="">All muscles</option>{(panelFilterOptions?.muscles||[]).map((m:string)=><option key={m} value={m}>{m}</option>)}</select><select value={addExercisePanel.filters?.equipment||''} onChange={e=>setAddExercisePanel({...addExercisePanel,filters:{...(addExercisePanel.filters||emptyAddPanelFilters()),equipment:e.target.value}})} aria-label="Filter by equipment"><option value="">All equipment</option>{(panelFilterOptions?.equipment||[]).map((eq:string)=><option key={eq} value={eq}>{eq}</option>)}</select><select value={addExercisePanel.filters?.exerciseType||''} onChange={e=>setAddExercisePanel({...addExercisePanel,filters:{...(addExercisePanel.filters||emptyAddPanelFilters()),exerciseType:e.target.value}})} aria-label="Filter by type"><option value="">All types</option>{(panelFilterOptions?.exerciseTypes||[]).map((t:string)=><option key={t} value={t}>{t}</option>)}</select><label className="remember-row catalog-guides-filter"><input type="checkbox" checked={!!addExercisePanel.filters?.guidesOnly} onChange={e=>setAddExercisePanel({...addExercisePanel,filters:{...(addExercisePanel.filters||emptyAddPanelFilters()),guidesOnly:e.target.checked}})}/> With form guide</label></div>{hasEquipmentFilter(equipmentForSearch)&&<p className="muted catalog-search-meta">Your equipment filter is active: {equipmentFilterLabel(equipmentForSearch)}</p>}{panelHasSearch&&<p className="muted catalog-search-meta">Showing {panelResults.length}{panelMatchCount>panelResults.length?` of ${panelMatchCount}`:''} match{panelMatchCount===1?'':'es'}</p>}<div className="typeahead-menu panel-results catalog-search-results">{panelResults.length?panelResults.map((item:any)=><button type="button" key={item.id} className="typeahead-item catalog-search-item" onClick={()=>pickExerciseForPanel(item)}>{getExerciseThumb(item)&&<img className="catalog-search-thumb" src={getExerciseThumb(item)||''} alt="" loading="lazy" referrerPolicy="no-referrer"/>}<div className="catalog-search-body"><b>{item.name}</b><span className="muted">{catalogResultMeta(item)}</span></div></button>):<div className="typeahead-empty muted">{panelHasSearch?'No matches — try a different search or filter':'Type or filter to search the catalog'}</div>}</div>{panelHasSearch&&<button type="button" className="btn small secondary" style={{marginTop:8}} onClick={()=>setAddExercisePanel({...addExercisePanel,query:'',filters:emptyAddPanelFilters()})}>Clear search</button>}{!addExercisePanel.replaceTarget&&<button type="button" className="btn small secondary" style={{marginTop:8}} onClick={()=>setAddExercisePanel({...addExercisePanel,step:'custom'})}>+ Create custom exercise</button>}</>}
    {addExercisePanel.step==='custom'&&<><div className="catalog-edit-grid"><input value={addExercisePanel.custom.name} onChange={e=>setAddExercisePanel({...addExercisePanel,custom:{...addExercisePanel.custom,name:e.target.value}})} placeholder="Exercise name"/><input value={addExercisePanel.custom.muscle_group} onChange={e=>setAddExercisePanel({...addExercisePanel,custom:{...addExercisePanel.custom,muscle_group:e.target.value}})} placeholder="Muscle group"/></div><div className="actions" style={{marginTop:8}}><button type="button" className="btn small green" onClick={createCustomInPanel}>Save & continue</button><button type="button" className="btn small secondary" onClick={()=>setAddExercisePanel({...addExercisePanel,step:'search'})}>Back</button></div></>}
    {addExercisePanel.step==='configure'&&addExercisePanel.picked&&<><div className="panel-picked"><b>{addExercisePanel.picked.name}</b><span className="muted">{catalogResultMeta(addExercisePanel.picked)}</span></div>{getExerciseThumb(addExercisePanel.picked)&&<img className="panel-picked-img" src={getExerciseThumb(addExercisePanel.picked)||''} alt={addExercisePanel.picked.name} referrerPolicy="no-referrer"/>}{hasExerciseGuide(addExercisePanel.picked)&&<button type="button" className="btn small secondary" style={{marginTop:8}} onClick={()=>setExerciseGuide(getExerciseGuidePayload(addExercisePanel.picked,addExercisePanel.picked.name))}>{getExerciseGuidePayload(addExercisePanel.picked,addExercisePanel.picked.name)?.hasVideo?'Watch form':'Preview form guide'}</button>}{instructionsForDisplay(addExercisePanel.picked)&&<div className="panel-instructions">{instructionsForDisplay(addExercisePanel.picked)}</div>}<label>Exercise type</label><div className="tabs"><button type="button" className={addExercisePanel.config.mode==='normal'?'active':''} onClick={()=>{setPendingSupersetGroup({...pendingSupersetGroup,[addExercisePanel.section]:null});setAddExercisePanel({...addExercisePanel,config:{...addExercisePanel.config,mode:'normal',supersetGroupId:null}});}}>Normal</button><button type="button" className={addExercisePanel.config.mode==='superset'?'active':''} onClick={()=>setAddExercisePanel({...addExercisePanel,config:{...addExercisePanel.config,mode:'superset',supersetGroupId:addExercisePanel.config.supersetGroupId||pendingSupersetGroup[addExercisePanel.section]||'__new__'}})}>Superset</button></div>
    {addExercisePanel.config.mode==='superset'&&<><label>Superset group</label><select value={addExercisePanel.config.supersetGroupId||'__new__'} onChange={e=>setAddExercisePanel({...addExercisePanel,config:{...addExercisePanel.config,supersetGroupId:e.target.value}})}><option value="__new__">Create new superset</option>{panelSupersetGroups.map((g:any)=><option key={g.id} value={g.id}>{g.label} ({g.count}/3)</option>)}</select></>}
    <div className="row"><div><label>Sets</label><input type="number" min="1" max="10" value={addExercisePanel.config.setCount} onChange={e=>setAddExercisePanel({...addExercisePanel,config:{...addExercisePanel.config,setCount:Number(e.target.value)}})}/></div><div><label>Target reps</label><input value={addExercisePanel.config.targetReps} onChange={e=>setAddExercisePanel({...addExercisePanel,config:{...addExercisePanel.config,targetReps:e.target.value}})} placeholder="8-12"/></div></div><label>Starting weight (optional)</label><input value={addExercisePanel.config.targetWeight} onChange={e=>setAddExercisePanel({...addExercisePanel,config:{...addExercisePanel.config,targetWeight:e.target.value}})} placeholder="lb"/>
    <div className="actions" style={{marginTop:12}}>{(()=>{const remainingWeeks=workout&&!isPersonalCalendarWorkout(workout.id)?remainingSameDayWorkouts(workout).length:1; return remainingWeeks>1&&!addExercisePanel.replaceTarget?<>
      <button type="button" className="btn green" onClick={()=>void confirmAddExercise('future')}>Add to all remaining weeks ({remainingWeeks})</button>
      <button type="button" className="btn secondary" onClick={()=>void confirmAddExercise('current')}>This week only</button>
    </>:<button type="button" className="btn green" onClick={()=>void confirmAddExercise('current')}>Add Exercise</button>;})()}<button type="button" className="btn secondary" onClick={()=>setAddExercisePanel({...addExercisePanel,step:'search',picked:null})}>Back</button></div></>}
  </div></div>}
  {exerciseSwapPrompt&&<div className="panel-overlay exercise-swap-overlay" onClick={()=>setExerciseSwapPrompt(null)}><div className="exercise-swap-sheet card" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="exercise-swap-title"><h2 id="exercise-swap-title">Replace exercise</h2><p className="muted">Switch <b>{exerciseSwapPrompt.fromName}</b> to <b>{exerciseSwapPrompt.toName}</b>. Logged history stays as it was.</p><p className="muted">{isSharedTemplateEditor()?'This updates the group template for the weeks you pick.':'Your private plan only — this does not change a group template.'}</p><div className="exercise-swap-actions"><button type="button" className="btn green" onClick={async()=>{const p=exerciseSwapPrompt; setExerciseSwapPrompt(null); await replaceExerciseWithCatalog(p.ex,p.catalogItem,'current');}}>This week only</button><button type="button" className="btn secondary" onClick={async()=>{const p=exerciseSwapPrompt; setExerciseSwapPrompt(null); await replaceExerciseWithCatalog(p.ex,p.catalogItem,'future');}}>All remaining weeks ({exerciseSwapPrompt.remaining})</button><button type="button" className="btn small secondary" onClick={()=>setExerciseSwapPrompt(null)}>Cancel</button></div></div></div>}
  {exerciseHistoryModal&&<ExerciseSessionHistoryModal exerciseName={exerciseHistoryModal.exerciseName} dayLabel={exerciseHistoryModal.dayLabel} currentEquipment={exerciseHistoryModal.currentEquipment} sessions={exerciseHistoryModal.sessions} onClose={()=>setExerciseHistoryModal(null)} onViewProgress={exerciseHistoryModal.progress?()=>{const request=exerciseHistoryModal.progress; setExerciseHistoryModal(null); goNav('Progress',{progressSub:'strength',keepExercise:true}); setProgressExercise(request);}:undefined}/>}
  {exerciseGuide&&<div className="panel-overlay" onClick={()=>setExerciseGuide(null)}><div className="exercise-guide-panel card" onClick={e=>e.stopPropagation()}><div className="topline" style={{justifyContent:'space-between'}}><h2>{exerciseGuide.title}</h2><button type="button" className="btn small secondary" onClick={()=>setExerciseGuide(null)}>Close</button></div>{exerciseGuide.embedUrl&&<div className="guide-embed-wrap"><iframe className="guide-embed" src={exerciseGuide.embedUrl} title={`${exerciseGuide.title} demo`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen/></div>}{!exerciseGuide.embedUrl&&exerciseGuide.videoUrl&&<video className="guide-video" src={exerciseGuide.videoUrl} controls playsInline/>}{exerciseGuide.images?.length>0&&<div className="guide-images">{exerciseGuide.images.map((src:string)=><img key={src} className="guide-image" src={src} alt={exerciseGuide.title} loading="eager" referrerPolicy="no-referrer"/>)}</div>}{exerciseGuide.images?.length>0&&<p className="muted guide-caption">Form photos from the exercise library{exerciseGuide.images.length>1?' (multiple angles)':''}.</p>}{exerciseGuide.instructions&&<><h3 className="guide-section-title">How to perform</h3><div className="panel-instructions guide-instructions">{exerciseGuide.instructions}</div></>}</div></div>}
 {bugOpen&&<div className="panel-overlay" onClick={()=>{if(!bugSending)setBugOpen(false);}}><div className="bug-report-panel card" onClick={e=>e.stopPropagation()}><div className="topline" style={{justifyContent:'space-between'}}><h2>Report a bug</h2><button type="button" className="btn small secondary" onClick={()=>setBugOpen(false)} disabled={bugSending}>Close</button></div><p className="muted">Tell us what broke — screen, steps, and what you expected. BuildIQ Health keeps this tied to your account so we can investigate.</p>{bugSentId?<p className="program-ai-summary">Thanks — report saved{bugSentId!=='ok'?` (${String(bugSentId).slice(0,8)}…)`:''}. You can send another anytime.</p>:<><label>Short title (optional)</label><input value={bugTitle} onChange={e=>setBugTitle(e.target.value)} placeholder="e.g. Generate with AI failed on Program Setup"/><label>What happened?</label><textarea className="ai-prompt-input ai-prompt-input-lg" rows={6} value={bugDescription} onChange={e=>setBugDescription(e.target.value)} placeholder="Steps, error message, and what you expected…"/><p className="muted">Context included: {appNav}{trainingSubNav?` / ${trainingSubNav}`:''}</p><button type="button" className="btn green full" style={{marginTop:10}} onClick={submitBugReport} disabled={bugSending}>{bugSending?'Sending…':'Send bug report'}</button></>}</div></div>}
 {(bugFabVisible||bugOpen)&&<button type="button" className="bug-fab-mini" onClick={()=>{setBugOpen(true);setBugSentId('');}} aria-label="Report an issue">?</button>}
 {prCelebration&&<div className="pr-celebration-toast" role="status" aria-live="polite"><div className="pr-celebration-card"><span className="pr-celebration-icon" aria-hidden="true">🏆</span><div className="pr-celebration-body"><b>{prCelebration.message}</b>{prCelebration.subtext&&<span className="muted pr-celebration-detail">{prCelebration.subtext}</span>}</div><button type="button" className="btn small secondary pr-celebration-dismiss" onClick={()=>setPrCelebration(null)} aria-label="Dismiss">×</button></div></div>}
 </main></div></>
}
