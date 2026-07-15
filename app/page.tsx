
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, friendlyAuthError, getSupabaseConfigError } from '../lib/supabaseClient';
import { FOCUS_MUSCLES, focusVolumeSummary } from '../lib/training/focusMuscles';
import { applyFocusToWorkoutTemplate, estimateWeeklyFocusSets } from '../lib/training/programGenerator';
import { recommendNextTarget, buildLastPerformance } from '../lib/training/progression';
import { EXERCISE_TYPES, exerciseTypeOf, inferExerciseType, assignmentTypeLabel, isCardioType, isStrengthLike } from '../lib/training/exerciseTypes';
import { logFieldsForType, formatLogSummary } from '../lib/training/logFields';
import { buildCatalogFilterOptions, builtinCatalogItems, catalogResultMeta, countCatalogMatches, hasCatalogSearchInput, searchCatalog } from '../lib/training/catalogSearch';
import { getExerciseGuidePayload, getExerciseThumb, hasExerciseGuide } from '../lib/training/exerciseMedia';
import { matchExerciseToCatalog } from '../lib/training/aiProgramPlan';
import { EQUIPMENT_OPTIONS, hasEquipmentFilter, normalizeEquipmentList, equipmentFilterLabel } from '../lib/training/equipmentFilter';
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
} from '../lib/training/programCalendar';
import DateInput from './components/DateInput';
import ProgressInsights from './components/ProgressInsights';
import WorkoutSetLogger from './components/WorkoutSetLogger';
import CoachTeamDashboard from './components/CoachTeamDashboard';
import CoachRoster from './components/CoachRoster';
import AthleteCoachDashboard from './components/AthleteCoachDashboard';
import TeamAthleteView from './components/TeamAthleteView';
import {
  buildCoachSnapshot,
  canAccessCoachPlatform,
  canEditProgramTemplate,
  canLogWorkout,
  findTodayWorkout,
  pickProgramForMember,
  statusLabel,
  workoutStatusFromLogs,
} from '../lib/training/teamCoach';

const NAV=['Dashboard','Training','Team','Nutrition','Progress','AI Coach','Settings'];
const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const SECTIONS=[{id:'warmup',label:'Warm Up / Prep'},{id:'strength',label:'Strength'},{id:'cooldown',label:'Cooldown / Stretch'}];
const SECTION_SORT_BASE:any={warmup:0,strength:100,cooldown:200};
const WORKOUT_TEMPLATES:any={
 'Lower Body':{
  warmup:[['Assault Bike or Walk','Cardio',1,'3 min','',''],['World\'s Greatest Stretch','Full Body',1,'5 each','',''],['Glute Bridge','Glutes',2,'12','5','']],
  strength:[['Romanian Deadlift','Hamstrings',4,'6-10','7-8','185'],['Back Squat','Quads',4,'5-8','7-8','185'],{superset:[['Seated Leg Curl','Hamstrings',3,'10-15','8','90'],['Leg Extension','Quads',3,'10-15','8','80']]},{superset:[['Hip Thrust','Glutes',3,'8-12','8','185'],['Walking Lunge','Quads',3,'10-12','8','60']]}],
  cooldown:[['Standing Hamstring Stretch','Hamstrings',1,'30 sec each','',''],['Pigeon Pose','Glutes',1,'45 sec each','',''],['Foam Roll Quads','Quads',1,'60 sec','','']]
 },
 'Upper Body':{
  warmup:[['Assault Bike or Walk','Cardio',1,'3 min','',''],['Band Pull-Aparts','Upper Back',2,'15','5',''],['Scap Push-ups','Chest',1,'10','5','']],
  strength:[['Bench Press','Chest',4,'6-10','7-8','155'],{superset:[['Lat Pulldown','Lats',3,'8-12','8','120'],['Face Pull','Rear Delts',3,'12-15','7','30']]},{superset:[['Incline DB Press','Upper Chest',3,'8-12','8','55'],['Cable Row','Mid Back',3,'8-12','8','120']]}],
  cooldown:[['Doorway Pec Stretch','Chest',1,'30 sec each','',''],['Sleeper Stretch','Shoulders',1,'30 sec each','',''],['Lat Stretch','Lats',1,'30 sec each','','']]
 },
 'Full Body':{
  warmup:[['Assault Bike or Walk','Cardio',1,'3 min','',''],['Bodyweight Squat','Quads',2,'10','5',''],['Inchworm','Full Body',1,'5','','']],
  strength:[['Romanian Deadlift','Hamstrings',3,'6-10','7-8','185'],['Bench Press','Chest',3,'6-10','7-8','155'],['Lat Pulldown','Lats',3,'8-12','8','120'],['Goblet Squat','Quads',3,'10-12','8','60']],
  cooldown:[['Child\'s Pose','Full Body',1,'60 sec','',''],['Seated Spinal Twist','Full Body',1,'30 sec each','',''],['Standing Quad Stretch','Quads',1,'30 sec each','','']]
 },
 'Cardio':{
  warmup:[['Assault Bike or Walk','Cardio',1,'3 min','',''],['World\'s Greatest Stretch','Full Body',1,'5 each','','']],
  strength:[['Rowing Machine','Cardio',1,'15 min','6-7',''],['Assault Bike','Cardio',6,'1 min','8',''],['Walking Lunges','Quads',2,'20','6','']],
  cooldown:[['Standing Calf Stretch','Calves',1,'30 sec each','',''],['Standing Hamstring Stretch','Hamstrings',1,'30 sec each','','']]
 },
 'Mobility':{
  warmup:[['Assault Bike or Walk','Cardio',1,'3 min','',''],['Cat Cow','Full Body',1,'10','','']],
  strength:[['World\'s Greatest Stretch','Full Body',1,'5 each','',''],['Pigeon Pose','Glutes',1,'45 sec each','',''],['Doorway Pec Stretch','Chest',1,'30 sec each','',''],['Seated Spinal Twist','Full Body',1,'30 sec each','',''],['Foam Roll Quads','Quads',1,'60 sec','',''],['Band Pull-Aparts','Upper Back',2,'15','',''],['Child\'s Pose','Full Body',1,'60 sec','','']],
  cooldown:[['Box Breathing','Full Body',1,'2 min','',''],['Standing Calf Stretch','Calves',1,'30 sec each','','']]
 }
};
const DAY_TYPE_OPTIONS=['Lower Body','Upper Body','Full Body','Cardio','Mobility'];
const sectionDefaultSets=(section:string)=>section==='warmup'||section==='cooldown'?1:3;
const workoutExerciseCount=(w:any)=>SECTIONS.reduce((n:number,sec:any)=>n+sectionExercises(w,sec.id).length,0);
const addPanelSectionLabel=(section:string)=>SECTIONS.find((s:any)=>s.id===section)?.label||section;
const exerciseSection=(ex:any)=>ex?.section||'strength';
const sectionExercises=(workout:any,section:string)=>(workout?.st_exercises||[]).filter((e:any)=>exerciseSection(e)===section).sort((a:any,b:any)=>{const d=(a.sort_order||0)-(b.sort_order||0);if(d)return d;return (a.superset_order||0)-(b.superset_order||0);});
const nextSortOrder=(workout:any,section:string)=>{const list=sectionExercises(workout,section);const base=SECTION_SORT_BASE[section]??100;return list.length?Math.max(...list.map((e:any)=>e.sort_order||0))+1:base;};
const buildPlannedSetRows=(item:any[],section:string)=>{const sets=Number(item[2]||1);const rows:any[]=[];for(let i=0;i<sets;i++)rows.push({sort_order:i,set_number:i+1,set_type:'working',target_weight:'',target_reps:'',target_rpe:''});return rows;};
const isSupersetTemplate=(item:any)=>item&&typeof item==='object'&&!Array.isArray(item)&&Array.isArray(item.superset);
const isExerciseTemplate=(item:any)=>Array.isArray(item);
const makeSupersetGroupId=()=>(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`ss-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
const nextSupersetLabel=(w:any,section:string)=>{const exs=sectionExercises(w,section).filter((e:any)=>e.superset_group_id);const nums=exs.map((e:any)=>{const m=String(e.superset_label||'').match(/Superset\s+([A-Z])/i);return m?m[1].charCodeAt(0)-64:0;});const n=nums.length?Math.max(...nums)+1:1;return `Superset ${String.fromCharCode(64+n)}`;};
const groupSectionBlocks=(exercises:any[])=>{const blocks:any[]=[];const groups=new Map<string,any>();(exercises||[]).forEach((ex:any)=>{const gid=ex.superset_group_id;if(!gid){blocks.push({type:'single',exercises:[ex],anchor:ex.sort_order||0});return;}if(!groups.has(gid))groups.set(gid,{type:'superset',groupId:gid,label:ex.superset_label||'Superset',exercises:[],anchor:ex.sort_order||0});const g=groups.get(gid);g.exercises.push(ex);g.anchor=Math.min(g.anchor,ex.sort_order||0);if(ex.superset_label)g.label=ex.superset_label;});groups.forEach((g)=>{g.exercises.sort((a:any,c:any)=>(a.superset_order||0)-(c.superset_order||0));blocks.push(g);});blocks.sort((a:any,b:any)=>(a.anchor||0)-(b.anchor||0));return blocks;};
async function insertTemplateSectionItems(sb:any,workoutId:string,section:string,list:any[],startSort:number,catMap:any){let sort=startSort;let groupNum=0;for(const item of list){if(isSupersetTemplate(item)){if(item.superset.length<2||item.superset.length>3)continue;groupNum++;const groupId=makeSupersetGroupId();const label=`Superset ${String.fromCharCode(64+groupNum)}`;let slot=0;for(const exItem of item.superset){slot++;const hit=catMap[String(exItem[0]).toLowerCase()];const exType=inferExerciseType(exItem[0],hit?.muscle_group||exItem[1],section,hit?.exercise_type);const{data:e,error}=await sb.from('st_exercises').insert({workout_id:workoutId,section,sort_order:sort,name:exItem[0],muscle_group:hit?.muscle_group||exItem[1],catalog_exercise_id:hit?.id||null,exercise_type:exType,superset_group_id:groupId,superset_label:label,superset_order:slot}).select().single();if(error)return{error};const rows=buildPlannedSetRows(exItem,section);if(rows.length)await sb.from('st_planned_sets').insert(rows.map(r=>({...r,exercise_id:e.id})));}sort++;}else if(isExerciseTemplate(item)){const hit=catMap[String(item[0]).toLowerCase()];const exType=inferExerciseType(item[0],hit?.muscle_group||item[1],section,hit?.exercise_type);const{data:e,error}=await sb.from('st_exercises').insert({workout_id:workoutId,section,sort_order:sort,name:item[0],muscle_group:hit?.muscle_group||item[1],catalog_exercise_id:hit?.id||null,exercise_type:exType,superset_group_id:null}).select().single();if(error)return{error};const rows=buildPlannedSetRows(item,section);if(rows.length)await sb.from('st_planned_sets').insert(rows.map(r=>({...r,exercise_id:e.id})));sort++;}}return{error:null};}
const logExerciseName=(row:any,joinEx?:any)=>String(row.snapshot_exercise_name||joinEx?.name||'').trim();
const logCatalogId=(row:any,joinEx?:any)=>row.snapshot_catalog_exercise_id||joinEx?.catalog_exercise_id||'';
const logSetType=(row:any,joinPs?:any)=>row.snapshot_set_type||joinPs?.set_type||'working';
const logSetNumber=(row:any,joinPs?:any)=>row.snapshot_set_number??joinPs?.set_number??1;
const exerciseHistoryKey=(catalogId:string,name:string)=>catalogId||String(name||'').toLowerCase().trim();
const exerciseHistoryAliases=(catalogId:string,name:string)=>{
  const aliases:string[]=[];
  const id=String(catalogId||'').trim();
  const nm=String(name||'').toLowerCase().trim();
  if(id)aliases.push(id);
  if(nm)aliases.push(nm);
  return aliases;
};
const logHistoryKeys=(row:any)=>{const joinEx=row.st_planned_sets?.st_exercises;const joinPs=row.st_planned_sets;const catalogId=logCatalogId(row,joinEx);const name=logExerciseName(row,joinEx);const exerciseKey=exerciseHistoryKey(catalogId,name);const setType=logSetType(row,joinPs);const setNumber=logSetNumber(row,joinPs);const setKey=`${exerciseKey}|${setType}|${setNumber}`;return {exerciseKey,setKey,catalogId,name,setType,setNumber};};
const logHasPerformance=(row:any)=>!!(
  row&&(String(row.actual_weight||'').trim()||String(row.actual_reps||'').trim()||String(row.actual_duration||'').trim()||String(row.actual_distance||'').trim()||String(row.log_notes||'').trim())
);
const snapshotForLog=(ex:any,set:any,workoutRef:any,catItem?:any)=>({snapshot_exercise_name:ex?.name||'',snapshot_catalog_exercise_id:ex?.catalog_exercise_id||null,snapshot_superset_group_id:ex?.superset_group_id||null,snapshot_muscle_group:ex?.muscle_group||'',snapshot_section:exerciseSection(ex),snapshot_exercise_type:exerciseTypeOf(ex,catItem),snapshot_set_type:set?.set_type||'working',snapshot_set_number:set?.set_number||1,snapshot_target_weight:set?.target_weight||'',snapshot_target_reps:set?.target_reps||'',snapshot_target_rpe:'',snapshot_day_label:workoutRef?.day_label||'',snapshot_workout_type:workoutRef?.workout_type||'',snapshot_week:workoutRef?.week??null,snapshot_day_order:workoutRef?.day_order??null});
const catalogByName=(items:any[])=>{const map:any={};(items||[]).filter((c:any)=>!c.is_archived).forEach((c:any)=>{map[String(c.name||'').toLowerCase()]=c;});return map;};
const today=todayYmd;
const makeInviteCode=()=>(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID().replace(/-/g,'').slice(0,8):Math.random().toString(36).slice(2,10)).toUpperCase();
const REMEMBER_EMAIL_KEY='builtiq_remembered_email';
const emptyProfileDraft=(source?:any)=>({display_name:source?.display_name||'',height_inches:source?.height_inches??'',weight_lbs:source?.weight_lbs??'',birth_year:source?.birth_year??'',sex:source?.sex||'',experience_level:source?.experience_level||'beginner',primary_goal:source?.primary_goal||'general_health',units_preference:source?.units_preference||'imperial',available_equipment:normalizeEquipmentList(source?.available_equipment)});
const toggleEquipmentList=(list:string[],id:string)=>{if(id==='full_gym')return list.includes('full_gym')?[]:['full_gym']; let next=list.filter((x)=>x!=='full_gym'); if(next.includes(id))next=next.filter((x)=>x!==id); else next=[...next,id]; return next;};
const profileNeedsSetup=(p:any)=>{if(!p)return true; if(p.profile_completed===true)return false; if(p.profile_completed===false)return true; return !String(p.display_name||'').trim();};
const emptyAddPanelConfig=()=>({mode:'normal' as 'normal'|'superset',supersetGroupId:null as string|null,setCount:3,targetReps:'8-12',targetWeight:''});
const emptyAddPanelCustom=()=>({name:'',category:'strength',muscle_group:'',equipment:'',movement_pattern:''});
const emptyAddPanelFilters=()=>({muscle:'',equipment:'',exerciseType:''});
const getSupersetGroupsForSection=(w:any,section:string)=>{const exs=sectionExercises(w,section);const groups:any[]=[];const seen=new Set();exs.forEach((ex:any)=>{if(!ex.superset_group_id||seen.has(ex.superset_group_id))return;seen.add(ex.superset_group_id);const members=exs.filter((e:any)=>e.superset_group_id===ex.superset_group_id).sort((a:any,b:any)=>(a.superset_order||0)-(b.superset_order||0));if(members.length>=1)groups.push({id:ex.superset_group_id,label:ex.superset_label||members.map((e:any)=>e.name).join(' + '),count:members.length,sortOrder:Math.min(...members.map((m:any)=>m.sort_order||0))});});return groups.sort((a:any,b:any)=>(a.sortOrder||0)-(b.sortOrder||0));};
export default function Page(){
 const [session,setSession]=useState<any>(null),[authReady,setAuthReady]=useState(false),[profileLoading,setProfileLoading]=useState(false);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState('');
 const [authMode,setAuthMode]=useState<'signin'|'signup'>('signin'),[rememberEmail,setRememberEmail]=useState(true);
 const [profile,setProfile]=useState<any>(null),[displayName,setDisplayName]=useState(''),[profileDraft,setProfileDraft]=useState<any>(emptyProfileDraft()),[profileSaving,setProfileSaving]=useState(false);
 const [appNav,setAppNav]=useState('Dashboard');
 const [teams,setTeams]=useState<any[]>([]),[selectedTeamId,setSelectedTeamId]=useState<string|null>(null),[members,setMembers]=useState<any[]>([]),[mode,setMode]=useState<'personal'|'team'>('personal');
 const [programs,setPrograms]=useState<any[]>([]),[program,setProgram]=useState<any>(null),[programName,setProgramName]=useState('Strength Program'),[weeks,setWeeks]=useState(6);
 const [week,setWeek]=useState(1),[days,setDays]=useState(['Mon','Tue','Fri']),[dayTypes,setDayTypes]=useState<any>({Mon:'Lower Body',Tue:'Upper Body',Fri:'Full Body'}),[activeWorkout,setActiveWorkout]=useState('');
 const [logDate,setLogDate]=useState(today()),[logs,setLogs]=useState<any>({}),[history,setHistory]=useState<any>({}),[applyScope,setApplyScope]=useState<'current'|'future'>('future');
 const [catalog,setCatalog]=useState<any[]>([]);
 const [catalogError,setCatalogError]=useState('');
 const [showCustomForm,setShowCustomForm]=useState<any>({warmup:false,strength:false,cooldown:false});
 const [customDraft,setCustomDraft]=useState<any>({name:'',category:'strength',muscle_group:'',equipment:'',movement_pattern:''});
 const [catalogEditId,setCatalogEditId]=useState<string|null>(null);
 const [catalogEditDraft,setCatalogEditDraft]=useState<any>({name:'',category:'',muscle_group:'',equipment:'',movement_pattern:''});
 const [progressLogs,setProgressLogs]=useState<any[]>([]);
 const [showProgramSetup,setShowProgramSetup]=useState(false);
 const [trainingSubNav,setTrainingSubNav]=useState<'personal'|'team'|'setup'>('personal');
 const [addExercisePanel,setAddExercisePanel]=useState<any>(null);
 const [exerciseNameSearch,setExerciseNameSearch]=useState<{exerciseId:string,query:string}|null>(null);
 const [exerciseGuide,setExerciseGuide]=useState<any>(null);
 const [pendingSupersetGroup,setPendingSupersetGroup]=useState<any>({warmup:null,strength:null,cooldown:null});
 const [focusMuscles,setFocusMuscles]=useState<string[]>([]);
 const [aiPrompt,setAiPrompt]=useState("I'm a baseball player trying to throw harder and hit harder. I train 3–4 days a week, want more rotational power and arm durability, and prefer dumbbells plus a bench when I am not in a full gym.");
 const [aiGenerating,setAiGenerating]=useState(false);
 const [aiSummary,setAiSummary]=useState('');
 const [aiCoachingNotes,setAiCoachingNotes]=useState('');
 const [aiGenError,setAiGenError]=useState('');
 const [bugOpen,setBugOpen]=useState(false);
 const [bugTitle,setBugTitle]=useState('');
 const [bugDescription,setBugDescription]=useState('');
 const [bugSending,setBugSending]=useState(false);
 const [bugSentId,setBugSentId]=useState('');
 const [setupStep,setSetupStep]=useState<'goals'|'schedule'|'review'>('goals');
 const [scheduleOptions,setScheduleOptions]=useState<any[]>([]);
 const [selectedScheduleId,setSelectedScheduleId]=useState('');
 const [scheduleCoachMessage,setScheduleCoachMessage]=useState('');
 const [scheduleRecommendedId,setScheduleRecommendedId]=useState('');
 const [wantsCardio,setWantsCardio]=useState<boolean|null>(null);
 const [wantsMobility,setWantsMobility]=useState<boolean|null>(null);
 const [includeCooldown,setIncludeCooldown]=useState(true);
 const [scheduleLoading,setScheduleLoading]=useState(false);
 const [scheduleManualOverride,setScheduleManualOverride]=useState(false);
 const [viewingMember,setViewingMember]=useState<any>(null);
 const [memberDashboard,setMemberDashboard]=useState<any>(null);
 const [memberDashProgram,setMemberDashProgram]=useState<any>(null);
 const [memberDashLogs,setMemberDashLogs]=useState<any>({});
 const [memberDashLastDate,setMemberDashLastDate]=useState('');
 const [memberStats,setMemberStats]=useState<any>({});
 const [memberAssignments,setMemberAssignments]=useState<any>({});
 const [assignDraft,setAssignDraft]=useState<any>({type:'team',programId:'',notes:''});
 const [coachSnapshot,setCoachSnapshot]=useState<{roster:any[];overview:any}|null>(null);
 const [coachTeamPrograms,setCoachTeamPrograms]=useState<any[]>([]);
 const [memberDashProgressLogs,setMemberDashProgressLogs]=useState<any[]>([]);
 const [logDistanceUnit,setLogDistanceUnit]=useState<'mi'|'km'>('mi');
 const refs=useRef<any[]>([]);
 const namePickRef=useRef(false);
 const logsRef=useRef<any>({});
 const syncingCalendarRef=useRef(false);

 useEffect(()=>{
  supabase.auth.getSession().then(({data})=>{setSession(data.session);setAuthReady(true);});
  const{data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
  return()=>data.subscription.unsubscribe();
 },[]);
 useEffect(()=>{
  if(typeof window==='undefined')return;
  const saved=localStorage.getItem(REMEMBER_EMAIL_KEY);
  if(saved){setEmail(saved);setRememberEmail(true);}
 },[]);
 useEffect(()=>{
  if(!session?.user){
   setProfile(null);setProfileLoading(false);setSelectedTeamId(null);setTeams([]);setMembers([]);setPrograms([]);setProgram(null);setMode('personal');
   return;
  }
  setProfileLoading(true);
  setSelectedTeamId(null);setTeams([]);setMembers([]);setMode('personal');
  boot().finally(()=>setProfileLoading(false));
 },[session?.user?.id]);
 useEffect(()=>{if(profile) loadPrograms()},[mode,selectedTeamId,teams,profile,viewingMember?.user_id]);
 useEffect(()=>{if(program&&session?.user) loadLogs(program,viewingMember?.user_id||session.user.id)},[program,logDate,viewingMember?.user_id,session?.user?.id]);
 useEffect(()=>{if(program&&session?.user) loadLiftHistory()},[program,logDate,viewingMember?.user_id,session?.user?.id]);
 useEffect(()=>{logsRef.current=logs;},[logs]);
 useEffect(()=>{
  if(!program||syncingCalendarRef.current)return;
  const start=resolveProgramStartDate(program);
  const total=program.weeks||weeks||6;
  const nextWeek=weekForDate(start,logDate,total);
  if(nextWeek!==week)setWeek(nextWeek);
 },[program?.id,program?.start_date,program?.created_at,program?.weeks,logDate]);
 useEffect(()=>{if(profile&&appNav==='Dashboard')loadProgressLogs();},[profile,appNav]);
 useEffect(()=>{if(appNav==='Training'&&!program&&trainingSubNav!=='setup')setShowProgramSetup(true);},[appNav,program,trainingSubNav]);
 useEffect(()=>{if(appNav==='Training'&&trainingSubNav!=='setup')setMode(trainingSubNav==='team'?'team':'personal');},[appNav,trainingSubNav]);
 useEffect(()=>{if(trainingSubNav==='personal'){setMemberDashboard(null);setViewingMember(null);}if(trainingSubNav==='setup'){setShowProgramSetup(true);setMemberDashboard(null);setViewingMember(null);}},[trainingSubNav]);
 useEffect(()=>{setViewingMember(null);setMemberDashboard(null);},[selectedTeamId]);
 useEffect(()=>{if(selectedTeamId&&teams.length){loadMembers();loadMemberAssignments();}},[selectedTeamId,teams.length]);
 useEffect(()=>{if(members.length&&selectedTeamId)loadMemberStats();},[members,selectedTeamId]);
 useEffect(()=>{if(memberDashboard)loadMemberDashboardData(memberDashboard);},[logDate,week,memberDashboard?.user_id,selectedTeamId]);

 const activeTeam=teams.find((t:any)=>t.id===selectedTeamId)||teams[0]||null;

 useEffect(()=>{if(selectedTeamId&&members.length&&activeTeam&&canAccessCoachPlatform(activeTeam.my_role,mode==='team'))loadCoachTeamSnapshot();else setCoachSnapshot(null);},[selectedTeamId,members.length,memberStats,memberAssignments,activeTeam?.my_role,activeTeam?.default_program_id,mode,logDate,week]);

 async function boot(){await loadProfile(); await loadTeams(); await loadCatalog();}
 async function loadCatalog(){if(!session?.user)return; const{data,error}=await supabase.from('st_exercise_catalog').select('*').order('name'); if(error){setCatalogError(error.message); return console.warn(error.message);} setCatalogError(''); setCatalog(data||[]);}
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
 async function persistEquipmentPreference(){
  if(!session?.user)return;
  const equipment=normalizeEquipmentList(profileDraft.available_equipment);
  const{error}=await supabase.from('st_profiles').update({available_equipment:equipment}).eq('user_id',session.user.id);
  if(error)return console.warn(error.message);
  setProfile((p:any)=>p?{...p,available_equipment:equipment}:p);
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
   profile_completed:markComplete,
  });
  setProfileSaving(false);
  if(error)return alert(error.message);
  await loadProfile();
 }
 async function createProfile(){await saveProfile(true);}
 async function signOut(){
  try{
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
   setAddExercisePanel(null);
   setSession(null);
   const{error}=await supabase.auth.signOut();
   if(error)console.warn(error.message);
  }catch(e:any){
   console.warn(e?.message||e);
   setSession(null);
  }
 }
 async function loadTeams(){if(!session?.user)return; const{data}=await supabase.from('st_team_members').select('*, st_teams(*)').eq('user_id',session.user.id).eq('status','active'); const ts=(data||[]).map((m:any)=>m.st_teams?{...m.st_teams,my_role:m.role,training_source:m.training_source||'team',membership_id:m.id}:null).filter(Boolean); setTeams(ts); setSelectedTeamId((prev)=>prev&&ts.some((t:any)=>t.id===prev)?prev:ts[0]?.id||null);}
 async function createTeam(){const name=prompt('Team name','Trowbridge Team'); if(!name)return; const code=makeInviteCode(); const{data:t,error}=await supabase.from('st_teams').insert({name,invite_code:code,owner_user_id:session.user.id}).select().single(); if(error)return alert(error.message); const{error:me}=await supabase.from('st_team_members').insert({team_id:t.id,user_id:session.user.id,display_name:displayName,role:'owner'}); if(me)return alert(me.message); await loadTeams(); setMode('team'); setSelectedTeamId(t.id);}
 async function joinTeam(){const code=prompt('Invite code'); if(!code)return; const{data:t,error}=await supabase.rpc('st_join_team_by_invite',{p_invite_code:code,p_display_name:displayName}); if(error||!t)return alert(error?.message||'Team not found'); await loadTeams(); setMode('team'); setSelectedTeamId(t.id);}
 async function loadMembers(){if(!activeTeam)return; const{data}=await supabase.from('st_team_members').select('*').eq('team_id',activeTeam.id).eq('status','active').order('created_at'); setMembers(data||[])}
 async function loadMemberStats(){
  if(!activeTeam||!members.length){setMemberStats({});return;}
  const{monday:weekStartStr,sunday:weekEndStr}=currentCalendarWeekBounds();
  const ids=members.map((m:any)=>m.user_id);
  const{data}=await supabase.from('st_set_logs').select('user_id,log_date').in('user_id',ids).eq('completed',true).gte('log_date',weekStartStr).lte('log_date',weekEndStr);
  const stats:any={};
  (data||[]).forEach((r:any)=>{if(!stats[r.user_id])stats[r.user_id]={sets:0,days:new Set()}; stats[r.user_id].sets++; stats[r.user_id].days.add(r.log_date);});
  setMemberStats(Object.fromEntries(Object.entries(stats).map(([k,v]:any)=>[k,{sets:v.sets,days:v.days.size}])));
 }
 async function loadCoachTeamSnapshot(){
  if(!activeTeam||!members.length||!canCoachView()){setCoachSnapshot(null);return;}
  const logDateStr=today();
  const{monday:weekStartStr,sunday:weekEndStr}=currentCalendarWeekBounds();
  const ids=members.map((m:any)=>m.user_id);
  const{data:teamProgs}=await supabase.from('st_programs').select('*, st_workouts(*, st_exercises(*, st_planned_sets(*)))').eq('visibility','team').eq('team_id',activeTeam.id).order('created_at',{ascending:false});
  const teamPrograms=teamProgs||[];
  setCoachTeamPrograms(teamPrograms);
  const personalIds=members.filter((m:any)=>(m.training_source||'team')==='personal').map((m:any)=>m.user_id);
  const personalByUser:any={};
  if(personalIds.length){
   const{data:pers}=await supabase.from('st_programs').select('*, st_workouts(*, st_exercises(*, st_planned_sets(*)))').eq('visibility','personal').in('owner_user_id',personalIds).order('created_at',{ascending:false});
   (pers||[]).forEach((p:any)=>{if(!personalByUser[p.owner_user_id])personalByUser[p.owner_user_id]=[]; personalByUser[p.owner_user_id].push(p);});
  }
  const{data:weekLogs}=await supabase.from('st_set_logs').select('*').in('user_id',ids).eq('completed',true).gte('log_date',weekStartStr).lte('log_date',weekEndStr);
  const weekLogsByUser:any={};
  (weekLogs||[]).forEach((r:any)=>{if(!weekLogsByUser[r.user_id])weekLogsByUser[r.user_id]=[]; weekLogsByUser[r.user_id].push(r);});
  const{data:todayLogs}=await supabase.from('st_set_logs').select('*').in('user_id',ids).eq('log_date',logDateStr);
  const todayLogsByUser:any={};
  (todayLogs||[]).forEach((r:any)=>{if(!todayLogsByUser[r.user_id])todayLogsByUser[r.user_id]=[]; todayLogsByUser[r.user_id].push(r);});
  const{data:allCompleted}=await supabase.from('st_set_logs').select('user_id,log_date').in('user_id',ids).eq('completed',true).order('log_date',{ascending:false});
  const lastByUser:any={};
  (allCompleted||[]).forEach((r:any)=>{if(!lastByUser[r.user_id])lastByUser[r.user_id]=r.log_date;});
  const defaultProgram=teamPrograms.find((p:any)=>p.id===activeTeam.default_program_id)||teamPrograms[0]||null;
  const weekNum=defaultProgram?weekForDate(resolveProgramStartDate(defaultProgram),logDateStr,defaultProgram.weeks||weeks||6):week;
  setCoachSnapshot(buildCoachSnapshot({members,memberStats,memberAssignments,teamPrograms,personalProgramsByUser:personalByUser,todayLogsByUser,weekLogsByUser,lastWorkoutDateByUser:lastByUser,defaultProgramId:activeTeam.default_program_id,teamDefaultName:defaultProgram?.name,sessionUserId:session?.user?.id,logDate:logDateStr,week:weekNum}));
 }
 async function loadMemberAssignments(){
  if(!activeTeam){setMemberAssignments({});return;}
  const{data}=await supabase.from('st_program_assignments').select('*, st_programs(name)').eq('team_id',activeTeam.id).eq('is_active',true);
  const by:any={};
  (data||[]).forEach((a:any)=>{by[a.user_id]=a;});
  setMemberAssignments(by);
 }
 async function assignMemberProgram(member:any,assignmentType:string,programId?:string|null,notes?:string){
  if(!activeTeam||!canCoachView())return alert('Only owners and editors can assign programs.');
  const{error}=await supabase.rpc('st_assign_member_program',{p_team_id:activeTeam.id,p_member_user_id:member.user_id,p_assignment_type:assignmentType,p_program_id:programId||null,p_notes:notes||null});
  if(error)return alert(error.message);
  await loadMembers(); await loadMemberAssignments();
  if(memberDashboard?.user_id===member.user_id)await loadMemberDashboardData(member);
  if(viewingMember?.user_id===member.user_id){await openMemberView(member);}
  await loadCoachTeamSnapshot();
 }
 function canCoachView(){return canAccessCoachPlatform(activeTeam?.my_role,mode==='team');}
 function logUserId(){return viewingMember?.user_id||session?.user?.id;}
 function canLog(){if(!session?.user)return false; return canLogWorkout({sessionUserId:session.user.id,targetUserId:logUserId()||'',teamRole:activeTeam?.my_role,inTeamMode:mode==='team'});}
 function canEdit(){return canEditProgramTemplate({personalMode:mode==='personal',teamRole:activeTeam?.my_role,viewingOtherMember:!!(viewingMember&&viewingMember.user_id!==session?.user?.id)});}
 function isOwner(){return mode==='team'&&activeTeam?.my_role==='owner'}
 function pickProgram(list:any[],defaultId?:string|null){if(!list.length)return null; if(defaultId)return list.find((p:any)=>p.id===defaultId)||list[0]; return list[0];}
 async function loadPrograms(){
  if(!session?.user)return;
  if(viewingMember&&viewingMember.user_id!==session.user.id)return;
  let q=supabase.from('st_programs').select('*, st_workouts(*, st_exercises(*, st_planned_sets(*)))').order('created_at',{ascending:false});
  const usePersonal=mode==='personal'||(mode==='team'&&activeTeam?.training_source==='personal');
  q=usePersonal?q.eq('visibility','personal').eq('owner_user_id',session.user.id):q.eq('visibility','team').eq('team_id',activeTeam?.id||'00000000-0000-0000-0000-000000000000');
  const{data,error}=await q; if(error)return alert(error.message);
  const list=data||[];
  setPrograms(list);
  const picked=pickProgram(list,!usePersonal?activeTeam?.default_program_id:null);
  setProgram(picked);
  if(picked){
    const start=resolveProgramStartDate(picked);
    const alignedWeek=weekForDate(start,logDate,picked.weeks||weeks||6);
    setWeek(alignedWeek);
    const dayLabel=dayLabelFromYmd(logDate);
    const match=(picked.st_workouts||[]).find((w:any)=>w.week===alignedWeek&&w.day_label===dayLabel)
      ||(picked.st_workouts||[]).filter((w:any)=>w.week===alignedWeek).sort((a:any,b:any)=>a.day_order-b.day_order)[0]
      ||picked.st_workouts?.sort((a:any,b:any)=>a.week-b.week||a.day_order-b.day_order)?.[0];
    if(match)setActiveWorkout(match.id);
  } else {
    setActiveWorkout('');
  }
 }
 async function openMemberDashboard(member:any){
  if(!member)return;
  if(member.user_id===session.user.id){setTrainingSubNav('personal');setMemberDashboard(null);setViewingMember(null);return;}
  if(!canCoachView())return alert('Only owners and editors can view member dashboards.');
  setMemberDashboard(member);
  setViewingMember(null);
  await loadMemberAssignments();
  await loadMemberDashboardData(member);
 }
 function openMemberDashboardByUserId(userId:string){const member=members.find((m:any)=>m.user_id===userId); if(member)openMemberDashboard(member);}
 async function loadMemberDashboardData(member:any){
  const usePersonal=(member.training_source||'team')==='personal';
  let q=supabase.from('st_programs').select('*, st_workouts(*, st_exercises(*, st_planned_sets(*)))').order('created_at',{ascending:false});
  q=usePersonal?q.eq('visibility','personal').eq('owner_user_id',member.user_id):q.eq('visibility','team').eq('team_id',activeTeam.id);
  const{data,error}=await q; if(error)return console.warn(error.message);
  const list=data||[];
  const picked=pickProgramForMember(list,member,memberAssignments,!usePersonal?activeTeam?.default_program_id:null);
  setMemberDashProgram(picked);
  const assignment=memberAssignments[member.user_id];
  if(assignment)setAssignDraft({type:assignment.assignment_type||'team',programId:assignment.program_id||'',notes:assignment.notes||''});
  else setAssignDraft({type:(member.training_source||'team')==='personal'?'personal':'team',programId:'',notes:''});
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const todayLabel=dayNames[new Date().getDay()];
  const todayW=(picked?.st_workouts||[]).find((w:any)=>w.week===week&&w.day_label===todayLabel)||(picked?.st_workouts||[]).find((w:any)=>w.week===1&&w.day_label===todayLabel);
  if(!todayW){setMemberDashLogs({});return;}
  const ids:any[]=[];
  (todayW.st_exercises||[]).forEach((e:any)=>(e.st_planned_sets||[]).forEach((s:any)=>{if(!s.is_deleted)ids.push(s.id);}));
  if(!ids.length){setMemberDashLogs({});return;}
  const{data:logs}=await supabase.from('st_set_logs').select('*').in('planned_set_id',ids).eq('user_id',member.user_id).eq('log_date',logDate);
  const by:any={};(logs||[]).forEach((l:any)=>by[l.planned_set_id]=l);
  setMemberDashLogs(by);
  const{data:lastRow}=await supabase.from('st_set_logs').select('log_date').eq('user_id',member.user_id).eq('completed',true).order('log_date',{ascending:false}).limit(1).maybeSingle();
  setMemberDashLastDate(lastRow?.log_date||'');
  const{data:progressRows}=await supabase.from('st_set_logs').select('*, st_planned_sets(set_type,set_number,st_exercises(name,muscle_group,section,catalog_exercise_id))').eq('user_id',member.user_id).eq('completed',true).order('log_date',{ascending:false}).limit(500);
  setMemberDashProgressLogs(progressRows||[]);
 }
 async function openMemberView(member:any){
  if(!member)return;
  if(member.user_id===session.user.id){await closeMemberView();setAppNav('Training');return;}
  if(!canCoachView())return alert('Only owners and editors can view member workouts.');
  setMemberDashboard(null);
  setViewingMember(member);
  await loadMemberAssignments();
  const usePersonal=(member.training_source||'team')==='personal';
  let q=supabase.from('st_programs').select('*, st_workouts(*, st_exercises(*, st_planned_sets(*)))').order('created_at',{ascending:false});
  q=usePersonal?q.eq('visibility','personal').eq('owner_user_id',member.user_id):q.eq('visibility','team').eq('team_id',activeTeam.id);
  const{data,error}=await q; if(error)return alert(error.message);
  const list=data||[];
  const picked=pickProgramForMember(list,member,memberAssignments,!usePersonal?activeTeam?.default_program_id:null);
  setPrograms(list);
  setProgram(picked);
  const first=picked?.st_workouts?.sort((a:any,b:any)=>a.week-b.week||a.day_order-b.day_order)?.[0];
  if(first)setActiveWorkout(first.id);
 }
 async function closeMemberView(){setViewingMember(null); setMemberDashboard(null); await loadPrograms();}
 async function setMyTrainingSource(source:'team'|'personal'){
  if(!activeTeam)return;
  const{error}=await supabase.rpc('st_set_my_training_source',{p_team_id:activeTeam.id,p_training_source:source});
  if(error)return alert(error.message);
  await loadTeams();
  setViewingMember(null);
 }
 async function setMemberTrainingSource(member:any,source:string){
  if(!activeTeam||!canCoachView())return;
  const{error}=await supabase.rpc('st_set_member_training_source',{p_team_id:activeTeam.id,p_member_user_id:member.user_id,p_training_source:source});
  if(error)return alert(error.message);
  await loadMembers();
  await loadMemberStats();
  if(viewingMember?.user_id===member.user_id)setViewingMember({...member,training_source:source});
  await loadCoachTeamSnapshot();
 }
 async function setTeamDefaultProgram(programId:string){
  if(!activeTeam||!canEdit())return;
  const{error}=await supabase.from('st_teams').update({default_program_id:programId||null}).eq('id',activeTeam.id);
  if(error)return alert(error.message);
  await loadTeams();
  await loadPrograms();
 }
 async function loadLogs(p:any,userId?:string){const uid=userId||session?.user?.id; if(!uid){setLogs({});logsRef.current={};return;} const ids:any[]=[];(p.st_workouts||[]).forEach((w:any)=>(w.st_exercises||[]).forEach((e:any)=>(e.st_planned_sets||[]).forEach((s:any)=>ids.push(s.id)))); if(!ids.length){setLogs({});logsRef.current={};return} const{data}=await supabase.from('st_set_logs').select('*').in('planned_set_id',ids).eq('user_id',uid).eq('log_date',logDate); const by:any={};(data||[]).forEach((l:any)=>by[l.planned_set_id]=l);logsRef.current=by;setLogs(by);}

 async function loadLiftHistory(){
  const uid=logUserId();
  if(!uid) return;

  const { data, error } = await supabase
    .from('st_set_logs')
    .select('*, st_planned_sets(set_type,set_number,st_exercises(name,muscle_group,section,catalog_exercise_id))')
    .eq('user_id', uid)
    .lt('log_date', logDate)
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

    const aliases=exerciseHistoryAliases(catalogId,name);
    aliases.forEach((ek)=>{
      if(!by[ek]) by[ek] = [];
      by[ek].push(row);
      const setKey=`${ek}|${setType}|${setNumber}`;
      if(!by[setKey]) by[setKey] = row;
    });
  });

  setHistory(by);
 }

 async function loadProgressLogs(){
  if(!session?.user) return;
  const { data, error } = await supabase
    .from('st_set_logs')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('completed', true)
    .order('log_date', { ascending:false })
    .order('updated_at', { ascending:false })
    .limit(500);
  if(error) return console.warn(error.message);
  setProgressLogs(data||[]);
 }

 function previousFor(ex:any, set:any){
  const aliases=exerciseHistoryAliases(ex.catalog_exercise_id||'',ex.name||'');
  const setType=set?.set_type||'working';
  const setNumber=set?.set_number??1;
  for(const ek of aliases){
    const hit=history[`${ek}|${setType}|${setNumber}`];
    if(hit&&logHasPerformance(hit)) return hit;
  }
  // Fallback: same exercise + set number with any type (e.g. working↔backoff renames)
  for(const ek of aliases){
    const rows=history[ek]||[];
    const match=rows.find((r:any)=>{
      const joinPs=r.st_planned_sets;
      return Number(logSetNumber(r,joinPs))===Number(setNumber)&&logHasPerformance(r);
    });
    if(match) return match;
  }
  // Last resort: most recent set for this exercise
  for(const ek of aliases){
    const rows=history[ek]||[];
    const match=rows.find((r:any)=>logHasPerformance(r));
    if(match) return match;
  }
  return null;
 }

 function exerciseLastSummary(ex:any){
  const catItem=catalog.find((c:any)=>c.id===ex.catalog_exercise_id);
  const exType=exerciseTypeOf(ex,catItem);
  const aliases=exerciseHistoryAliases(ex.catalog_exercise_id||'',ex.name||'');
  const rows = aliases.flatMap((ek)=>history[ek]||[]);
  if(!rows.length) return '';
  const latestDate = rows[0].log_date;
  const sameDay = rows.filter((r:any)=>r.log_date === latestDate).slice(0,4);
  return sameDay.map((r:any)=>formatLogSummary(r,exType)).join(' · ');
 }

 async function fetchScheduleSuggestions(cardioPref?:boolean|null,mobilityPref?:boolean|null){if(!session?.access_token)return alert('Sign in to plan your schedule.'); const prompt=aiPrompt.trim(); if(prompt.length<8)return alert('Describe your goals in a few words (e.g. baseball throw/hit power).'); const cardio=cardioPref===undefined?wantsCardio:cardioPref; const mobility=mobilityPref===undefined?wantsMobility:mobilityPref; await persistEquipmentPreference(); const equipment=normalizeEquipmentList(profileDraft.available_equipment); setScheduleLoading(true); try{const res=await fetch('/api/programs/suggest-schedule',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({goalsPrompt:prompt,includeCardio:cardio,includeMobility:mobility,availableEquipment:equipment})}); const data=await res.json().catch(()=>({})); if(!res.ok)throw new Error(data?.error||`Schedule suggestion failed (${res.status})`); setScheduleCoachMessage(data.coach_message||''); setScheduleOptions(data.options||[]); setScheduleRecommendedId(data.recommended_option_id||''); const recId=data.recommended_option_id||data.options?.[0]?.id||''; setSelectedScheduleId(recId); const rec=(data.options||[]).find((o:any)=>o.id===recId); if(rec){setDays(rec.days);setDayTypes(rec.day_types);} setSetupStep('schedule');}catch(e:any){alert(e?.message||'Could not load schedule options.');}finally{setScheduleLoading(false);}}
 function applyScheduleOption(opt:any){setSelectedScheduleId(opt.id); setDays(opt.days); setDayTypes(opt.day_types); setScheduleManualOverride(false);}
 function goToReviewStep(){if(!days.length)return alert('Select at least one training day.'); setSetupStep('review');}
 async function generateWithAi(){if(!session?.access_token)return alert('Sign in to generate programs.'); if(mode==='team'&&!activeTeam)return alert('Create or join a team first.'); if(mode==='team'&&!canEdit())return alert('Only owner/editors can create team programs.'); const prompt=aiPrompt.trim(); if(prompt.length<8)return alert('Describe your program in a few words (e.g. baseball throw/hit power).'); await persistEquipmentPreference(); const equipment=normalizeEquipmentList(profileDraft.available_equipment); setAiGenerating(true); setAiSummary(''); setAiCoachingNotes(''); setAiGenError(''); try{const res=await fetch('/api/programs/generate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({prompt,weeks,days,dayTypes,focusMuscles,programName,mode,teamId:mode==='team'?activeTeam?.id:null,includeCooldown,availableEquipment:equipment})}); const data=await res.json().catch(()=>({})); if(!res.ok){const hint=data?.hint?` ${data.hint}`:''; throw new Error((data?.error||`Generation failed (${res.status})`)+hint);} setAiSummary(data.program_summary||''); setAiCoachingNotes(data.coaching_notes||''); if(data.program_name)setProgramName(data.program_name); await loadPrograms(); setTrainingSubNav(mode); setAppNav('Training'); setSetupStep('goals');}catch(e:any){const msg=e?.message||'AI program generation failed.'; setAiGenError(msg); alert(msg);}finally{setAiGenerating(false);}}
 async function submitBugReport(){if(!session?.access_token)return alert('Sign in to report a bug.'); const description=bugDescription.trim(); if(description.length<8)return alert('Please describe what went wrong (at least 8 characters).'); setBugSending(true); try{const res=await fetch('/api/bug-reports',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({title:bugTitle.trim(),description,pageContext:`nav=${appNav}; training=${trainingSubNav}; mode=${mode}; program=${program?.id||'none'}; week=${week}; error=${aiGenError||'none'}`,appNav,userAgent:typeof navigator!=='undefined'?navigator.userAgent:''})}); const data=await res.json().catch(()=>({})); if(!res.ok)throw new Error(data?.error||`Could not send report (${res.status})`); setBugSentId(data.id||'ok'); setBugTitle(''); setBugDescription('');}catch(e:any){alert(e?.message||'Could not send bug report.');}finally{setBugSending(false);}}
 async function generate(){if(mode==='team'&&!activeTeam)return alert('Create or join a team first.'); if(mode==='team'&&!canEdit())return alert('Only owner/editors can create team programs.'); const catMap=catalogByName(catalog); const payload:any={owner_user_id:session.user.id,team_id:mode==='team'?activeTeam.id:null,visibility:mode,name:programName,weeks,generation_method:'template',start_date:mondayOfWeek(today())}; if(focusMuscles.length)payload.focus_muscles=focusMuscles; const{data:p,error}=await supabase.from('st_programs').insert(payload).select().single(); if(error)return alert(error.message); const wr:any=[]; for(let w=1;w<=weeks;w++)days.forEach(d=>wr.push({program_id:p.id,week:w,day_order:DAYS.indexOf(d),day_label:d,workout_type:dayTypes[d]||'Full Body'})); const{data:ws,error:we}=await supabase.from('st_workouts').insert(wr).select(); if(we)return alert(we.message); for(const w of ws||[]){const baseTpl=WORKOUT_TEMPLATES[w.workout_type]||WORKOUT_TEMPLATES['Full Body']; const tpl=applyFocusToWorkoutTemplate(baseTpl,focusMuscles,catalog); for(const sec of SECTIONS){const list=tpl[sec.id]||[]; if(!list.length)continue; const startSort=SECTION_SORT_BASE[sec.id]??0; const{error:ie}=await insertTemplateSectionItems(supabase,w.id,sec.id,list,startSort,catMap); if(ie)return alert(ie.message);}} await loadPrograms();setTrainingSubNav(mode);setAppNav('Training');}
 function catalogPayloadFromItem(catalogItem:any,section:string){return{name:catalogItem.name,muscle_group:catalogItem.muscle_group||'',catalog_exercise_id:catalogItem.id,exercise_type:inferExerciseType(catalogItem.name,catalogItem.muscle_group,section,catalogItem.exercise_type)};}
 function openAddExercisePanel(section:string,supersetGroupId?:string|null){if(!canEdit())return; const pending=supersetGroupId||pendingSupersetGroup[section]; const config=pending?{...emptyAddPanelConfig(),mode:'superset' as const,supersetGroupId:pending}:emptyAddPanelConfig(); if(supersetGroupId)setPendingSupersetGroup({...pendingSupersetGroup,[section]:supersetGroupId}); setAddExercisePanel({section,step:'search',query:'',filters:emptyAddPanelFilters(),picked:null,config,custom:emptyAddPanelCustom(),replaceTarget:null});}
 function openReplaceExercisePanel(ex:any){if(!canEdit())return; const section=exerciseSection(ex); setAddExercisePanel({section,step:'search',query:ex.name||'',filters:emptyAddPanelFilters(),picked:null,config:emptyAddPanelConfig(),custom:emptyAddPanelCustom(),replaceTarget:ex});}
 async function replaceExerciseWithCatalog(ex:any,catalogItem:any){if(!canEdit()||!workout||!catalogItem)return; const section=exerciseSection(ex); const payload=catalogPayloadFromItem(catalogItem,section); let updated=0; for(const tw of targetWorkoutsFrom(workout)){const match=resolveExerciseTarget(tw,ex,workout); if(match){const{error}=await supabase.from('st_exercises').update(payload).eq('id',match.id); if(error)return alert(error.message); updated++;}} if(!updated)return alert('Could not update that exercise. Try "This workout only" scope.'); await reloadKeepDay();}
 async function pickExerciseForPanel(item:any){if(!addExercisePanel)return; if(addExercisePanel.replaceTarget){await replaceExerciseWithCatalog(addExercisePanel.replaceTarget,item); setAddExercisePanel(null); return;} const defaultSets=sectionDefaultSets(addExercisePanel.section); setAddExercisePanel({...addExercisePanel,step:'configure',picked:item,config:{...addExercisePanel.config,setCount:defaultSets}});}
 async function createCustomInPanel(){if(!addExercisePanel||!session?.user)return; const d=addExercisePanel.custom; const name=d.name.trim(); if(!name)return alert('Enter exercise name.'); const{data,error}=await supabase.from('st_exercise_catalog').insert({user_id:session.user.id,name,category:d.category||addExercisePanel.section,muscle_group:d.muscle_group.trim(),equipment:d.equipment.trim(),movement_pattern:d.movement_pattern.trim(),is_system:false,is_archived:false}).select().single(); if(error)return alert(error.message); await loadCatalog(); setAddExercisePanel({...addExercisePanel,step:'configure',picked:data,config:{...addExercisePanel.config,setCount:sectionDefaultSets(addExercisePanel.section)}});}
 async function confirmAddExercise(){if(!addExercisePanel?.picked||!canEdit()||!workout)return; const{section,picked,config}=addExercisePanel; const exType=exerciseTypeOf(picked,picked); let groupId:string|null=null; let supersetLabel:string|null=null; let slotOrder:number|null=null; let existing:any[]=[]; if(config.mode==='superset'){if(!config.supersetGroupId||config.supersetGroupId==='__new__')groupId=makeSupersetGroupId(); else groupId=config.supersetGroupId; if(groupId){existing=sectionExercises(workout,section).filter((e:any)=>e.superset_group_id===groupId); if(existing.length>=3)return alert('That superset already has 3 exercises.'); if(!existing.length){supersetLabel=nextSupersetLabel(workout,section); slotOrder=1;} else {supersetLabel=existing[0].superset_label; slotOrder=existing.length+1;}}} let sortOrder=nextSortOrder(workout,section); if(groupId&&existing.length)sortOrder=Math.max(...existing.map((e:any)=>e.sort_order||0))+1; const setCount=Math.max(1,Number(config.setCount)||sectionDefaultSets(section)); const existingInGroup=groupId?sectionExercises(workout,section).filter((e:any)=>e.superset_group_id===groupId).length:0; for(const tw of targetWorkoutsFrom(workout)){const{data:e,error}=await supabase.from('st_exercises').insert({workout_id:tw.id,section,sort_order:sortOrder,name:picked.name,muscle_group:picked.muscle_group||'',catalog_exercise_id:picked.id,exercise_type:exType,superset_group_id:groupId,superset_label:supersetLabel,superset_order:slotOrder}).select().single(); if(error)return alert(error.message); const rows:any[]=[]; for(let i=0;i<setCount;i++)rows.push({exercise_id:e.id,sort_order:i,set_number:i+1,set_type:'working',target_weight:config.targetWeight||'',target_reps:config.targetReps||''}); if(rows.length)await supabase.from('st_planned_sets').insert(rows);} await reloadKeepDay(); const newGroupCount=existingInGroup+1; if(config.mode==='superset'&&groupId&&newGroupCount<3){setPendingSupersetGroup({...pendingSupersetGroup,[section]:groupId}); setAddExercisePanel({section,step:'search',query:'',picked:null,config:{...emptyAddPanelConfig(),mode:'superset',supersetGroupId:groupId,setCount:sectionDefaultSets(section),targetReps:'8-12',targetWeight:''},custom:emptyAddPanelCustom()}); return;} setPendingSupersetGroup({...pendingSupersetGroup,[section]:null}); setAddExercisePanel(null);}
 async function renameSuperset(ex:any,newLabel:string){
  if(!canEdit()||!ex.superset_group_id||!newLabel.trim())return;
  for(const tw of targetWorkoutsFrom(workout)){
   const targets=(tw.st_exercises||[]).filter((e:any)=>e.superset_group_id===ex.superset_group_id&&exerciseSection(e)===exerciseSection(ex));
   for(const t of targets){const{error}=await supabase.from('st_exercises').update({superset_label:newLabel.trim()}).eq('id',t.id); if(error)return alert(error.message);}
  }
  await reloadKeepDay();
 }
 async function breakSuperset(ex:any){
  if(!canEdit()||!ex.superset_group_id)return;
  for(const tw of targetWorkoutsFrom(workout)){
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
  const ordered=sectionExercises(workout,section).filter((e:any)=>e.superset_group_id===groupId).sort((a:any,b:any)=>(a.superset_order||0)-(b.superset_order||0));
  for(let i=0;i<ordered.length;i++){
   const order=i+1;
   if((ordered[i].superset_order||0)===order)continue;
   for(const tw of targetWorkoutsFrom(workout)){
    const match=resolveExerciseTarget(tw,ordered[i],workout);
    if(match) await supabase.from('st_exercises').update({superset_order:order}).eq('id',match.id);
   }
  }
 }
 async function removeFromSuperset(ex:any){
  if(!canEdit()||!ex.superset_group_id)return;
  const section=exerciseSection(ex);
  const gid=ex.superset_group_id;
  for(const tw of targetWorkoutsFrom(workout)){
   const match=resolveExerciseTarget(tw,ex,workout);
   if(match) await supabase.from('st_exercises').update({superset_group_id:null,superset_label:null,superset_order:null}).eq('id',match.id);
  }
  await renumberSupersetGroup(section,gid);
  await cleanupSupersetOrphans(section,gid);
  await reloadKeepDay();
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
 const{data,error}=await supabase.from('st_exercise_catalog').insert({user_id:session.user.id,name,category:draft.category||section,muscle_group:draft.muscle_group.trim(),equipment:draft.equipment.trim(),movement_pattern:draft.movement_pattern.trim(),is_system:false,is_archived:false}).select().single();
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
 const payload={name:catalogEditDraft.name.trim(),category:catalogEditDraft.category.trim(),muscle_group:catalogEditDraft.muscle_group.trim(),equipment:catalogEditDraft.equipment.trim(),movement_pattern:catalogEditDraft.movement_pattern.trim()};
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
 async function updateExerciseField(ex:any,field:string,value:string){
 if(!canEdit())return;
 const section=exerciseSection(ex);
 let payload:Record<string,any>={[field]:value};
 if(field==='name'){
  const trimmed=value.trim();
  if(!trimmed)return;
  const builtin=builtinCatalogItems(catalog);
  const hit=matchExerciseToCatalog(trimmed,builtin,catalogByName(builtin));
  if(hit)payload=catalogPayloadFromItem(hit,section);
  else payload={name:trimmed,catalog_exercise_id:null};
 }
 for(const tw of targetWorkoutsFrom(workout)){
  const match=resolveExerciseTarget(tw,ex,workout);
  if(match){const{error}=await supabase.from('st_exercises').update(payload).eq('id',match.id); if(error)return alert(error.message);}
 }
 await reloadKeepDay();
}
 async function removeExercise(e:any){
 if(!canEdit())return alert('Only owner/editors can remove exercises.');
 const msg=applyScope==='future'?'Remove this exercise from this week and all future weeks?':'Remove this exercise from this workout only?';
 if(!confirm(msg))return;
 const groupId=e.superset_group_id, section=exerciseSection(e);
 let removed=0;
 for(const tw of targetWorkoutsFrom(workout)){
  const match=resolveExerciseTarget(tw,e,workout);
  if(!match)continue;
  const{error}=await supabase.from('st_exercises').delete().eq('id',match.id);
  if(error)return alert(error.message);
  removed++;
 }
 if(!removed)return alert('Could not find this exercise to remove. Try "This workout only" scope or break the superset first.');
 if(groupId)await cleanupSupersetOrphans(section,groupId);
 if(groupId&&section) setPendingSupersetGroup((prev:any)=>{const next={...prev}; if(next[section]===groupId)next[section]=null; return next;});
 await reloadKeepDay();
}
 async function moveExercise(e:any,dir:number){
 if(!canEdit())return alert('Only owner/editors can reorder.');
 const section=exerciseSection(e);
 const gid=e.superset_group_id;
 if(gid){
  const groupMembers=sectionExercises(workout,section).filter((x:any)=>x.superset_group_id===gid).sort((a:any,b:any)=>(a.superset_order||0)-(b.superset_order||0));
  const idx=groupMembers.findIndex((x:any)=>x.id===e.id);
  const innerSwap=idx+dir;
  if(innerSwap>=0&&innerSwap<groupMembers.length){
   const other=groupMembers[innerSwap];
   const myOrder=e.superset_order||idx+1;
   const otherOrder=other.superset_order||innerSwap+1;
   for(const tw of targetWorkoutsFrom(workout)){
    const match=resolveExerciseTarget(tw,e,workout);
    const otherMatch=resolveExerciseTarget(tw,other,workout);
    if(match&&otherMatch){
     await supabase.from('st_exercises').update({superset_order:otherOrder}).eq('id',match.id);
     await supabase.from('st_exercises').update({superset_order:myOrder}).eq('id',otherMatch.id);
    }
   }
   await reloadKeepDay();
   return;
  }
 }
 const exercises=sectionExercises(workout,section);
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
 for(const tw of targetWorkoutsFrom(workout)){
  for(const row of plan){
   const match=resolveExerciseTarget(tw,row.source,workout);
   if(match) await supabase.from('st_exercises').update({sort_order:row.sort_order}).eq('id',match.id);
  }
 }
 await reloadKeepDay();
}
 async function addSet(e:any){
 if(!canEdit())return alert('Only owner/editors can change planned sets.');
 const active=(e.st_planned_sets||[]).filter((s:any)=>!s.is_deleted);
 const n=active.length?Math.max(...active.map((s:any)=>s.set_number||0))+1:1;
 const sort_order=active.length?Math.max(...active.map((s:any)=>s.sort_order||0))+1:0;
 for(const tw of targetWorkoutsFrom(workout)){
  const targetEx=resolveExerciseTarget(tw,e,workout);
  if(targetEx) await supabase.from('st_planned_sets').insert({exercise_id:targetEx.id,sort_order,set_number:n,set_type:'working'});
 }
 await reloadKeepDay();
}
 async function editSet(s:any,field:string,value:any){
 if(!canEdit())return alert('Only owner/editors can change planned sets.');
 const ex=(workout?.st_exercises||[]).find((e:any)=>(e.st_planned_sets||[]).some((ps:any)=>ps.id===s.id));
 if(!ex)return;
 for(const tw of targetWorkoutsFrom(workout)){
  const targetEx=resolveExerciseTarget(tw,ex,workout);
  const targetSet=targetEx?matchingSet(targetEx,s):null;
  if(targetSet) await supabase.from('st_planned_sets').update({[field]:value}).eq('id',targetSet.id);
 }
 await reloadKeepDay();
}
 async function removeSet(s:any){
 if(!canEdit())return alert('Only owner/editors can remove planned sets.');
 const ex=(workout?.st_exercises||[]).find((e:any)=>(e.st_planned_sets||[]).some((ps:any)=>ps.id===s.id));
 if(!ex)return;
 for(const tw of targetWorkoutsFrom(workout)){
  const targetEx=resolveExerciseTarget(tw,ex,workout);
  const targetSet=targetEx?matchingSet(targetEx,s):null;
  if(targetSet) await supabase.from('st_planned_sets').update({is_deleted:true}).eq('id',targetSet.id);
 }
 await reloadKeepDay();
}
 async function saveLog(sid:string,field:string,value:any,opts?:{completed?:boolean}){
  if(!canLog())return;
  return upsertSetLog(sid,{[field]:value},opts);
 }
 async function upsertSetLog(sid:string,fieldUpdates:Record<string,any>,opts?:{completed?:boolean}){
  if(!canLog())return;
  const old=logsRef.current[sid]||{};
  let ex:any=null, ps:any=null;
  for(const e of workout?.st_exercises||[]){
    const found=(e.st_planned_sets||[]).find((s:any)=>s.id===sid);
    if(found){ex=e; ps=found; break;}
  }
  if(!ex||!ps) return alert('Could not save log for this set.');
  const catItem=catalog.find((c:any)=>c.id===ex.catalog_exercise_id);
  const exType=exerciseTypeOf(ex,catItem);
  const fieldKeys=logFieldsForType(exType).map((f:any)=>f.key);
  const uid=logUserId();
  if(!session?.user||!uid)return;
  const coachLogging=uid!==session.user.id;
  const logTeamId=mode==='team'&&activeTeam&&activeTeam.training_source!=='personal'?activeTeam.id:null;
  const updatingCompleted=Object.prototype.hasOwnProperty.call(fieldUpdates,'completed')||opts?.completed!==undefined;
  const markComplete=updatingCompleted
    ?(opts?.completed!==undefined?!!opts.completed:!!fieldUpdates.completed)
    :(old.completed??true);
  const payload:any={
    planned_set_id:sid,
    user_id:uid,
    logged_by_user_id:coachLogging?session.user.id:null,
    team_id:logTeamId,
    log_date:logDate,
    completed:markComplete,
    ...snapshotForLog(ex,ps,workout,catItem)
  };
  const allKeys=Array.from(new Set([...fieldKeys,'actual_weight','actual_reps','actual_rpe','actual_duration','actual_distance','actual_pace','actual_hr','actual_calories','log_notes']));
  allKeys.forEach((k:string)=>{
    if(Object.prototype.hasOwnProperty.call(fieldUpdates,k))payload[k]=fieldUpdates[k]==null?'':String(fieldUpdates[k]);
    else payload[k]=old[k]??'';
  });
  // If user logged weight/reps/duration, treat as completed unless explicitly marked incomplete
  if(opts?.completed===undefined&&!Object.prototype.hasOwnProperty.call(fieldUpdates,'completed')){
    if(logHasPerformance(payload)) payload.completed=true;
  }
  const{data,error}=await supabase.from('st_set_logs').upsert(payload,{onConflict:'planned_set_id,user_id,log_date'}).select().single();
  if(error)return alert(error.message);
  setLogs((prev:any)=>{
    const next={...prev,[sid]:data};
    logsRef.current=next;
    return next;
  });
  return data;
 }
 async function duplicateSetLog(sid:string,source:any){
  if(!canLog()||!source)return;
  const keys=['actual_weight','actual_reps','actual_rpe','actual_duration','actual_distance','actual_pace','actual_hr','actual_calories','log_notes'];
  const updates:Record<string,any>={};
  keys.forEach((k)=>{
    if(source[k]!=null&&String(source[k]).trim()!=='') updates[k]=String(source[k]);
  });
  if(!Object.keys(updates).length)return alert('No previous values found to copy.');
  await upsertSetLog(sid,updates,{completed:false});
 }
 async function setRole(member:any,role:string){if(!isOwner())return alert('Only owner can change roles.'); await supabase.from('st_team_members').update({role}).eq('id',member.id); await loadMembers(); await loadTeams();}
 function next(e:any){if(e.key==='Enter'||e.key==='ArrowRight'){e.preventDefault(); const i=refs.current.indexOf(e.currentTarget); if(refs.current[i+1])refs.current[i+1].focus();}}
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
 function onSelectWorkoutDay(w:any){
  setActiveWorkout(w.id);
  if(!program)return;
  syncingCalendarRef.current=true;
  const start=resolveProgramStartDate(program);
  setLogDate(dateForWeekAndDay(start,week,w.day_label));
  queueMicrotask(()=>{syncingCalendarRef.current=false;});
 }
 async function updateProgramStartDate(ymd:string){
  if(!program||!canEdit()||!ymd)return;
  const anchor=mondayOfWeek(ymd);
  const{error}=await supabase.from('st_programs').update({start_date:anchor}).eq('id',program.id);
  if(error)return alert(error.message);
  setProgram({...program,start_date:anchor});
  const aligned=weekForDate(anchor,logDate,program.weeks||weeks||6);
  setWeek(aligned);
 }
 async function reloadKeepDay(){
  const keep = activeWorkout;
  await loadPrograms();
  if(keep) setActiveWorkout(keep);
}
 function goNav(n:string){
  setAppNav(n);
  if(n==='Progress'||n==='Dashboard')loadProgressLogs();
  if(n==='Settings'){loadCatalog(); if(activeTeam)loadMembers();}
  if(n==='Team'){if(teams.length)setMode('team'); loadMembers(); loadMemberStats(); loadMemberAssignments(); loadCoachTeamSnapshot();}
  if(n==='Dashboard'&&teams.length){loadMembers(); loadMemberStats();}
  if(n==='Training'){if(!program&&trainingSubNav!=='setup')setShowProgramSetup(true); if(teams.length&&trainingSubNav==='team'){loadMembers();loadMemberStats();loadMemberAssignments();loadCoachTeamSnapshot();}}
 }

function targetWorkoutsFrom(current:any){
  if(!current) return [];
  const all=(program?.st_workouts||[]).filter((w:any)=>w.day_order===current.day_order);
  return applyScope==='future'
    ? all.filter((w:any)=>w.week>=current.week).sort((a:any,b:any)=>a.week-b.week)
    : [current];
}
function matchingExercise(targetWorkout:any, sourceExercise:any){
  if(!targetWorkout||!sourceExercise)return null;
  const section=exerciseSection(sourceExercise);
  const exs=(targetWorkout.st_exercises||[]).filter((e:any)=>exerciseSection(e)===section);
  if(sourceExercise.catalog_exercise_id){
    const bySortCat=exs.find((e:any)=>e.sort_order===sourceExercise.sort_order&&e.catalog_exercise_id===sourceExercise.catalog_exercise_id);
    if(bySortCat)return bySortCat;
  }
  const bySortName=exs.find((e:any)=>e.sort_order===sourceExercise.sort_order&&e.name===sourceExercise.name);
  if(bySortName)return bySortName;
  const gid=sourceExercise.superset_group_id||null;
  if(gid){
    const byGroupSort=exs.find((e:any)=>e.superset_group_id===gid&&e.sort_order===sourceExercise.sort_order);
    if(byGroupSort)return byGroupSort;
    const byGroupName=exs.find((e:any)=>e.superset_group_id===gid&&e.name===sourceExercise.name);
    if(byGroupName)return byGroupName;
    if(sourceExercise.catalog_exercise_id){
      const byGroupCat=exs.find((e:any)=>e.superset_group_id===gid&&e.catalog_exercise_id===sourceExercise.catalog_exercise_id);
      if(byGroupCat)return byGroupCat;
    }
  }
  return exs.find((e:any)=>e.sort_order===sourceExercise.sort_order)
    || (sourceExercise.catalog_exercise_id&&exs.find((e:any)=>e.catalog_exercise_id===sourceExercise.catalog_exercise_id))
    || exs.find((e:any)=>e.name===sourceExercise.name)
    || null;
}
function resolveExerciseTarget(targetWorkout:any,sourceExercise:any,currentWorkout:any){
  if(targetWorkout?.id===currentWorkout?.id)return (targetWorkout.st_exercises||[]).find((x:any)=>x.id===sourceExercise.id)||sourceExercise;
  return matchingExercise(targetWorkout,sourceExercise);
}
function matchingSet(targetExercise:any, sourceSet:any){
  return (targetExercise.st_planned_sets||[]).find((s:any)=>s.sort_order===sourceSet.sort_order)
    || (targetExercise.st_planned_sets||[]).find((s:any)=>s.set_type===sourceSet.set_type && s.set_number===sourceSet.set_number);
}

const weekWorkouts=(program?.st_workouts||[]).filter((w:any)=>w.week===week).sort((a:any,b:any)=>a.day_order-b.day_order);
 const workout=weekWorkouts.find((w:any)=>w.id===activeWorkout)||weekWorkouts[0];
 const planned=(workout?.st_exercises||[]).reduce((n:number,e:any)=>n+(e.st_planned_sets||[]).filter((s:any)=>!s.is_deleted).length,0);
 const logged=Object.values(logs).filter((x:any)=>x.completed).length;
 const progressByDate=progressLogs.reduce((acc:any,row:any)=>{
  const key=row.log_date;
  if(!acc[key]) acc[key]={date:key,label:row.snapshot_day_label||'',type:row.snapshot_workout_type||'',rows:[]};
  acc[key].rows.push(row);
  return acc;
 },{});
 const progressDays=Object.values(progressByDate).sort((a:any,b:any)=>String(b.date).localeCompare(String(a.date)));
 const progressWeightUnit=profileDraft?.units_preference==='metric'?'kg':'lb';
 const userCatalog=catalog.filter((c:any)=>!c.is_system&&c.user_id===session?.user?.id);
 const activeUserCatalog=userCatalog.filter((c:any)=>!c.is_archived);
 const archivedUserCatalog=userCatalog.filter((c:any)=>c.is_archived);
 const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 const todayDayLabel=dayNames[new Date().getDay()];
 const greetingHour=new Date().getHours();
 const greeting=greetingHour<12?'Good morning':greetingHour<18?'Good afternoon':'Good evening';
 const calendarWeek=program?weekForDate(resolveProgramStartDate(program),today(),program.weeks||weeks||6):week;
 const todayWorkout=program?(program.st_workouts||[]).find((w:any)=>w.week===calendarWeek&&w.day_label===todayDayLabel):null;
 const{monday:weekStartStr,sunday:weekEndStr}=currentCalendarWeekBounds();
 const weeklyLogs=progressLogs.filter((r:any)=>{const d=String(r.log_date);return d>=weekStartStr&&d<=weekEndStr;});
 const weeklySetCount=weeklyLogs.length;
 const weeklyWorkoutDays=new Set(weeklyLogs.map((r:any)=>r.log_date)).size;
 const todaySetCount=progressLogs.filter((r:any)=>String(r.log_date)===today()).length;
 const teamActiveCount=members.filter((m:any)=>(memberStats[m.user_id]?.sets||0)>0).length;
 const teamCompliancePct=members.length?Math.round(teamActiveCount/members.length*100):0;
 const teamTotalSets=members.reduce((n:number,m:any)=>n+(memberStats[m.user_id]?.sets||0),0);
 const teamPlanCount=members.filter((m:any)=>(m.training_source||'team')==='team').length;
 const teamModeControl=<div className="stat stat-mode"><span className="muted">Team</span><select className="mode-team-select" value={activeTeam?.id||''} onChange={e=>{setSelectedTeamId(e.target.value||null);setMode('team');}} aria-label="Select team"><option value="">{teams.length?'Select team':'No teams'}</option>{teams.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>{activeTeam&&<span className="muted mode-team-meta">{activeTeam.my_role}{canEdit()?' · edit':' · log'}</span>}</div>;
 const teamPlanPanel=mode==='team'&&activeTeam?<div className="card team-plan-card"><div className="topline" style={{justifyContent:'space-between'}}><h2>My training plan</h2><span className="badge">{(activeTeam.training_source||'team')==='team'?'Team program':'Personal program'}</span></div><div className="tabs"><button type="button" className={(activeTeam.training_source||'team')!=='personal'?'active':''} onClick={()=>setMyTrainingSource('team')}>Team workout</button><button type="button" className={activeTeam.training_source==='personal'?'active':''} onClick={()=>setMyTrainingSource('personal')}>Personal plan</button></div></div>:null;
 const teamCompliancePanel=<div className="card team-compliance-card"><div className="topline" style={{justifyContent:'space-between'}}><h2>Compliance (this week)</h2><span className="badge">{teamCompliancePct}%</span></div><div className="dash-metrics"><div><b>{teamActiveCount}/{members.length||0}</b><span className="muted">Members active</span></div><div><b>{teamTotalSets}</b><span className="muted">Total sets</span></div><div><b>{teamPlanCount}</b><span className="muted">On team plan</span></div><div><b>{members.length-teamPlanCount}</b><span className="muted">Personal plan</span></div></div></div>;
 const teamRosterLegacy=<div className="card team-roster-card"><div className="topline" style={{justifyContent:'space-between'}}><h2>Members</h2><button className="btn small secondary" onClick={()=>{loadMembers();loadMemberStats();}}>Refresh</button></div><p className="muted">Your coach manages team programming from the coach dashboard.</p>{members.length===0&&<p className="muted">No members yet.</p>}{members.map((m:any)=>{const stats=memberStats[m.user_id]||{sets:0,days:0}; const isSelf=!!session?.user&&m.user_id===session.user.id; return <div key={m.id} className="team-member-row"><div className="team-member-main"><div><b>{m.display_name||'Member'}{isSelf?' (you)':''}</b><span className="muted">{m.role} · {(m.training_source||'team')==='team'?'Team':'Personal'} · {stats.sets} sets</span></div><span className="muted">{stats.days}d</span></div></div>})}</div>;
 const teamRosterPanel=canCoachView()&&coachSnapshot?<CoachRoster roster={coachSnapshot.roster} activeUserId={memberDashboard?.user_id} canManagePlans onSelectAthlete={openMemberDashboardByUserId} onSetTrainingSource={(userId,source)=>{const member=members.find((m:any)=>m.user_id===userId); if(member)setMemberTrainingSource(member,source);}} trainingSourceByUser={Object.fromEntries(members.map((m:any)=>[m.user_id,m.training_source||'team']))}/>:teamRosterLegacy;
 const coachTeamHeader=<div className="card coach-team-bar">{teamModeControl}{activeTeam&&<p className="muted coach-team-invite">Invite: <b>{activeTeam.invite_code}</b> · Role: {activeTeam.my_role}</p>}</div>;
 const emptyCoachOverview={athleteCount:0,trainingToday:0,completedToday:0,inProgressToday:0,missedToday:0,compliancePct:0,prsThisWeek:0,totalSetsThisWeek:0,alerts:[]};
 const athleteTodayWorkout=program?findTodayWorkout(program,calendarWeek,todayDayLabel):null;
 const memberTodayWorkout=memberDashProgram?findTodayWorkout(memberDashProgram,week,todayDayLabel):null;
 const memberWorkoutStatus=workoutStatusFromLogs(memberTodayWorkout,memberDashLogs);
 const focusVolumeEst=focusMuscles.length?estimateWeeklyFocusSets(focusMuscles,dayTypes,days):{};
 const builtinCatalog=useMemo(()=>builtinCatalogItems(catalog),[catalog]);
 const equipmentForSearch=normalizeEquipmentList(profileDraft.available_equipment);
 const panelFilterOptions=useMemo(()=>addExercisePanel?buildCatalogFilterOptions(builtinCatalog):null,[addExercisePanel,builtinCatalog]);
 const panelSearchOpts=addExercisePanel?{query:addExercisePanel.query||'',filters:{...(addExercisePanel.filters||emptyAddPanelFilters()),availableEquipment:hasEquipmentFilter(equipmentForSearch)?equipmentForSearch:undefined},limit:60}:null;
 const panelMatchCount=panelSearchOpts?countCatalogMatches(builtinCatalog,panelSearchOpts):0;
 const panelResults=panelSearchOpts?searchCatalog(builtinCatalog,panelSearchOpts):[];
 const panelHasSearch=panelSearchOpts?hasCatalogSearchInput(panelSearchOpts.query,panelSearchOpts.filters):false;
 const panelSupersetGroups=addExercisePanel&&workout?getSupersetGroupsForSection(workout,addExercisePanel.section).filter((g:any)=>g.count<3):[];
 const pendingGroupId=addExercisePanel?pendingSupersetGroup[addExercisePanel.section]:null;
 const pendingGroupInfo=pendingGroupId?panelSupersetGroups.find((g:any)=>g.id===pendingGroupId):null;
 const trainingModeStat=<div className="stat"><span className="muted">Plan</span><b>{mode==='team'?(activeTeam?.training_source==='personal'?'Personal':'Team'):'Personal'}</b></div>;
 const memberAssignment=memberDashboard?memberAssignments[memberDashboard.user_id]:null;
 const renderExerciseCard=(ex:any,inSuperset=false)=>{const catItem=catalog.find((c:any)=>c.id===ex.catalog_exercise_id);const exType=exerciseTypeOf(ex,catItem);const aliases=exerciseHistoryAliases(ex.catalog_exercise_id||'',ex.name||'');const histRows=aliases.flatMap((ek)=>history[ek]||[]);const lastPerf=buildLastPerformance(histRows);const plannedSets=(ex.st_planned_sets||[]).filter((s:any)=>!s.is_deleted).length;const progression=recommendNextTarget(lastPerf,plannedSets,ex.name,ex.muscle_group||'');const exThumb=getExerciseThumb(catItem);const showGuide=hasExerciseGuide(catItem);const guidePayload=getExerciseGuidePayload(catItem,ex.name);const cardKey=`${ex.id}:${ex.catalog_exercise_id||'n'}:${ex.name}`;const isEditingName=exerciseNameSearch?.exerciseId===ex.id;const nameQuery=isEditingName?exerciseNameSearch!.query:(ex.name||'');const nameSearchResults=isEditingName&&nameQuery.trim()?searchCatalog(builtinCatalog,{query:nameQuery,filters:{availableEquipment:hasEquipmentFilter(equipmentForSearch)?equipmentForSearch:undefined},limit:8}):[];const sortedSets=(ex.st_planned_sets||[]).filter((s:any)=>!s.is_deleted).sort((a:any,b:any)=>(a.sort_order||0)-(b.sort_order||0));const prevBySetId:Record<string,any>={};sortedSets.forEach((s:any)=>{prevBySetId[s.id]=previousFor(ex,s);});const weightUnit=profileDraft?.units_preference==='metric'?'kg':'lb';return <div className={`card exercise-card${inSuperset?' in-superset':''}`} key={cardKey}>
        <div className="exercise-head"><div className="exercise-head-main">{exThumb&&(showGuide&&guidePayload?<button type="button" className="exercise-card-thumb-btn" title={guidePayload.hasVideo?"Watch form":"Form guide"} onClick={()=>setExerciseGuide(guidePayload)}><img className="exercise-card-thumb" src={exThumb} alt="" loading="lazy" referrerPolicy="no-referrer"/></button>:<img className="exercise-card-thumb" src={exThumb} alt="" loading="lazy" referrerPolicy="no-referrer"/>)}<div className="exercise-meta">{canEdit()?<>
          <div className="exercise-title-row">
            <div className="typeahead-wrap exercise-name-wrap"><textarea className="exercise-name" rows={1} key={`${cardKey}-name`} value={nameQuery} title="Type to search catalog — pick a match or blur to save custom name" onFocus={()=>setExerciseNameSearch({exerciseId:ex.id,query:ex.name||''})} onChange={e=>setExerciseNameSearch({exerciseId:ex.id,query:e.target.value})} onBlur={e=>{const v=e.target.value.trim();setTimeout(()=>{if(namePickRef.current){namePickRef.current=false;return;}setExerciseNameSearch((cur:any)=>cur?.exerciseId===ex.id?null:cur);if(v&&v!==ex.name)updateExerciseField(ex,'name',v);},180);}} onKeyDown={e=>{if(e.key==='Escape')setExerciseNameSearch(null);}}/>{isEditingName&&nameQuery.trim()&&nameSearchResults.length>0&&<div className="typeahead-menu exercise-name-menu">{nameSearchResults.map((item:any)=><button type="button" key={item.id} className="typeahead-item catalog-search-item" onMouseDown={ev=>ev.preventDefault()} onClick={()=>{namePickRef.current=true;setExerciseNameSearch(null);replaceExerciseWithCatalog(ex,item);}}>{getExerciseThumb(item)&&<img className="catalog-search-thumb" src={getExerciseThumb(item)} alt="" loading="lazy" referrerPolicy="no-referrer"/>}<span className="catalog-search-body"><b>{item.name}</b><span className="muted">{catalogResultMeta(item)}</span></span></button>)}</div>}{isEditingName&&nameQuery.trim()&&!nameSearchResults.length&&<div className="typeahead-menu exercise-name-menu"><p className="muted typeahead-empty">No catalog matches — blur to keep a custom name</p></div>}</div>
            <input className="exercise-muscle" key={`${cardKey}-muscle`} placeholder="Muscle" defaultValue={ex.muscle_group||''} onBlur={e=>{if((e.target.value||'')!==(ex.muscle_group||''))updateExerciseField(ex,'muscle_group',e.target.value);}}/>
            <span className="badge exercise-type-badge">{exType}</span>
          </div>
        </>:<>
          <div className="exercise-title-row">
            <h3 className="exercise-name-text">{ex.name}</h3>
            <span className="badge exercise-muscle-badge">{ex.muscle_group||'Muscle'}</span>
            <span className="badge exercise-type-badge">{exType}</span>
          </div>
        </>}{canEdit()&&!ex.catalog_exercise_id&&<p className="muted exercise-link-hint">No catalog link — edit name or use Change to get form guide</p>}{isStrengthLike(exType)&&<div className="progression-hints"><div className="prevline">Last: {progression.lastSummary}</div><div className="progression-next">Next: {progression.nextTarget}</div><div className="muted progression-note">{progression.note}</div></div>}{exerciseLastSummary(ex)&&<div className="prevline">Logged: {exerciseLastSummary(ex)}</div>}</div></div><div className="exercise-head-actions">{showGuide&&guidePayload&&<button type="button" className="btn small secondary" onClick={()=>setExerciseGuide(guidePayload)}>{guidePayload.hasVideo?'Watch form':'Form guide'}</button>}{canEdit()&&<div className="actions"><button className="btn small secondary" title="Search catalog and replace this exercise" onClick={()=>openReplaceExercisePanel(ex)}>Change</button>{inSuperset&&<><button className="btn small secondary" title="Move up in superset" onClick={()=>moveExercise(ex,-1)}>↑</button><button className="btn small secondary" title="Move down in superset" onClick={()=>moveExercise(ex,1)}>↓</button><button className="btn small secondary" title="Remove from superset" onClick={()=>removeFromSuperset(ex)}>Out</button></>}{!inSuperset&&<><button className="btn small secondary" title="Move up" onClick={()=>moveExercise(ex,-1)}>↑</button><button className="btn small secondary" title="Move down" onClick={()=>moveExercise(ex,1)}>↓</button></>}<button className="btn small secondary" onClick={()=>addSet(ex)}>+ Set</button><button className="btn small red" onClick={()=>removeExercise(ex)}>Remove</button></div>}</div></div>
        <WorkoutSetLogger exType={exType} sets={sortedSets} logs={logs} prevBySetId={prevBySetId} weightUnit={weightUnit} distanceUnit={logDistanceUnit} onDistanceUnitChange={setLogDistanceUnit} canEdit={canEdit()} canLog={canLog()} onEditSet={editSet} onRemoveSet={removeSet} onSaveField={(sid,field,value,opts)=>saveLog(sid,field,value,opts)} onDuplicateSet={duplicateSetLog} registerInputRef={el=>{if(el&&!refs.current.includes(el))refs.current.push(el)}} onInputKeyDown={next}/>
      </div>;};
 const equipmentChips=(list:string[],onToggle:(id:string)=>void,muted?:string)=><><label>Available equipment</label><p className="muted">{muted||'AI plans and exercise search only use gear you select here (bodyweight stretches always allowed).'}</p><div className="focus-muscle-grid equipment-grid">{EQUIPMENT_OPTIONS.map((o:any)=><button type="button" key={o.id} className={`focus-chip${list.includes(o.id)?' active':''}`} onClick={()=>onToggle(o.id)}>{o.label}</button>)}</div>{hasEquipmentFilter(list)&&<p className="muted">Active filter: {equipmentFilterLabel(list)}</p>}</>;
 const programSetupPanel=<div className="card program-setup"><div className="topline" style={{justifyContent:'space-between'}}><h2>Program setup</h2>{trainingSubNav!=='setup'&&<button className="btn small secondary" onClick={()=>setShowProgramSetup(v=>!v)}>{showProgramSetup?'Hide':'Show'}</button>}</div>{(showProgramSetup||trainingSubNav==='setup')&&<><div className="tabs setup-mode-tabs"><button type="button" className={mode==='personal'?'active':''} onClick={()=>setMode('personal')}>Personal program</button><button type="button" className={mode==='team'?'active':''} onClick={()=>{setMode('team');if(teams.length&&!selectedTeamId)setSelectedTeamId(teams[0].id);}}>Team program</button></div>{mode==='team'&&<div className="card" style={{marginTop:8}}><label>Team</label><select value={activeTeam?.id||''} onChange={e=>setSelectedTeamId(e.target.value||null)}><option value="">Select</option>{teams.map((t:any)=><option key={t.id} value={t.id}>{t.name} · {t.my_role}</option>)}</select><div className="actions" style={{marginTop:8}}><button className="btn small secondary" onClick={createTeam}>Create</button><button className="btn small secondary" onClick={joinTeam}>Join</button></div>{activeTeam?<p className="muted">Invite: <b>{activeTeam.invite_code}</b> · Role: {activeTeam.my_role}</p>:teams.length===0?<p className="muted">No teams yet.</p>:<p className="muted">Select a team above.</p>}</div>}<label>Program</label><select value={program?.id||''} onChange={e=>setProgram(programs.find((p:any)=>p.id===e.target.value))}>{programs.length===0&&<option>No programs</option>}{programs.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{mode==='team'&&canEdit()&&programs.length>0&&<><label>Team active program</label><select value={activeTeam?.default_program_id||program?.id||''} onChange={e=>setTeamDefaultProgram(e.target.value)}>{programs.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select><p className="muted">Members following the team plan use this program.</p></>}<div className="setup-wizard-steps"><span className={setupStep==='goals'?'active':''}>1 Goals</span><span className="setup-wizard-dot">·</span><span className={setupStep==='schedule'?'active':''}>2 Schedule</span><span className="setup-wizard-dot">·</span><span className={setupStep==='review'?'active':''}>3 Generate</span></div>{setupStep==='goals'&&<><label>Your goals</label><p className="muted">The more detail you give (sport, schedule, equipment, injuries to avoid, priorities), the better the AI plan. Aim for a few sentences.</p><textarea className="ai-prompt-input ai-prompt-input-lg" rows={8} value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} placeholder="Sport, goals, days available, equipment, and anything to avoid…" disabled={scheduleLoading||aiGenerating}/><p className="muted ai-prompt-count">{aiPrompt.trim().length} characters · richer prompts usually produce better plans</p>{equipmentChips(normalizeEquipmentList(profileDraft.available_equipment),(id)=>setProfileDraft({...profileDraft,available_equipment:toggleEquipmentList(normalizeEquipmentList(profileDraft.available_equipment),id)}),'Only exercises matching your equipment appear in search and AI plans.')}<button className="btn green full" style={{marginTop:10}} onClick={()=>fetchScheduleSuggestions()} disabled={scheduleLoading||aiGenerating}>{scheduleLoading?'Planning schedule…':'Next: Plan my schedule'}</button></>}{setupStep==='schedule'&&<>{scheduleCoachMessage&&<p className="schedule-coach-msg">{scheduleCoachMessage}</p>}<label>Include cardio days?</label><div className="cardio-pref-chips"><button type="button" className={wantsCardio===true?'active':''} onClick={()=>{setWantsCardio(true);fetchScheduleSuggestions(true,wantsMobility);}}>Yes</button><button type="button" className={wantsCardio===false?'active':''} onClick={()=>{setWantsCardio(false);fetchScheduleSuggestions(false,wantsMobility);}}>No</button><button type="button" className={wantsCardio===null?'active':''} onClick={()=>{setWantsCardio(null);fetchScheduleSuggestions(null,wantsMobility);}}>Let AI decide</button></div><label>Include a mobility day?</label><div className="cardio-pref-chips mobility-pref-chips"><button type="button" className={wantsMobility===true?'active':''} onClick={()=>{setWantsMobility(true);fetchScheduleSuggestions(wantsCardio,true);}}>Yes</button><button type="button" className={wantsMobility===false?'active':''} onClick={()=>{setWantsMobility(false);fetchScheduleSuggestions(wantsCardio,false);}}>No</button><button type="button" className={wantsMobility===null?'active':''} onClick={()=>{setWantsMobility(null);fetchScheduleSuggestions(wantsCardio,null);}}>Let AI decide</button></div>{scheduleLoading&&<p className="muted">Updating schedule options…</p>}<div className="schedule-options">{scheduleOptions.map((opt:any)=><button key={opt.id} type="button" className={`schedule-option-card${selectedScheduleId===opt.id?' selected':''}${scheduleRecommendedId===opt.id?' recommended':''}`} onClick={()=>applyScheduleOption(opt)}><div className="schedule-option-head"><b>{opt.label}</b>{scheduleRecommendedId===opt.id&&<span className="badge">Recommended</span>}</div><p className="muted">{opt.description}</p><div className="schedule-day-chips">{opt.days.map((d:string)=><span key={d} className="schedule-day-chip">{d} {opt.day_types[d]}</span>)}</div></button>)}</div>{selectedScheduleId&&<><button type="button" className="btn small secondary" style={{marginTop:8}} onClick={()=>setScheduleManualOverride(v=>!v)}>{scheduleManualOverride?'Hide manual edit':'Customize days'}</button>{scheduleManualOverride&&<><label style={{marginTop:10}}>Workout days</label><div className="tabs">{DAYS.map(d=><button key={d} type="button" className={days.includes(d)?'active':''} onClick={()=>{const next=days.includes(d)?days.filter((x:string)=>x!==d):[...days,d].sort((a,b)=>DAYS.indexOf(a)-DAYS.indexOf(b)); setDays(next); const dt={...dayTypes}; if(!next.includes(d))delete dt[d]; else if(!dt[d])dt[d]='Full Body'; setDayTypes(dt);}}>{d}</button>)}</div>{days.map((d:string)=><div key={d}><label>{d} type</label><select value={dayTypes[d]||'Full Body'} onChange={e=>setDayTypes({...dayTypes,[d]:e.target.value})}>{DAY_TYPE_OPTIONS.map((t:string)=><option key={t}>{t}</option>)}</select></div>)}</>}</>}<div className="wizard-nav"><button type="button" className="btn secondary" onClick={()=>setSetupStep('goals')}>Back</button><button type="button" className="btn" onClick={goToReviewStep} disabled={scheduleLoading||!days.length}>Next: Review &amp; generate</button></div></>}{setupStep==='review'&&<><div className="schedule-review-summary"><label>Goals (edit anytime)</label><textarea className="ai-prompt-input ai-prompt-input-lg" rows={6} value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} disabled={aiGenerating}/><label>Weekly schedule</label><div className="schedule-day-chips">{days.map((d:string)=><span key={d} className="schedule-day-chip">{d} {dayTypes[d]||'Full Body'}</span>)}</div></div><label>New program name</label><input value={programName} onChange={e=>setProgramName(e.target.value)}/><label>Weeks</label><input type="number" value={weeks} onChange={e=>setWeeks(Number(e.target.value))}/><label>Muscle focus (optional)</label><p className="muted">Adds ~10–15 working sets per week for each selected muscle group.</p><div className="focus-muscle-grid">{FOCUS_MUSCLES.map((m:string)=><button type="button" key={m} className={`focus-chip${focusMuscles.includes(m)?' active':''}`} onClick={()=>setFocusMuscles(focusMuscles.includes(m)?focusMuscles.filter((x:string)=>x!==m):[...focusMuscles,m])}>{m}</button>)}</div>{focusMuscles.length>0&&<p className="muted">{focusVolumeSummary(focusMuscles,weeks,days.length)}{Object.keys(focusVolumeEst).length?` · Est. weekly sets: ${Object.entries(focusVolumeEst).map(([k,v])=>`${k} ${v}`).join(', ')}`:''}</p>}{aiGenError&&<div className="program-ai-error"><b>Generation issue:</b> {aiGenError}<div className="actions" style={{marginTop:8}}><button type="button" className="btn small secondary" onClick={()=>{setBugOpen(true);setBugTitle('AI plan generation failed');setBugDescription(aiGenError);}}>Report this bug</button></div></div>}{(aiSummary||aiCoachingNotes)&&<div className="program-ai-summary-box"><label>AI plan write-up</label>{aiSummary&&<p className="program-ai-summary">{aiSummary}</p>}{aiCoachingNotes&&<><label style={{marginTop:10}}>Coaching notes</label><p className="program-ai-coaching">{aiCoachingNotes}</p></>}</div>}<label className="remember-row"><input type="checkbox" checked={includeCooldown} onChange={e=>setIncludeCooldown(e.target.checked)}/> Include cooldown stretches</label><button className="btn green full" style={{marginTop:10}} onClick={generateWithAi} disabled={aiGenerating}>{aiGenerating?'Generating with AI…':'Generate with AI'}</button><button className="btn secondary full" style={{marginTop:10}} onClick={generate} disabled={aiGenerating}>Quick template program</button><p className="muted" style={{marginTop:8}}>AI plans vary exercises week to week. Template fallback uses built-in supersets when you skip AI.</p><div className="wizard-nav"><button type="button" className="btn secondary" onClick={()=>setSetupStep('schedule')}>Back</button></div></>}</>}{trainingSubNav!=='setup'&&!showProgramSetup&&program&&<p className="muted">Active program: <b>{program.name}</b></p>}{trainingSubNav!=='setup'&&!showProgramSetup&&!program&&<p className="muted">No program yet. Open Program Setup tab to generate one.</p>}</div>;

 const profileFields=(compact=false)=><>
  <label>Display name</label>
  <input value={profileDraft.display_name} onChange={e=>setProfileDraft({...profileDraft,display_name:e.target.value})} placeholder="Your name"/>
  <div className="row"><div><label>Height (in)</label><input type="number" min="0" step="0.1" value={profileDraft.height_inches} onChange={e=>setProfileDraft({...profileDraft,height_inches:e.target.value})} placeholder="70"/></div><div><label>Weight (lb)</label><input type="number" min="0" step="0.1" value={profileDraft.weight_lbs} onChange={e=>setProfileDraft({...profileDraft,weight_lbs:e.target.value})} placeholder="185"/></div></div>
  <div className="row"><div><label>Birth year</label><input type="number" min="1900" max="2100" value={profileDraft.birth_year} onChange={e=>setProfileDraft({...profileDraft,birth_year:e.target.value})} placeholder="1990"/></div><div><label>Sex</label><select value={profileDraft.sex} onChange={e=>setProfileDraft({...profileDraft,sex:e.target.value})}><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></div></div>
  <div className="row"><div><label>Experience</label><select value={profileDraft.experience_level} onChange={e=>setProfileDraft({...profileDraft,experience_level:e.target.value})}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div><div><label>Primary goal</label><select value={profileDraft.primary_goal} onChange={e=>setProfileDraft({...profileDraft,primary_goal:e.target.value})}><option value="general_health">General health</option><option value="strength">Strength</option><option value="muscle">Build muscle</option><option value="fat_loss">Fat loss</option></select></div></div>
  <label>Units preference</label>
  <select value={profileDraft.units_preference} onChange={e=>setProfileDraft({...profileDraft,units_preference:e.target.value})}><option value="imperial">Imperial (lb, in)</option><option value="metric">Metric (future display)</option></select>
  {equipmentChips(normalizeEquipmentList(profileDraft.available_equipment),(id)=>setProfileDraft({...profileDraft,available_equipment:toggleEquipmentList(normalizeEquipmentList(profileDraft.available_equipment),id)}))}
  {!compact&&<p className="muted">Height and weight help personalize training and progress tracking.</p>}
 </>;

 if(!authReady||(session&&profileLoading))return <div className="auth-shell"><div className="login"><div className="panel auth-loading"><div className="brand">Built<span>IQ</span></div><p className="muted">Loading your account...</p></div></div></div>;
 if(!session)return <div className="auth-shell"><header className="header"><div><div className="brand">Built<span>IQ</span></div><div className="muted">Training · nutrition · progress</div></div></header><div className="login"><div className="panel auth-panel"><div className="tabs auth-tabs"><button className={authMode==='signin'?'active':''} onClick={()=>setAuthMode('signin')}>Sign In</button><button className={authMode==='signup'?'active':''} onClick={()=>setAuthMode('signup')}>Create Account</button></div>{authMode==='signin'?<form onSubmit={e=>{e.preventDefault();signIn();}}><label htmlFor="signin-email">Email</label><input id="signin-email" name="email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/><label htmlFor="signin-password">Password</label><input id="signin-password" name="password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/><label className="remember-row"><input type="checkbox" checked={rememberEmail} onChange={e=>setRememberEmail(e.target.checked)}/> Remember email on this device</label><button className="btn full" style={{marginTop:10}} type="submit">Sign In</button><p className="muted">Use your browser&apos;s password manager to save your password.</p></form>:<form onSubmit={e=>{e.preventDefault();signUp();}}><label htmlFor="signup-email">Email</label><input id="signup-email" name="email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/><label htmlFor="signup-password">Password</label><input id="signup-password" name="password" type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/><label htmlFor="signup-confirm">Confirm password</label><input id="signup-confirm" name="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/><h3 style={{marginTop:14}}>Your profile</h3>{profileFields()}<label className="remember-row"><input type="checkbox" checked={rememberEmail} onChange={e=>setRememberEmail(e.target.checked)}/> Remember email on this device</label><button className="btn green full" style={{marginTop:10}} type="submit" disabled={profileSaving}>{profileSaving?'Creating account...':'Create Account'}</button></form>}</div></div></div>;
 if(profileNeedsSetup(profile))return <div className="auth-shell"><header className="header"><div className="brand">Built<span>IQ</span></div><button className="btn secondary" onClick={signOut}>Sign Out</button></header><div className="login"><div className="panel auth-panel"><h2>Complete your profile</h2><p className="muted">A few details help BuiltIQ personalize workouts and track progress.</p>{profileFields()}<button className="btn green full" style={{marginTop:10}} onClick={createProfile} disabled={profileSaving}>{profileSaving?'Saving...':'Continue to BuiltIQ'}</button></div></div></div>;

 return <>
 <header className="app-header">
  <div className="header-top">
   <div><div className="brand">Built<span>IQ</span></div><div className="muted header-sub">{displayName} · {mode==='team'?(activeTeam?.name||'Team'):'Personal'}</div></div>
   <button className="btn secondary" onClick={signOut}>Sign Out</button>
  </div>
  <nav className="topnav">{NAV.map(n=><button key={n} type="button" className={appNav===n?'active':''} onClick={()=>goNav(n)}>{n}</button>)}</nav>
 </header>
 <div className="app-shell" key={session?.user?.id||'signed-out'}>
 <main className="main page-main">
  {appNav==='Dashboard'&&<section className="dashboard"><div className="dash-hero"><h1>{greeting}, {displayName||'there'}</h1><p className="muted">Your wellness dashboard for {formatDisplayDate(today())}.</p></div><div className="dash-grid"><div className="dash-card dash-featured"><div className="dash-card-head"><h2>Today&apos;s Workout</h2><span className="badge">{todayDayLabel}</span></div>{todayWorkout?<><p className="dash-title">{todayWorkout.day_label} · {todayWorkout.workout_type}</p><p className="muted">Week {calendarWeek} · {workoutExerciseCount(todayWorkout)} exercises planned</p><div className="actions" style={{marginTop:10}}><button className="btn green" onClick={()=>{setActiveWorkout(todayWorkout.id);setWeek(calendarWeek);setLogDate(today());setTrainingSubNav('personal');setAppNav('Training');}}>Start Training</button></div></>:program?<><p className="muted">No workout scheduled for {todayDayLabel} this week.</p><button className="btn secondary" onClick={()=>goNav('Training')}>View program</button></>:<><p className="muted">Create a program to see today&apos;s workout.</p><button className="btn green" onClick={()=>{setTrainingSubNav('setup');setShowProgramSetup(true);setAppNav('Training');}}>Set up program</button></>}</div>{teams.length>0&&activeTeam&&<div className="dash-card dash-accent"><div className="dash-card-head"><h2>Team Compliance</h2><span className="badge">{teamCompliancePct}%</span></div><p className="dash-title">{activeTeam.name}</p><div className="dash-metrics"><div><b>{teamActiveCount}/{members.length||0}</b><span className="muted">Active this week</span></div><div><b>{teamTotalSets}</b><span className="muted">Team sets</span></div></div><button className="btn secondary" style={{marginTop:10}} onClick={()=>goNav('Team')}>View team</button></div>}<div className="dash-card"><div className="dash-card-head"><h2>Weekly Progress</h2><span className="badge">{weeklyWorkoutDays} days</span></div><div className="dash-metrics"><div><b>{weeklySetCount}</b><span className="muted">Sets this week</span></div><div><b>{todaySetCount}</b><span className="muted">Sets today</span></div></div><button className="btn secondary" style={{marginTop:10}} onClick={()=>goNav('Progress')}>View history</button></div><div className="dash-card"><div className="dash-card-head"><h2>Nutrition</h2><span className="badge">Soon</span></div><p className="muted">Daily macros, meals, and hydration will appear here.</p><div className="dash-placeholder"><span>Calories —</span><span>Protein —</span><span>Carbs —</span><span>Fats —</span></div></div><div className="dash-card dash-accent"><div className="dash-card-head"><h2>AI Coach Insight</h2><span className="badge">Preview</span></div><p className="muted">Personalized coaching based on your training, nutrition, and recovery is coming soon.</p><p className="dash-insight">&ldquo;Stay consistent this week. Log today&apos;s sets to build your progress baseline.&rdquo;</p></div></div></section>}
  {appNav==='Nutrition'&&<section><div className="card"><h2>Nutrition</h2><p className="muted">Macro tracking and meal logging will live here in a future release.</p></div></section>}
  {appNav==='AI Coach'&&<section><div className="card dash-accent"><h2>AI Coach</h2><p className="muted">Your BuiltIQ wellness coach will analyze workouts, nutrition, and recovery to give safe, practical guidance.</p><p className="dash-insight">Coming soon: readiness check-ins, workout adjustments, and weekly coaching summaries.</p></div></section>}
  {appNav==='Progress'&&<section><div className="card"><div className="topline" style={{justifyContent:'space-between'}}><h2>Progress</h2><button className="btn small secondary" onClick={loadProgressLogs}>Refresh</button></div><p className="muted">Saved lift history uses snapshots, so past workouts stay accurate even if the program template changes later.</p></div><ProgressInsights logs={progressLogs} weightUnit={progressWeightUnit}/><div className="card"><h2>Workout history</h2><p className="muted">Completed sets grouped by training day.</p></div>{progressDays.length===0&&<div className="card"><p className="muted">No completed sets yet. Log a workout in Training to build history.</p></div>}{progressDays.map((day:any)=><div className="card" key={day.date}><h3>{formatDisplayDate(day.date)}{day.label?` · ${day.label}`:''}{day.type?` · ${day.type}`:''}</h3>{Object.values(day.rows.reduce((acc:any,row:any)=>{const name=logExerciseName(row);if(!acc[name]) acc[name]=[]; acc[name].push(row);return acc;},{})).map((rows:any)=>{const label=logExerciseName(rows[0]);const exType=(rows[0].snapshot_exercise_type||'strength') as any;return <div key={label} className="history-row"><b>{label}</b><span className="muted">{rows.sort((a:any,b:any)=>(logSetNumber(a)-logSetNumber(b))).map((r:any)=>formatLogSummary(r,exType)).join(' · ')}</span></div>})}</div>)}</section>}
  {appNav==='Team'&&<section>{teams.length===0?<div className="card"><h2>Teams</h2><p className="muted">Create or join a team in Settings, then manage programs and track compliance here.</p><button className="btn secondary" onClick={()=>goNav('Settings')}>Go to Settings</button></div>:<>{coachTeamHeader}{canCoachView()?<><CoachTeamDashboard teamName={activeTeam?.name||'Team'} overview={coachSnapshot?.overview||emptyCoachOverview} onRefresh={()=>{loadMembers();loadMemberStats();loadMemberAssignments();loadCoachTeamSnapshot();}}/>{teamRosterPanel}</>:<>{teamPlanPanel}{teamCompliancePanel}{teamRosterLegacy}</>}</>}</section>}
  {appNav==='Settings'&&<section><div className="card"><div className="topline" style={{justifyContent:'space-between'}}><h2>Profile</h2><button className="btn small green" onClick={()=>saveProfile(true)} disabled={profileSaving}>{profileSaving?'Saving...':'Save Profile'}</button></div><p className="muted">Update your account details used across BuiltIQ.</p>{profileFields(true)}</div><div className="card"><div className="topline" style={{justifyContent:'space-between'}}><h2>My Exercise Catalog</h2><div className="actions">{activeUserCatalog.length>0&&<button className="btn small red" onClick={archiveAllCustomExercises}>Remove all custom exercises</button>}<button className="btn small secondary" onClick={loadCatalog}>Refresh</button></div></div><p className="muted">Custom exercises are private to your account. Built-in exercises with form guides are used in workout search and AI program generation.</p>{activeUserCatalog.length===0&&archivedUserCatalog.length===0&&<p className="muted">No custom exercises yet. Create one from Training or below.</p>}{activeUserCatalog.map((item:any)=><div key={item.id} className="catalog-row">{catalogEditId===item.id?<div className="catalog-edit-grid"><input value={catalogEditDraft.name} onChange={e=>setCatalogEditDraft({...catalogEditDraft,name:e.target.value})} placeholder="Name"/><select value={catalogEditDraft.category} onChange={e=>setCatalogEditDraft({...catalogEditDraft,category:e.target.value})}><option value="warmup">Warmup</option><option value="strength">Strength</option><option value="mobility">Mobility</option><option value="plyometric">Plyometric</option><option value="other">Other</option></select><input value={catalogEditDraft.muscle_group} onChange={e=>setCatalogEditDraft({...catalogEditDraft,muscle_group:e.target.value})} placeholder="Muscle group"/><input value={catalogEditDraft.equipment} onChange={e=>setCatalogEditDraft({...catalogEditDraft,equipment:e.target.value})} placeholder="Equipment"/><input value={catalogEditDraft.movement_pattern} onChange={e=>setCatalogEditDraft({...catalogEditDraft,movement_pattern:e.target.value})} placeholder="Movement pattern"/><div className="actions"><button className="btn small green" onClick={saveCustomExerciseEdit}>Save</button><button className="btn small secondary" onClick={()=>setCatalogEditId(null)}>Cancel</button></div></div>:<><div><b>{item.name}</b><div className="muted">{item.muscle_group||'Muscle'}{item.equipment?` · ${item.equipment}`:''}{item.movement_pattern?` · ${item.movement_pattern}`:''}</div></div><div className="actions"><button className="btn small secondary" onClick={()=>{setCatalogEditId(item.id); setCatalogEditDraft({name:item.name,category:item.category||'strength',muscle_group:item.muscle_group||'',equipment:item.equipment||'',movement_pattern:item.movement_pattern||''});}}>Edit</button><button className="btn small red" onClick={()=>archiveCustomExercise(item,true)}>Archive</button></div></>}</div>)}{archivedUserCatalog.length>0&&<><h3 style={{marginTop:12}}>Archived</h3>{archivedUserCatalog.map((item:any)=><div key={item.id} className="catalog-row archived"><div><b>{item.name}</b><div className="muted">Archived · not shown in workout search</div></div><button className="btn small secondary" onClick={()=>archiveCustomExercise(item,false)}>Restore</button></div>)}</>}</div><div className="card"><h2>Create Custom Exercise</h2><div className="catalog-edit-grid"><input value={customDraft.name} onChange={e=>setCustomDraft({...customDraft,name:e.target.value})} placeholder="Exercise name"/><select value={customDraft.category} onChange={e=>setCustomDraft({...customDraft,category:e.target.value})}><option value="warmup">Warmup</option><option value="strength">Strength</option><option value="mobility">Mobility</option><option value="plyometric">Plyometric</option><option value="other">Other</option></select><input value={customDraft.muscle_group} onChange={e=>setCustomDraft({...customDraft,muscle_group:e.target.value})} placeholder="Muscle group"/><input value={customDraft.equipment} onChange={e=>setCustomDraft({...customDraft,equipment:e.target.value})} placeholder="Equipment"/><input value={customDraft.movement_pattern} onChange={e=>setCustomDraft({...customDraft,movement_pattern:e.target.value})} placeholder="Movement pattern"/></div><button className="btn green" style={{marginTop:8}} onClick={()=>createCustomExercise(customDraft.category||'strength', false)}>Save to My Catalog</button></div><div className="card"><h2>Teams</h2><p className="muted">Shared programs and team roles. Owner/editor can edit plans; members log only.</p><div className="actions"><button className="btn secondary" onClick={createTeam}>Create Team</button><button className="btn secondary" onClick={joinTeam}>Join Team</button><button className="btn secondary" onClick={loadMembers}>Refresh Members</button></div>{activeTeam&&<p className="muted" style={{marginTop:8}}>Active: <b>{activeTeam.name}</b> · Invite: <b>{activeTeam.invite_code}</b> · Role: <b>{activeTeam.my_role}</b></p>}{teams.length===0&&<p className="muted" style={{marginTop:8}}>You are not on any team yet.</p>}{members.length>0&&<><h3 style={{marginTop:12}}>Members</h3>{members.map((m:any)=><div key={m.id} className="topline" style={{justifyContent:'space-between',marginTop:6}}><span>{m.display_name||m.user_id.slice(0,6)}</span><select disabled={!isOwner()||m.user_id===session.user.id} value={m.role} onChange={e=>setRole(m,e.target.value)} style={{maxWidth:115}}><option>owner</option><option>editor</option><option>member</option></select></div>)}</>}</div></section>}
  {appNav==='Training'&&<section>
    <div className="tabs training-subnav"><button type="button" className={trainingSubNav==='personal'?'active':''} onClick={()=>{setTrainingSubNav('personal');setMemberDashboard(null);setViewingMember(null);}}>Personal Training</button><button type="button" className={trainingSubNav==='team'?'active':''} onClick={()=>{setTrainingSubNav('team');if(teams.length&&!selectedTeamId)setSelectedTeamId(teams[0].id);loadMembers();loadMemberStats();loadMemberAssignments();}}>Team Training</button><button type="button" className={trainingSubNav==='setup'?'active':''} onClick={()=>{setTrainingSubNav('setup');setShowProgramSetup(true);setMemberDashboard(null);setViewingMember(null);}}>Program Setup</button></div>
    {trainingSubNav==='setup'&&programSetupPanel}
    {trainingSubNav==='team'&&teams.length===0&&<div className="card"><p className="muted">No teams yet. Create or join a team in Settings.</p></div>}
    {trainingSubNav==='team'&&teams.length>0&&canCoachView()&&!memberDashboard&&!viewingMember&&<>{coachTeamHeader}<CoachTeamDashboard teamName={activeTeam?.name||'Team'} overview={coachSnapshot?.overview||emptyCoachOverview} onRefresh={()=>{loadMembers();loadMemberStats();loadMemberAssignments();loadCoachTeamSnapshot();}}/>{teamRosterPanel}</>}
    {trainingSubNav==='team'&&teams.length>0&&!canCoachView()&&!viewingMember&&<TeamAthleteView teamName={activeTeam?.name||'Team'} trainingSource={(activeTeam?.training_source||'team')==='personal'?'personal':'team'} programName={program?.name} todayWorkoutLabel={athleteTodayWorkout?`${athleteTodayWorkout.day_label} · ${athleteTodayWorkout.workout_type}`:undefined} onSetTrainingSource={setMyTrainingSource} onStartWorkout={()=>{setTrainingSubNav('personal');setMemberDashboard(null);setViewingMember(null);}}/>}
    {trainingSubNav==='team'&&memberDashboard&&memberDashboard.user_id!==session.user.id&&!viewingMember&&<AthleteCoachDashboard member={memberDashboard} program={memberDashProgram} assignment={memberAssignment} todayWorkout={memberTodayWorkout} todayStatus={memberWorkoutStatus} lastWorkoutDate={memberDashLastDate} setsThisWeek={memberStats[memberDashboard.user_id]?.sets||0} daysActiveThisWeek={memberStats[memberDashboard.user_id]?.days||0} progressLogs={memberDashProgressLogs} weightUnit={profileDraft?.units_preference==='metric'?'kg':'lb'} assignDraft={assignDraft} teamPrograms={coachTeamPrograms.length?coachTeamPrograms:programs} logDate={logDate} week={week} canAssign={canCoachView()} onBack={()=>setMemberDashboard(null)} onOpenWorkout={()=>openMemberView(memberDashboard)} onAssignDraftChange={setAssignDraft} onApplyAssignment={()=>assignMemberProgram(memberDashboard,assignDraft.type,assignDraft.programId||null,assignDraft.notes)}/>}
    {(trainingSubNav==='personal'||(trainingSubNav==='team'&&(viewingMember||(!memberDashboard&&!canCoachView()))))&&<>
    {viewingMember&&viewingMember.user_id!==session.user.id&&<div className="card viewing-banner"><div className="topline" style={{justifyContent:'space-between'}}><div><h2>{viewingMember.display_name||'Member'}&apos;s workout</h2><p className="muted">{assignmentTypeLabel(memberAssignments[viewingMember.user_id]?.assignment_type||(viewingMember.training_source||'team')==='personal'?'personal':'team')} · {program?.name||'No program'}{canCoachView()?' · coach can log':''}</p></div><button className="btn small secondary" onClick={closeMemberView}>Back</button></div></div>}
    {!viewingMember&&canEdit()&&<div className="applybox"><label>When changing workout structure, apply edits to:</label><select value={applyScope} onChange={e=>setApplyScope(e.target.value as any)}><option value="future">This week and all future weeks</option><option value="current">This workout only</option></select></div>}
    <div className="stats">{trainingModeStat}<div className="stat"><span className="muted">Week</span><b>{week}</b></div><div className="stat"><span className="muted">Sets</span><b>{planned}</b></div><div className="stat"><span className="muted">Logged</span><b>{logged}</b></div></div>
    {program?.focus_muscles?.length>0&&<p className="muted">Program focus: <b>{program.focus_muscles.join(', ')}</b></p>}{(program?.program_summary||program?.coaching_notes||aiSummary||aiCoachingNotes)&&<div className="program-ai-summary-box training-program-notes"><label>AI program notes</label>{(program?.program_summary||aiSummary)&&<p className="program-ai-summary">{program?.program_summary||aiSummary}</p>}{(program?.coaching_notes||aiCoachingNotes)&&<><label style={{marginTop:10}}>Coaching notes</label><p className="program-ai-coaching">{program?.coaching_notes||aiCoachingNotes}</p></>}</div>}
    <div className="row"><div><label>Date</label><DateInput value={logDate} onChange={onLogDateChange}/></div><div><label>Week</label><select value={week} onChange={e=>onWeekChange(Number(e.target.value))}>{Array.from({length:program?.weeks||weeks},(_,i)=><option key={i+1} value={i+1}>Week {i+1}{program?` · ${weekRangeLabel(resolveProgramStartDate(program),i+1)}`:''}</option>)}</select></div>{program&&<div><label>Program start</label><DateInput value={resolveProgramStartDate(program)} onChange={updateProgramStartDate} disabled={!canEdit()}/></div>}</div>
    {program&&<p className="muted" style={{marginTop:4}}>Week {week} covers {weekRangeLabel(resolveProgramStartDate(program),week)}. Logging on {formatDisplayDate(logDate)} ({dayLabelFromYmd(logDate)}).</p>}
    <div className="tabs">{(program?.st_workouts||[]).filter((w:any)=>w.week===week).sort((a:any,b:any)=>a.day_order-b.day_order).map((w:any)=><button key={w.id} className={workout?.id===w.id?'active':''} onClick={()=>onSelectWorkoutDay(w)}>{w.day_label} · {w.workout_type}<span className="muted" style={{marginLeft:6}}>{formatDisplayDate(dateForWeekAndDay(resolveProgramStartDate(program),week,w.day_label))}</span></button>)}</div>
    {!program&&<div className="card"><h2>No program yet</h2><p className="muted">Open the Program Setup tab to generate your first plan.</p><button className="btn secondary" onClick={()=>setTrainingSubNav('setup')}>Program Setup</button></div>}
    {workout&&<div className="card"><div className="topline" style={{justifyContent:'space-between'}}><h2>{workout.day_label} · {workout.workout_type}</h2><span className="muted">{workoutExerciseCount(workout)} exercises · Week {week}</span></div></div>}
    {workout&&SECTIONS.map((sec:any)=>{
      const exercises=sectionExercises(workout,sec.id);
      const blocks=groupSectionBlocks(exercises);
      return <div className={`section-block${sec.id==='cooldown'?' section-cooldown':''}`} key={sec.id}><div className="section-head"><h2>{sec.label}</h2><span className="badge">{exercises.length}</span></div>
      {blocks.map((block:any)=>block.type==='superset'
        ?<div className="superset-block" key={block.groupId}><div className="superset-head"><div className="superset-head-left"><span className="superset-tag">Superset</span>{canEdit()?<input className="superset-label-input" defaultValue={block.label||'Superset'} onBlur={e=>{if(e.target.value.trim()&&e.target.value!==block.label)renameSuperset(block.exercises[0],e.target.value);}}/>:<span className="badge superset-badge">{block.label||'Superset'}</span>}</div><div className="superset-head-actions"><span className="muted">{block.exercises.length} exercises</span>{canEdit()&&block.exercises.length<3&&<button className="btn small secondary" onClick={()=>openAddExercisePanel(sec.id,block.groupId)}>+ Add</button>}{canEdit()&&<button className="btn small secondary" onClick={()=>breakSuperset(block.exercises[0])}>Break</button>}</div></div><div className="superset-exercises">{block.exercises.map((ex:any)=>renderExerciseCard(ex,true))}</div></div>
        :renderExerciseCard(block.exercises[0]))}
      {canEdit()&&<div className="section-add-row"><button type="button" className="btn secondary" onClick={()=>openAddExercisePanel(sec.id)}>+ Add Exercise</button></div>}
      {!exercises.length&&!canEdit()&&<p className="muted section-empty">No {sec.label.toLowerCase()} exercises.</p>}
      </div>;
    })}
    </>}
  </section>}
  {addExercisePanel&&<div className="panel-overlay" onClick={()=>setAddExercisePanel(null)}><div className="add-exercise-panel card" onClick={e=>e.stopPropagation()}><div className="topline" style={{justifyContent:'space-between'}}><h2>{addExercisePanel.replaceTarget?'Replace exercise':'Add Exercise'} · {addPanelSectionLabel(addExercisePanel.section)}</h2><button type="button" className="btn small secondary" onClick={()=>setAddExercisePanel(null)}>Cancel</button></div>
    {addExercisePanel.step==='search'&&<>{addExercisePanel.replaceTarget&&<p className="muted" style={{marginBottom:8}}>Replacing <b>{addExercisePanel.replaceTarget.name}</b> — pick a catalog exercise. Sets and logs are kept.</p>}{pendingGroupId&&!addExercisePanel.replaceTarget&&<p className="muted" style={{marginBottom:8}}>Building superset ({pendingGroupInfo?.count||1}/3) — pick the next exercise</p>}<input className="typeahead-input catalog-search-input" placeholder="Search 800+ exercises (name, muscle, equipment…)" value={addExercisePanel.query||''} onChange={e=>setAddExercisePanel({...addExercisePanel,query:e.target.value})} autoFocus/><div className="catalog-search-filters"><select value={addExercisePanel.filters?.muscle||''} onChange={e=>setAddExercisePanel({...addExercisePanel,filters:{...(addExercisePanel.filters||emptyAddPanelFilters()),muscle:e.target.value}})} aria-label="Filter by muscle"><option value="">All muscles</option>{(panelFilterOptions?.muscles||[]).map((m:string)=><option key={m} value={m}>{m}</option>)}</select><select value={addExercisePanel.filters?.equipment||''} onChange={e=>setAddExercisePanel({...addExercisePanel,filters:{...(addExercisePanel.filters||emptyAddPanelFilters()),equipment:e.target.value}})} aria-label="Filter by equipment"><option value="">All equipment</option>{(panelFilterOptions?.equipment||[]).map((eq:string)=><option key={eq} value={eq}>{eq}</option>)}</select><select value={addExercisePanel.filters?.exerciseType||''} onChange={e=>setAddExercisePanel({...addExercisePanel,filters:{...(addExercisePanel.filters||emptyAddPanelFilters()),exerciseType:e.target.value}})} aria-label="Filter by type"><option value="">All types</option>{(panelFilterOptions?.exerciseTypes||[]).map((t:string)=><option key={t} value={t}>{t}</option>)}</select></div>{hasEquipmentFilter(equipmentForSearch)&&<p className="muted catalog-search-meta">Your equipment filter is active: {equipmentFilterLabel(equipmentForSearch)}</p>}{panelHasSearch&&<p className="muted catalog-search-meta">Showing {panelResults.length}{panelMatchCount>panelResults.length?` of ${panelMatchCount}`:''} match{panelMatchCount===1?'':'es'}</p>}<div className="typeahead-menu panel-results catalog-search-results">{panelResults.length?panelResults.map((item:any)=><button type="button" key={item.id} className="typeahead-item catalog-search-item" onClick={()=>pickExerciseForPanel(item)}>{getExerciseThumb(item)&&<img className="catalog-search-thumb" src={getExerciseThumb(item)||''} alt="" loading="lazy" referrerPolicy="no-referrer"/>}<div className="catalog-search-body"><b>{item.name}</b><span className="muted">{catalogResultMeta(item)}</span></div></button>):<div className="typeahead-empty muted">{panelHasSearch?'No matches — try a different search or filter':'Type or filter to search the catalog'}</div>}</div>{panelHasSearch&&<button type="button" className="btn small secondary" style={{marginTop:8}} onClick={()=>setAddExercisePanel({...addExercisePanel,query:'',filters:emptyAddPanelFilters()})}>Clear search</button>}{!addExercisePanel.replaceTarget&&<button type="button" className="btn small secondary" style={{marginTop:8}} onClick={()=>setAddExercisePanel({...addExercisePanel,step:'custom'})}>+ Create custom exercise</button>}</>}
    {addExercisePanel.step==='custom'&&<><div className="catalog-edit-grid"><input value={addExercisePanel.custom.name} onChange={e=>setAddExercisePanel({...addExercisePanel,custom:{...addExercisePanel.custom,name:e.target.value}})} placeholder="Exercise name"/><input value={addExercisePanel.custom.muscle_group} onChange={e=>setAddExercisePanel({...addExercisePanel,custom:{...addExercisePanel.custom,muscle_group:e.target.value}})} placeholder="Muscle group"/></div><div className="actions" style={{marginTop:8}}><button type="button" className="btn small green" onClick={createCustomInPanel}>Save & continue</button><button type="button" className="btn small secondary" onClick={()=>setAddExercisePanel({...addExercisePanel,step:'search'})}>Back</button></div></>}
    {addExercisePanel.step==='configure'&&addExercisePanel.picked&&<><div className="panel-picked"><b>{addExercisePanel.picked.name}</b><span className="muted">{catalogResultMeta(addExercisePanel.picked)}</span></div>{getExerciseThumb(addExercisePanel.picked)&&<img className="panel-picked-img" src={getExerciseThumb(addExercisePanel.picked)||''} alt={addExercisePanel.picked.name} referrerPolicy="no-referrer"/>}{hasExerciseGuide(addExercisePanel.picked)&&<button type="button" className="btn small secondary" style={{marginTop:8}} onClick={()=>setExerciseGuide(getExerciseGuidePayload(addExercisePanel.picked,addExercisePanel.picked.name))}>{getExerciseGuidePayload(addExercisePanel.picked,addExercisePanel.picked.name)?.hasVideo?'Watch form':'Preview form guide'}</button>}{addExercisePanel.picked.instructions&&<div className="panel-instructions">{addExercisePanel.picked.instructions}</div>}<label>Exercise type</label><div className="tabs"><button type="button" className={addExercisePanel.config.mode==='normal'?'active':''} onClick={()=>{setPendingSupersetGroup({...pendingSupersetGroup,[addExercisePanel.section]:null});setAddExercisePanel({...addExercisePanel,config:{...addExercisePanel.config,mode:'normal',supersetGroupId:null}});}}>Normal</button><button type="button" className={addExercisePanel.config.mode==='superset'?'active':''} onClick={()=>setAddExercisePanel({...addExercisePanel,config:{...addExercisePanel.config,mode:'superset',supersetGroupId:addExercisePanel.config.supersetGroupId||pendingSupersetGroup[addExercisePanel.section]||'__new__'}})}>Superset</button></div>
    {addExercisePanel.config.mode==='superset'&&<><label>Superset group</label><select value={addExercisePanel.config.supersetGroupId||'__new__'} onChange={e=>setAddExercisePanel({...addExercisePanel,config:{...addExercisePanel.config,supersetGroupId:e.target.value}})}><option value="__new__">Create new superset</option>{panelSupersetGroups.map((g:any)=><option key={g.id} value={g.id}>{g.label} ({g.count}/3)</option>)}</select></>}
    <div className="row"><div><label>Sets</label><input type="number" min="1" max="10" value={addExercisePanel.config.setCount} onChange={e=>setAddExercisePanel({...addExercisePanel,config:{...addExercisePanel.config,setCount:Number(e.target.value)}})}/></div><div><label>Target reps</label><input value={addExercisePanel.config.targetReps} onChange={e=>setAddExercisePanel({...addExercisePanel,config:{...addExercisePanel.config,targetReps:e.target.value}})} placeholder="8-12"/></div></div><label>Starting weight (optional)</label><input value={addExercisePanel.config.targetWeight} onChange={e=>setAddExercisePanel({...addExercisePanel,config:{...addExercisePanel.config,targetWeight:e.target.value}})} placeholder="lb"/>
    <div className="actions" style={{marginTop:12}}><button type="button" className="btn green" onClick={confirmAddExercise}>Add Exercise</button><button type="button" className="btn secondary" onClick={()=>setAddExercisePanel({...addExercisePanel,step:'search',picked:null})}>Back</button></div></>}
  </div></div>}
  {exerciseGuide&&<div className="panel-overlay" onClick={()=>setExerciseGuide(null)}><div className="exercise-guide-panel card" onClick={e=>e.stopPropagation()}><div className="topline" style={{justifyContent:'space-between'}}><h2>{exerciseGuide.title}</h2><button type="button" className="btn small secondary" onClick={()=>setExerciseGuide(null)}>Close</button></div>{exerciseGuide.embedUrl&&<div className="guide-embed-wrap"><iframe className="guide-embed" src={exerciseGuide.embedUrl} title={`${exerciseGuide.title} demo`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen/></div>}{!exerciseGuide.embedUrl&&exerciseGuide.videoUrl&&<video className="guide-video" src={exerciseGuide.videoUrl} controls playsInline/>}{exerciseGuide.images?.length>0&&<div className="guide-images">{exerciseGuide.images.map((src:string)=><img key={src} className="guide-image" src={src} alt={exerciseGuide.title} loading="eager" referrerPolicy="no-referrer"/>)}</div>}{exerciseGuide.images?.length>0&&<p className="muted guide-caption">Form photos from the exercise library{exerciseGuide.images.length>1?' (multiple angles)':''}.</p>}{exerciseGuide.instructions&&<><h3 className="guide-section-title">How to perform</h3><div className="panel-instructions guide-instructions">{exerciseGuide.instructions}</div></>}</div></div>}
 {bugOpen&&<div className="panel-overlay" onClick={()=>{if(!bugSending)setBugOpen(false);}}><div className="bug-report-panel card" onClick={e=>e.stopPropagation()}><div className="topline" style={{justifyContent:'space-between'}}><h2>Report a bug</h2><button type="button" className="btn small secondary" onClick={()=>setBugOpen(false)} disabled={bugSending}>Close</button></div><p className="muted">Tell us what broke — screen, steps, and what you expected. BuiltIQ keeps this tied to your account so we can investigate.</p>{bugSentId?<p className="program-ai-summary">Thanks — report saved{bugSentId!=='ok'?` (${String(bugSentId).slice(0,8)}…)`:''}. You can send another anytime.</p>:<><label>Short title (optional)</label><input value={bugTitle} onChange={e=>setBugTitle(e.target.value)} placeholder="e.g. Generate with AI failed on Program Setup"/><label>What happened?</label><textarea className="ai-prompt-input ai-prompt-input-lg" rows={6} value={bugDescription} onChange={e=>setBugDescription(e.target.value)} placeholder="Steps, error message, and what you expected…"/><p className="muted">Context included: {appNav}{trainingSubNav?` / ${trainingSubNav}`:''}{aiGenError?' · last AI error attached':''}</p><button type="button" className="btn green full" style={{marginTop:10}} onClick={submitBugReport} disabled={bugSending}>{bugSending?'Sending…':'Send bug report'}</button></>}</div></div>}
 <button type="button" className="bug-fab" onClick={()=>{setBugOpen(true);setBugSentId('');}} aria-label="Report a bug">Bug</button>
 </main></div></>
}
