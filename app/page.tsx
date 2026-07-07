
'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const NAV=['Dashboard','Training','Nutrition','Progress','AI Coach','Settings'];
const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const SECTIONS=[{id:'warmup',label:'Warm Up / Prep'},{id:'strength',label:'Strength'}];
const SECTION_SORT_BASE:any={warmup:0,strength:100};
const WORKOUT_TEMPLATES:any={
 'Lower Body':{
  warmup:[['Assault Bike or Walk','Cardio',1,'3 min','',''],['World\'s Greatest Stretch','Full Body',1,'5 each','',''],['Glute Bridge','Glutes',2,'12','5','']],
  strength:[['Romanian Deadlift','Hamstrings',4,'6-10','7-8','185'],['Back Squat','Quads',4,'5-8','7-8','185'],{superset:[['Seated Leg Curl','Hamstrings',3,'10-15','8','90'],['Leg Extension','Quads',3,'10-15','8','80']]},{superset:[['Hip Thrust','Glutes',3,'8-12','8','185'],['Walking Lunge','Quads',3,'10-12','8','60']]}]
 },
 'Upper Body':{
  warmup:[['Assault Bike or Walk','Cardio',1,'3 min','',''],['Band Pull-Aparts','Upper Back',2,'15','5',''],['Scap Push-ups','Chest',1,'10','5','']],
  strength:[['Bench Press','Chest',4,'6-10','7-8','155'],{superset:[['Lat Pulldown','Lats',3,'8-12','8','120'],['Face Pull','Rear Delts',3,'12-15','7','30']]},{superset:[['Incline DB Press','Upper Chest',3,'8-12','8','55'],['Cable Row','Mid Back',3,'8-12','8','120']]}]
 },
 'Full Body':{
  warmup:[['Assault Bike or Walk','Cardio',1,'3 min','',''],['Bodyweight Squat','Quads',2,'10','5',''],['Inchworm','Full Body',1,'5','','']],
  strength:[['Romanian Deadlift','Hamstrings',3,'6-10','7-8','185'],['Bench Press','Chest',3,'6-10','7-8','155'],['Lat Pulldown','Lats',3,'8-12','8','120'],['Goblet Squat','Quads',3,'10-12','8','60']]
 }
};
const exerciseSection=(ex:any)=>ex?.section||'strength';
const sectionExercises=(workout:any,section:string)=>(workout?.st_exercises||[]).filter((e:any)=>exerciseSection(e)===section).sort((a:any,b:any)=>(a.sort_order||0)-(b.sort_order||0));
const nextSortOrder=(workout:any,section:string)=>{const list=sectionExercises(workout,section);const base=SECTION_SORT_BASE[section]??100;return list.length?Math.max(...list.map((e:any)=>e.sort_order||0))+1:base;};
const buildPlannedSetRows=(item:any[],section:string)=>{const sets=Number(item[2]||1),reps=item[3]||'',rpe=item[4]||'',wt=item[5]||'';const rows:any[]=[];for(let i=0;i<sets;i++)rows.push({sort_order:i,set_number:i+1,set_type:'working',target_weight:section==='strength'?String(wt||''):'',target_reps:reps,target_rpe:section==='strength'?rpe:'5'});return rows;};
const isSupersetTemplate=(item:any)=>item&&typeof item==='object'&&!Array.isArray(item)&&Array.isArray(item.superset);
const isExerciseTemplate=(item:any)=>Array.isArray(item);
const makeSupersetGroupId=()=>(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`ss-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
const groupSectionBlocks=(exercises:any[])=>{const blocks:any[]=[];(exercises||[]).forEach((ex:any)=>{const gid=ex.superset_group_id;const last=blocks[blocks.length-1];if(gid&&last?.type==='superset'&&last.groupId===gid)last.exercises.push(ex);else if(gid)blocks.push({type:'superset',groupId:gid,exercises:[ex]});else blocks.push({type:'single',exercises:[ex]});});return blocks;};
async function insertTemplateSectionItems(sb:any,workoutId:string,section:string,list:any[],startSort:number,catMap:any){let sort=startSort;for(const item of list){if(isSupersetTemplate(item)){if(item.superset.length<2||item.superset.length>3)continue;const groupId=makeSupersetGroupId();for(const exItem of item.superset){const hit=catMap[String(exItem[0]).toLowerCase()];const{data:e,error}=await sb.from('st_exercises').insert({workout_id:workoutId,section,sort_order:sort,name:exItem[0],muscle_group:hit?.muscle_group||exItem[1],catalog_exercise_id:hit?.id||null,superset_group_id:groupId}).select().single();if(error)return{error};const rows=buildPlannedSetRows(exItem,section);if(rows.length)await sb.from('st_planned_sets').insert(rows.map(r=>({...r,exercise_id:e.id})));sort++;}}else if(isExerciseTemplate(item)){const hit=catMap[String(item[0]).toLowerCase()];const{data:e,error}=await sb.from('st_exercises').insert({workout_id:workoutId,section,sort_order:sort,name:item[0],muscle_group:hit?.muscle_group||item[1],catalog_exercise_id:hit?.id||null,superset_group_id:null}).select().single();if(error)return{error};const rows=buildPlannedSetRows(item,section);if(rows.length)await sb.from('st_planned_sets').insert(rows.map(r=>({...r,exercise_id:e.id})));sort++;}}return{error:null};}
const logExerciseName=(row:any,joinEx?:any)=>String(row.snapshot_exercise_name||joinEx?.name||'').trim();
const logCatalogId=(row:any,joinEx?:any)=>row.snapshot_catalog_exercise_id||joinEx?.catalog_exercise_id||'';
const logSetType=(row:any,joinPs?:any)=>row.snapshot_set_type||joinPs?.set_type||'working';
const logSetNumber=(row:any,joinPs?:any)=>row.snapshot_set_number??joinPs?.set_number??1;
const exerciseHistoryKey=(catalogId:string,name:string)=>catalogId||String(name||'').toLowerCase().trim();
const logHistoryKeys=(row:any)=>{const joinEx=row.st_planned_sets?.st_exercises;const joinPs=row.st_planned_sets;const catalogId=logCatalogId(row,joinEx);const exerciseKey=exerciseHistoryKey(catalogId,logExerciseName(row,joinEx));const setKey=`${exerciseKey}|${logSetType(row,joinPs)}|${logSetNumber(row,joinPs)}`;return {exerciseKey,setKey,catalogId};};
const snapshotForLog=(ex:any,set:any,workoutRef:any)=>({snapshot_exercise_name:ex?.name||'',snapshot_catalog_exercise_id:ex?.catalog_exercise_id||null,snapshot_superset_group_id:ex?.superset_group_id||null,snapshot_muscle_group:ex?.muscle_group||'',snapshot_section:exerciseSection(ex),snapshot_set_type:set?.set_type||'working',snapshot_set_number:set?.set_number||1,snapshot_target_weight:set?.target_weight||'',snapshot_target_reps:set?.target_reps||'',snapshot_target_rpe:set?.target_rpe||'',snapshot_day_label:workoutRef?.day_label||'',snapshot_workout_type:workoutRef?.workout_type||''});
const catalogByName=(items:any[])=>{const map:any={};(items||[]).filter((c:any)=>!c.is_archived).forEach((c:any)=>{map[String(c.name||'').toLowerCase()]=c;});return map;};
const filterCatalog=(items:any[],query:string,limit=12)=>(items||[]).filter((c:any)=>{if(c.is_archived)return false;const q=query.trim().toLowerCase();if(!q)return true;return String(c.name||'').toLowerCase().includes(q)||String(c.muscle_group||'').toLowerCase().includes(q)||String(c.category||'').toLowerCase().includes(q);}).slice(0,limit);
const today=()=>new Date().toISOString().slice(0,10);
const makeInviteCode=()=>(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID().replace(/-/g,'').slice(0,8):Math.random().toString(36).slice(2,10)).toUpperCase();
const REMEMBER_EMAIL_KEY='builtiq_remembered_email';
const emptyProfileDraft=(source?:any)=>({display_name:source?.display_name||'',height_inches:source?.height_inches??'',weight_lbs:source?.weight_lbs??'',birth_year:source?.birth_year??'',sex:source?.sex||'',experience_level:source?.experience_level||'beginner',primary_goal:source?.primary_goal||'general_health',units_preference:source?.units_preference||'imperial'});
const profileNeedsSetup=(p:any)=>{if(!p)return true; if(p.profile_completed===true)return false; if(p.profile_completed===false)return true; return !String(p.display_name||'').trim();};

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
 const [catalogQuery,setCatalogQuery]=useState<any>({warmup:'',strength:''});
 const [showCustomForm,setShowCustomForm]=useState<any>({warmup:false,strength:false});
 const [customDraft,setCustomDraft]=useState<any>({name:'',category:'strength',muscle_group:'',equipment:'',movement_pattern:''});
 const [catalogEditId,setCatalogEditId]=useState<string|null>(null);
 const [catalogEditDraft,setCatalogEditDraft]=useState<any>({name:'',category:'',muscle_group:'',equipment:'',movement_pattern:''});
 const [progressLogs,setProgressLogs]=useState<any[]>([]);
 const [showProgramSetup,setShowProgramSetup]=useState(false);
 const [supersetDraft,setSupersetDraft]=useState<any>({warmup:{picks:[]},strength:{picks:[]}});
 const [supersetQuery,setSupersetQuery]=useState<any>({warmup:'',strength:''});
 const refs=useRef<any[]>([]);

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
 useEffect(()=>{if(profile) loadPrograms()},[mode,selectedTeamId,teams,profile]);
 useEffect(()=>{if(program) loadLogs(program)},[program,logDate]);
 useEffect(()=>{if(program) loadLiftHistory()},[program,logDate,session]);
 useEffect(()=>{if(profile&&appNav==='Dashboard')loadProgressLogs();},[profile,appNav]);
 useEffect(()=>{if(appNav==='Training'&&!program)setShowProgramSetup(true);},[appNav,program]);

 const activeTeam=teams.find((t:any)=>t.id===selectedTeamId)||teams[0]||null;

 async function boot(){await loadProfile(); await loadTeams(); await loadCatalog();}
 async function loadCatalog(){if(!session?.user)return; const{data,error}=await supabase.from('st_exercise_catalog').select('*').order('name'); if(error){setCatalogError(error.message); return console.warn(error.message);} setCatalogError(''); setCatalog(data||[]);}
 async function signIn(){
  const{error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
  if(error)return alert(error.message);
  if(typeof window!=='undefined'){
   if(rememberEmail)localStorage.setItem(REMEMBER_EMAIL_KEY,email.trim());
   else localStorage.removeItem(REMEMBER_EMAIL_KEY);
  }
 }
 async function signUp(){
  if(password.length<6)return alert('Password must be at least 6 characters.');
  if(password!==confirmPassword)return alert('Passwords do not match.');
  const name=String(profileDraft.display_name||'').trim();
  if(!name)return alert('Enter your name.');
  if(!profileDraft.height_inches||!profileDraft.weight_lbs)return alert('Enter height and weight.');
  const{data,error}=await supabase.auth.signUp({email:email.trim(),password});
  if(error)return alert(error.message);
  if(typeof window!=='undefined'&&rememberEmail)localStorage.setItem(REMEMBER_EMAIL_KEY,email.trim());
  if(data.session){await saveProfile(true);return;}
  alert('Account created. Confirm your email, then sign in to finish profile setup.');
  setAuthMode('signin');
 }
 async function loadProfile(){
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
   profile_completed:markComplete,
  });
  setProfileSaving(false);
  if(error)return alert(error.message);
  await loadProfile();
 }
 async function createProfile(){await saveProfile(true);}
 async function signOut(){await supabase.auth.signOut();}
 async function loadTeams(){const{data}=await supabase.from('st_team_members').select('*, st_teams(*)').eq('user_id',session.user.id).eq('status','active'); const ts=(data||[]).map((m:any)=>m.st_teams?{...m.st_teams,my_role:m.role}:null).filter(Boolean); setTeams(ts); setSelectedTeamId((prev)=>prev&&ts.some((t:any)=>t.id===prev)?prev:ts[0]?.id||null);}
 async function createTeam(){const name=prompt('Team name','Trowbridge Team'); if(!name)return; const code=makeInviteCode(); const{data:t,error}=await supabase.from('st_teams').insert({name,invite_code:code,owner_user_id:session.user.id}).select().single(); if(error)return alert(error.message); const{error:me}=await supabase.from('st_team_members').insert({team_id:t.id,user_id:session.user.id,display_name:displayName,role:'owner'}); if(me)return alert(me.message); await loadTeams(); setMode('team'); setSelectedTeamId(t.id);}
 async function joinTeam(){const code=prompt('Invite code'); if(!code)return; const{data:t,error}=await supabase.rpc('st_join_team_by_invite',{p_invite_code:code,p_display_name:displayName}); if(error||!t)return alert(error?.message||'Team not found'); await loadTeams(); setMode('team'); setSelectedTeamId(t.id);}
 async function loadMembers(){if(!activeTeam)return; const{data}=await supabase.from('st_team_members').select('*').eq('team_id',activeTeam.id).order('created_at'); setMembers(data||[])}
 function canEdit(){return mode==='personal'||activeTeam?.my_role==='owner'||activeTeam?.my_role==='editor'}
 function isOwner(){return mode==='team'&&activeTeam?.my_role==='owner'}
 async function loadPrograms(){
  let q=supabase.from('st_programs').select('*, st_workouts(*, st_exercises(*, st_planned_sets(*)))').order('created_at',{ascending:false});
  q=mode==='personal'?q.eq('visibility','personal').eq('owner_user_id',session.user.id):q.eq('visibility','team').eq('team_id',activeTeam?.id||'00000000-0000-0000-0000-000000000000');
  const{data,error}=await q; if(error)return alert(error.message); setPrograms(data||[]); setProgram((data||[])[0]||null);
  const first=(data||[])[0]?.st_workouts?.sort((a:any,b:any)=>a.week-b.week||a.day_order-b.day_order)?.[0]; if(first)setActiveWorkout(first.id);
 }
 async function loadLogs(p:any){const ids:any[]=[];(p.st_workouts||[]).forEach((w:any)=>(w.st_exercises||[]).forEach((e:any)=>(e.st_planned_sets||[]).forEach((s:any)=>ids.push(s.id)))); if(!ids.length){setLogs({});return} const{data}=await supabase.from('st_set_logs').select('*').in('planned_set_id',ids).eq('user_id',session.user.id).eq('log_date',logDate); const by:any={};(data||[]).forEach((l:any)=>by[l.planned_set_id]=l);setLogs(by);}

 async function loadLiftHistory(){
  if(!session?.user) return;

  const { data, error } = await supabase
    .from('st_set_logs')
    .select('*, st_planned_sets(set_type,set_number,st_exercises(name,muscle_group,section,catalog_exercise_id))')
    .eq('user_id', session.user.id)
    .lt('log_date', logDate)
    .eq('completed', true)
    .order('log_date', { ascending:false })
    .order('updated_at', { ascending:false })
    .limit(500);

  if(error){
    console.warn(error.message);
    return;
  }

  const by:any = {};
  (data || []).forEach((row:any)=>{
    const { exerciseKey, setKey } = logHistoryKeys(row);
    if(!exerciseKey) return;

    if(!by[exerciseKey]) by[exerciseKey] = [];
    by[exerciseKey].push(row);

    if(!by[setKey]) by[setKey] = row;
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
    .limit(300);
  if(error) return console.warn(error.message);
  setProgressLogs(data||[]);
 }

 function previousFor(ex:any, set:any){
  const exerciseKey = exerciseHistoryKey(ex.catalog_exercise_id || '', ex.name || '');
  const setKey = `${exerciseKey}|${set.set_type}|${set.set_number}`;
  return history[setKey] || null;
 }

 function exerciseLastSummary(ex:any){
  const exerciseKey = exerciseHistoryKey(ex.catalog_exercise_id || '', ex.name || '');
  const rows = history[exerciseKey] || [];
  if(!rows.length) return '';
  const latestDate = rows[0].log_date;
  const sameDay = rows.filter((r:any)=>r.log_date === latestDate).slice(0,4);
  return sameDay.map((r:any)=>`${r.actual_weight || '-'} x ${r.actual_reps || '-'}`).join(' · ');
 }

 async function generate(){if(mode==='team'&&!activeTeam)return alert('Create or join a team first.'); if(mode==='team'&&!canEdit())return alert('Only owner/editors can create team programs.'); const catMap=catalogByName(catalog); const{data:p,error}=await supabase.from('st_programs').insert({owner_user_id:session.user.id,team_id:mode==='team'?activeTeam.id:null,visibility:mode,name:programName,weeks}).select().single(); if(error)return alert(error.message); const wr:any=[]; for(let w=1;w<=weeks;w++)days.forEach(d=>wr.push({program_id:p.id,week:w,day_order:DAYS.indexOf(d),day_label:d,workout_type:dayTypes[d]||'Full Body'})); const{data:ws,error:we}=await supabase.from('st_workouts').insert(wr).select(); if(we)return alert(we.message); for(const w of ws||[]){const tpl=WORKOUT_TEMPLATES[w.workout_type]||WORKOUT_TEMPLATES['Full Body']; for(const sec of SECTIONS){const list=tpl[sec.id]||[]; if(!list.length)continue; const startSort=SECTION_SORT_BASE[sec.id]??0; const{error:ie}=await insertTemplateSectionItems(supabase,w.id,sec.id,list,startSort,catMap); if(ie)return alert(ie.message);}} await loadPrograms();setAppNav('Training');}
 async function addExerciseFromCatalog(cat:any,section:string){
 if(!canEdit())return alert('Only owner/editors can change the shared team program.');
 if(!cat?.id)return alert('Select an exercise from the catalog.');
 const current=workout; if(!current)return;
 const sortOrder=nextSortOrder(current,section);
 for(const tw of targetWorkoutsFrom(current)){
  const{data:e,error}=await supabase.from('st_exercises').insert({workout_id:tw.id,section,sort_order:sortOrder,name:cat.name,muscle_group:cat.muscle_group||'',catalog_exercise_id:cat.id}).select().single();
  if(error)return alert(error.message);
  const defaultSets=section==='warmup'?1:3;
  const rows:any[]=[];
  for(let i=0;i<defaultSets;i++)rows.push({exercise_id:e.id,sort_order:i,set_number:i+1,set_type:'working',target_reps:section==='warmup'?'10':'8-12',target_rpe:section==='warmup'?'5':'8'});
  await supabase.from('st_planned_sets').insert(rows);
 }
 setCatalogQuery({...catalogQuery,[section]:''});
 await reloadKeepDay();
}
 function toggleSupersetPick(section:string,cat:any){
  const picks=[...(supersetDraft[section]?.picks||[])];
  const idx=picks.findIndex((p:any)=>p.id===cat.id);
  if(idx>=0) picks.splice(idx,1);
  else if(picks.length>=3) return alert('A superset can have 2 or 3 exercises.');
  else picks.push(cat);
  setSupersetDraft({...supersetDraft,[section]:{picks}});
 }
 async function addSupersetFromCatalog(section:string){
  if(!canEdit())return alert('Only owner/editors can change the shared team program.');
  const picks=supersetDraft[section]?.picks||[];
  if(picks.length<2||picks.length>3)return alert('Pick 2 or 3 exercises for a superset.');
  const current=workout; if(!current)return;
  const groupId=makeSupersetGroupId();
  let sortOrder=nextSortOrder(current,section);
  for(const cat of picks){
   for(const tw of targetWorkoutsFrom(current)){
    const{data:e,error}=await supabase.from('st_exercises').insert({workout_id:tw.id,section,sort_order:sortOrder,name:cat.name,muscle_group:cat.muscle_group||'',catalog_exercise_id:cat.id,superset_group_id:groupId}).select().single();
    if(error)return alert(error.message);
    const defaultSets=section==='warmup'?1:3;
    const rows:any[]=[];
    for(let i=0;i<defaultSets;i++)rows.push({exercise_id:e.id,sort_order:i,set_number:i+1,set_type:'working',target_reps:section==='warmup'?'10':'8-12',target_rpe:section==='warmup'?'5':'8'});
    await supabase.from('st_planned_sets').insert(rows);
   }
   sortOrder++;
  }
  setSupersetDraft({...supersetDraft,[section]:{picks:[]}});
  setSupersetQuery({...supersetQuery,[section]:''});
  await reloadKeepDay();
 }
 async function breakSuperset(ex:any){
  if(!canEdit()||!ex.superset_group_id)return;
  for(const tw of targetWorkoutsFrom(workout)){
   const targets=(tw.st_exercises||[]).filter((e:any)=>e.superset_group_id===ex.superset_group_id&&exerciseSection(e)===exerciseSection(ex));
   for(const t of targets) await supabase.from('st_exercises').update({superset_group_id:null}).eq('id',t.id);
  }
  await reloadKeepDay();
 }
 async function cleanupSupersetOrphans(section:string,groupId:string){
  for(const tw of targetWorkoutsFrom(workout)){
   const remaining=(tw.st_exercises||[]).filter((e:any)=>e.superset_group_id===groupId&&exerciseSection(e)===section);
   if(remaining.length===1) await supabase.from('st_exercises').update({superset_group_id:null}).eq('id',remaining[0].id);
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
  await addExerciseFromCatalog(data,section);
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
 async function updateExerciseField(ex:any,field:string,value:string){
 if(!canEdit())return;
 for(const tw of targetWorkoutsFrom(workout)){
  const match=matchingExercise(tw,ex);
  if(match) await supabase.from('st_exercises').update({[field]:value}).eq('id',match.id);
 }
 await reloadKeepDay();
}
 async function removeExercise(e:any){
 if(!canEdit())return alert('Only owner/editors can remove exercises.');
 const msg=applyScope==='future'?'Remove this exercise from this week and all future weeks?':'Remove this exercise from this workout only?';
 if(confirm(msg)){
  const groupId=e.superset_group_id, section=exerciseSection(e);
  for(const tw of targetWorkoutsFrom(workout)){
   const match=matchingExercise(tw,e);
   if(match) await supabase.from('st_exercises').delete().eq('id',match.id);
  }
  if(groupId) await cleanupSupersetOrphans(section,groupId);
  await reloadKeepDay();
 }
}
 async function moveExercise(e:any,dir:number){
 if(!canEdit())return alert('Only owner/editors can reorder.');
 const list=sectionExercises(workout,exerciseSection(e));
 const idx=list.findIndex((x:any)=>x.id===e.id);
 const swap=list[idx+dir];
 if(!swap)return;
 for(const tw of targetWorkoutsFrom(workout)){
  const match=matchingExercise(tw,e);
  const swapMatch=matchingExercise(tw,swap);
  if(match&&swapMatch){
   await supabase.from('st_exercises').update({sort_order:swap.sort_order}).eq('id',match.id);
   await supabase.from('st_exercises').update({sort_order:e.sort_order}).eq('id',swapMatch.id);
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
  const targetEx=matchingExercise(tw,e);
  if(targetEx) await supabase.from('st_planned_sets').insert({exercise_id:targetEx.id,sort_order,set_number:n,set_type:'working',target_reps:exerciseSection(e)==='warmup'?'10':'8-12',target_rpe:exerciseSection(e)==='warmup'?'5':'8'});
 }
 await reloadKeepDay();
}
 async function editSet(s:any,field:string,value:any){
 if(!canEdit())return alert('Only owner/editors can change planned sets.');
 const ex=(workout?.st_exercises||[]).find((e:any)=>(e.st_planned_sets||[]).some((ps:any)=>ps.id===s.id));
 if(!ex)return;
 for(const tw of targetWorkoutsFrom(workout)){
  const targetEx=matchingExercise(tw,ex);
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
  const targetEx=matchingExercise(tw,ex);
  const targetSet=targetEx?matchingSet(targetEx,s):null;
  if(targetSet) await supabase.from('st_planned_sets').update({is_deleted:true}).eq('id',targetSet.id);
 }
 await reloadKeepDay();
}
 async function saveLog(sid:string,field:string,value:any){
  const old=logs[sid]||{};
  let ex:any=null, ps:any=null;
  for(const e of workout?.st_exercises||[]){
    const found=(e.st_planned_sets||[]).find((s:any)=>s.id===sid);
    if(found){ex=e; ps=found; break;}
  }
  if(!ex||!ps) return alert('Could not save log for this set.');
  const payload={
    planned_set_id:sid,
    user_id:session.user.id,
    log_date:logDate,
    actual_weight:field==='actual_weight'?value:old.actual_weight||'',
    actual_reps:field==='actual_reps'?value:old.actual_reps||'',
    actual_rpe:field==='actual_rpe'?value:old.actual_rpe||'',
    completed:true,
    ...snapshotForLog(ex,ps,workout)
  };
  const{data,error}=await supabase.from('st_set_logs').upsert(payload,{onConflict:'planned_set_id,user_id,log_date'}).select().single();
  if(error)return alert(error.message);
  setLogs({...logs,[sid]:data});
 }
 async function setRole(member:any,role:string){if(!isOwner())return alert('Only owner can change roles.'); await supabase.from('st_team_members').update({role}).eq('id',member.id); await loadMembers(); await loadTeams();}
 function next(e:any){if(e.key==='Enter'||e.key==='ArrowRight'){e.preventDefault(); const i=refs.current.indexOf(e.currentTarget); if(refs.current[i+1])refs.current[i+1].focus();}}
 async function reloadKeepDay(){
  const keep = activeWorkout;
  await loadPrograms();
  if(keep) setActiveWorkout(keep);
}
 function goNav(n:string){
  setAppNav(n);
  if(n==='Progress'||n==='Dashboard')loadProgressLogs();
  if(n==='Settings'){loadCatalog(); if(activeTeam)loadMembers();}
  if(n==='Training'&&!program)setShowProgramSetup(true);
 }

function targetWorkoutsFrom(current:any){
  if(!current) return [];
  const all=(program?.st_workouts||[]).filter((w:any)=>w.day_order===current.day_order);
  return applyScope==='future'
    ? all.filter((w:any)=>w.week>=current.week).sort((a:any,b:any)=>a.week-b.week)
    : [current];
}
function matchingExercise(targetWorkout:any, sourceExercise:any){
  const section=exerciseSection(sourceExercise);
  return (targetWorkout.st_exercises||[]).find((e:any)=>exerciseSection(e)===section&&e.sort_order===sourceExercise.sort_order)
    || (sourceExercise.superset_group_id&&(targetWorkout.st_exercises||[]).find((e:any)=>exerciseSection(e)===section&&e.superset_group_id===sourceExercise.superset_group_id&&sourceExercise.catalog_exercise_id&&e.catalog_exercise_id===sourceExercise.catalog_exercise_id))
    || (targetWorkout.st_exercises||[]).find((e:any)=>exerciseSection(e)===section&&sourceExercise.catalog_exercise_id&&e.catalog_exercise_id===sourceExercise.catalog_exercise_id)
    || (targetWorkout.st_exercises||[]).find((e:any)=>exerciseSection(e)===section&&e.name===sourceExercise.name);
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
 const userCatalog=catalog.filter((c:any)=>!c.is_system&&c.user_id===session?.user?.id);
 const activeUserCatalog=userCatalog.filter((c:any)=>!c.is_archived);
 const archivedUserCatalog=userCatalog.filter((c:any)=>c.is_archived);
 const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 const todayDayLabel=dayNames[new Date().getDay()];
 const greetingHour=new Date().getHours();
 const greeting=greetingHour<12?'Good morning':greetingHour<18?'Good afternoon':'Good evening';
 const todayWorkout=program?(program.st_workouts||[]).find((w:any)=>w.week===week&&w.day_label===todayDayLabel):null;
 const weekStart=new Date(); weekStart.setDate(weekStart.getDate()-6);
 const weekStartStr=weekStart.toISOString().slice(0,10);
 const weeklyLogs=progressLogs.filter((r:any)=>String(r.log_date)>=weekStartStr);
 const weeklySetCount=weeklyLogs.length;
 const weeklyWorkoutDays=new Set(weeklyLogs.map((r:any)=>r.log_date)).size;
 const todaySetCount=progressLogs.filter((r:any)=>String(r.log_date)===today()).length;
 const renderExerciseCard=(ex:any,inSuperset=false)=><div className={`card exercise-card${inSuperset?' in-superset':''}`} key={ex.id}>
        <div className="exercise-head"><div className="exercise-meta">{canEdit()?<>
          <input className="exercise-name" defaultValue={ex.name} onBlur={e=>{if(e.target.value.trim()&&e.target.value!==ex.name)updateExerciseField(ex,'name',e.target.value.trim());}}/>
          <input className="exercise-muscle" placeholder="Muscle group" defaultValue={ex.muscle_group||''} onBlur={e=>{if((e.target.value||'')!==(ex.muscle_group||''))updateExerciseField(ex,'muscle_group',e.target.value);}}/>
        </>:<>
          <h3>{ex.name}</h3>
          <span className="badge">{ex.muscle_group||'Muscle'}</span>
        </>}{exerciseLastSummary(ex)&&<div className="prevline">Last time: {exerciseLastSummary(ex)}</div>}</div>
        {canEdit()&&<div className="actions"><button className="btn small secondary" title="Move up" onClick={()=>moveExercise(ex,-1)}>↑</button><button className="btn small secondary" title="Move down" onClick={()=>moveExercise(ex,1)}>↓</button><button className="btn small secondary" onClick={()=>addSet(ex)}>+ Set</button><button className="btn small red" onClick={()=>removeExercise(ex)}>Remove</button></div>}
        </div>
        <div className={`setgrid ${canEdit()?'setgrid-edit':''} muted`}><b>Type</b><b>#</b>{canEdit()&&<><b>T Wt</b><b>T Reps</b><b>T RPE</b></>}<b>{canEdit()?'Log Wt':'Wt'}</b><b>{canEdit()?'Log Reps':'Reps'}</b><b>{canEdit()?'Log RPE':'RPE'}</b>{canEdit()&&<b></b>}</div>
        {(ex.st_planned_sets||[]).filter((s:any)=>!s.is_deleted).sort((a:any,b:any)=>(a.sort_order||0)-(b.sort_order||0)).map((s:any)=>{const l=logs[s.id]||{};const prev=previousFor(ex,s);return <div className={`setgrid ${canEdit()?'setgrid-edit':''}`} key={s.id}>
          <select disabled={!canEdit()} value={s.set_type} onChange={e=>editSet(s,'set_type',e.target.value)}><option>warmup</option><option>working</option><option>backoff</option><option>dropset</option><option>amrap</option></select>
          <input disabled={!canEdit()} value={s.set_number} onChange={e=>editSet(s,'set_number',Number(e.target.value))}/>
          {canEdit()&&<><input defaultValue={s.target_weight||''} placeholder="target" onBlur={e=>editSet(s,'target_weight',e.target.value)}/><input defaultValue={s.target_reps||''} placeholder="target" onBlur={e=>editSet(s,'target_reps',e.target.value)}/><input defaultValue={s.target_rpe||''} placeholder="target" onBlur={e=>editSet(s,'target_rpe',e.target.value)}/></>}
          <input ref={el=>{if(el&&!refs.current.includes(el))refs.current.push(el)}} onKeyDown={next} placeholder={prev?.actual_weight?`last ${prev.actual_weight}`:(s.target_weight||'lb')} defaultValue={l.actual_weight||''} onBlur={e=>saveLog(s.id,'actual_weight',e.target.value)}/>
          <input ref={el=>{if(el&&!refs.current.includes(el))refs.current.push(el)}} onKeyDown={next} placeholder={prev?.actual_reps?`last ${prev.actual_reps}`:(s.target_reps||'reps')} defaultValue={l.actual_reps||''} onBlur={e=>saveLog(s.id,'actual_reps',e.target.value)}/>
          <input ref={el=>{if(el&&!refs.current.includes(el))refs.current.push(el)}} onKeyDown={next} placeholder={prev?.actual_rpe?`last ${prev.actual_rpe}`:(s.target_rpe||'rpe')} defaultValue={l.actual_rpe||''} onBlur={e=>saveLog(s.id,'actual_rpe',e.target.value)}/>
          {canEdit()?<button className="btn small red" onClick={()=>removeSet(s)}>X</button>:<span className="muted">log</span>}
        </div>})}
      </div>;
 const programSetupPanel=<div className="card program-setup"><div className="topline" style={{justifyContent:'space-between'}}><h2>Program setup</h2><button className="btn small secondary" onClick={()=>setShowProgramSetup(v=>!v)}>{showProgramSetup?'Hide':'Show'}</button></div>{showProgramSetup&&<><div className="tabs" style={{marginTop:8}}><button className={mode==='personal'?'active':''} onClick={()=>setMode('personal')}>Personal</button><button className={mode==='team'?'active':''} onClick={()=>setMode('team')}>Team</button></div>{mode==='team'&&<div className="card" style={{marginTop:8}}><label>Team</label><select value={activeTeam?.id||''} onChange={e=>setSelectedTeamId(e.target.value||null)}><option value="">Select</option>{teams.map((t:any)=><option key={t.id} value={t.id}>{t.name} · {t.my_role}</option>)}</select><div className="actions" style={{marginTop:8}}><button className="btn small secondary" onClick={createTeam}>Create</button><button className="btn small secondary" onClick={joinTeam}>Join</button></div>{activeTeam?<p className="muted">Invite: <b>{activeTeam.invite_code}</b> · Role: {activeTeam.my_role}</p>:teams.length===0?<p className="muted">No teams yet.</p>:<p className="muted">Select a team above.</p>}</div>}<label>Program</label><select value={program?.id||''} onChange={e=>setProgram(programs.find((p:any)=>p.id===e.target.value))}>{programs.length===0&&<option>No programs</option>}{programs.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select><label>New program name</label><input value={programName} onChange={e=>setProgramName(e.target.value)}/><label>Weeks</label><input type="number" value={weeks} onChange={e=>setWeeks(Number(e.target.value))}/><label>Workout days</label><div className="tabs">{DAYS.map(d=><button key={d} type="button" className={days.includes(d)?'active':''} onClick={()=>setDays(days.includes(d)?days.filter(x=>x!==d):[...days,d].sort((a,b)=>DAYS.indexOf(a)-DAYS.indexOf(b)))}>{d}</button>)}</div>{days.map(d=><div key={d}><label>{d} type</label><select value={dayTypes[d]||'Full Body'} onChange={e=>setDayTypes({...dayTypes,[d]:e.target.value})}><option>Lower Body</option><option>Upper Body</option><option>Full Body</option></select></div>)}<button className="btn green full" style={{marginTop:10}} onClick={generate}>Generate {mode==='team'?'Team':'Personal'} Program</button><p className="muted" style={{marginTop:8}}>Built-in templates include supersets — 2–3 exercises grouped back-to-back with minimal rest.</p></>}{!showProgramSetup&&program&&<p className="muted">Active program: <b>{program.name}</b></p>}{!showProgramSetup&&!program&&<p className="muted">No program yet. Open setup to generate one.</p>}</div>;

 const profileFields=(compact=false)=><>
  <label>Display name</label>
  <input value={profileDraft.display_name} onChange={e=>setProfileDraft({...profileDraft,display_name:e.target.value})} placeholder="Your name"/>
  <div className="row"><div><label>Height (in)</label><input type="number" min="0" step="0.1" value={profileDraft.height_inches} onChange={e=>setProfileDraft({...profileDraft,height_inches:e.target.value})} placeholder="70"/></div><div><label>Weight (lb)</label><input type="number" min="0" step="0.1" value={profileDraft.weight_lbs} onChange={e=>setProfileDraft({...profileDraft,weight_lbs:e.target.value})} placeholder="185"/></div></div>
  <div className="row"><div><label>Birth year</label><input type="number" min="1900" max="2100" value={profileDraft.birth_year} onChange={e=>setProfileDraft({...profileDraft,birth_year:e.target.value})} placeholder="1990"/></div><div><label>Sex</label><select value={profileDraft.sex} onChange={e=>setProfileDraft({...profileDraft,sex:e.target.value})}><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></div></div>
  <div className="row"><div><label>Experience</label><select value={profileDraft.experience_level} onChange={e=>setProfileDraft({...profileDraft,experience_level:e.target.value})}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div><div><label>Primary goal</label><select value={profileDraft.primary_goal} onChange={e=>setProfileDraft({...profileDraft,primary_goal:e.target.value})}><option value="general_health">General health</option><option value="strength">Strength</option><option value="muscle">Build muscle</option><option value="fat_loss">Fat loss</option></select></div></div>
  <label>Units preference</label>
  <select value={profileDraft.units_preference} onChange={e=>setProfileDraft({...profileDraft,units_preference:e.target.value})}><option value="imperial">Imperial (lb, in)</option><option value="metric">Metric (future display)</option></select>
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
 <div className="app-shell" key={session.user.id}>
 <main className="main page-main">
  {appNav==='Dashboard'&&<section className="dashboard"><div className="dash-hero"><h1>{greeting}, {displayName||'there'}</h1><p className="muted">Your wellness dashboard for {today()}.</p></div><div className="dash-grid"><div className="dash-card dash-featured"><div className="dash-card-head"><h2>Today&apos;s Workout</h2><span className="badge">{todayDayLabel}</span></div>{todayWorkout?<><p className="dash-title">{todayWorkout.day_label} · {todayWorkout.workout_type}</p><p className="muted">Week {week} · {sectionExercises(todayWorkout,'warmup').length+sectionExercises(todayWorkout,'strength').length} exercises planned</p><div className="actions" style={{marginTop:10}}><button className="btn green" onClick={()=>{setActiveWorkout(todayWorkout.id);setAppNav('Training');}}>Start Training</button></div></>:program?<><p className="muted">No workout scheduled for {todayDayLabel} this week.</p><button className="btn secondary" onClick={()=>goNav('Training')}>View program</button></>:<><p className="muted">Create a program to see today&apos;s workout.</p><button className="btn green" onClick={()=>{setShowProgramSetup(true);setAppNav('Training');}}>Set up program</button></>}</div><div className="dash-card"><div className="dash-card-head"><h2>Weekly Progress</h2><span className="badge">{weeklyWorkoutDays} days</span></div><div className="dash-metrics"><div><b>{weeklySetCount}</b><span className="muted">Sets logged (7d)</span></div><div><b>{todaySetCount}</b><span className="muted">Sets today</span></div></div><button className="btn secondary" style={{marginTop:10}} onClick={()=>goNav('Progress')}>View history</button></div><div className="dash-card"><div className="dash-card-head"><h2>Nutrition</h2><span className="badge">Soon</span></div><p className="muted">Daily macros, meals, and hydration will appear here.</p><div className="dash-placeholder"><span>Calories —</span><span>Protein —</span><span>Carbs —</span><span>Fats —</span></div></div><div className="dash-card dash-accent"><div className="dash-card-head"><h2>AI Coach Insight</h2><span className="badge">Preview</span></div><p className="muted">Personalized coaching based on your training, nutrition, and recovery is coming soon.</p><p className="dash-insight">&ldquo;Stay consistent this week. Log today&apos;s sets to build your progress baseline.&rdquo;</p></div></div></section>}
  {appNav==='Nutrition'&&<section><div className="card"><h2>Nutrition</h2><p className="muted">Macro tracking and meal logging will live here in a future release.</p></div></section>}
  {appNav==='AI Coach'&&<section><div className="card dash-accent"><h2>AI Coach</h2><p className="muted">Your BuiltIQ wellness coach will analyze workouts, nutrition, and recovery to give safe, practical guidance.</p><p className="dash-insight">Coming soon: readiness check-ins, workout adjustments, and weekly coaching summaries.</p></div></section>}
  {appNav==='Progress'&&<section><div className="card"><div className="topline" style={{justifyContent:'space-between'}}><h2>Progress</h2><button className="btn small secondary" onClick={loadProgressLogs}>Refresh</button></div><p className="muted">Saved lift history uses snapshots, so past workouts stay accurate even if the program template changes later.</p></div>{progressDays.length===0&&<div className="card"><p className="muted">No completed sets yet. Log a workout in Training to build history.</p></div>}{progressDays.map((day:any)=><div className="card" key={day.date}><h3>{day.date}{day.label?` · ${day.label}`:''}{day.type?` · ${day.type}`:''}</h3>{Object.values(day.rows.reduce((acc:any,row:any)=>{const name=logExerciseName(row);if(!acc[name]) acc[name]=[]; acc[name].push(row);return acc;},{})).map((rows:any)=>{const label=logExerciseName(rows[0]);return <div key={label} className="history-row"><b>{label}</b><span className="muted">{rows.sort((a:any,b:any)=>(logSetNumber(a)-logSetNumber(b))).map((r:any)=>`${r.actual_weight||'-'} x ${r.actual_reps||'-'}${r.actual_rpe?` @ ${r.actual_rpe}`:''}`).join(' · ')}</span></div>})}</div>)}</section>}
  {appNav==='Settings'&&<section><div className="card"><div className="topline" style={{justifyContent:'space-between'}}><h2>Profile</h2><button className="btn small green" onClick={()=>saveProfile(true)} disabled={profileSaving}>{profileSaving?'Saving...':'Save Profile'}</button></div><p className="muted">Update your account details used across BuiltIQ.</p>{profileFields(true)}</div><div className="card"><div className="topline" style={{justifyContent:'space-between'}}><h2>My Exercise Catalog</h2><button className="btn small secondary" onClick={loadCatalog}>Refresh</button></div><p className="muted">Custom exercises are private to your account. Search them alongside BuiltIQ system exercises when building workouts.</p>{activeUserCatalog.length===0&&archivedUserCatalog.length===0&&<p className="muted">No custom exercises yet. Create one from Training or below.</p>}{activeUserCatalog.map((item:any)=><div key={item.id} className="catalog-row">{catalogEditId===item.id?<div className="catalog-edit-grid"><input value={catalogEditDraft.name} onChange={e=>setCatalogEditDraft({...catalogEditDraft,name:e.target.value})} placeholder="Name"/><select value={catalogEditDraft.category} onChange={e=>setCatalogEditDraft({...catalogEditDraft,category:e.target.value})}><option value="warmup">Warmup</option><option value="strength">Strength</option><option value="mobility">Mobility</option><option value="plyometric">Plyometric</option><option value="other">Other</option></select><input value={catalogEditDraft.muscle_group} onChange={e=>setCatalogEditDraft({...catalogEditDraft,muscle_group:e.target.value})} placeholder="Muscle group"/><input value={catalogEditDraft.equipment} onChange={e=>setCatalogEditDraft({...catalogEditDraft,equipment:e.target.value})} placeholder="Equipment"/><input value={catalogEditDraft.movement_pattern} onChange={e=>setCatalogEditDraft({...catalogEditDraft,movement_pattern:e.target.value})} placeholder="Movement pattern"/><div className="actions"><button className="btn small green" onClick={saveCustomExerciseEdit}>Save</button><button className="btn small secondary" onClick={()=>setCatalogEditId(null)}>Cancel</button></div></div>:<><div><b>{item.name}</b><div className="muted">{item.muscle_group||'Muscle'}{item.equipment?` · ${item.equipment}`:''}{item.movement_pattern?` · ${item.movement_pattern}`:''}</div></div><div className="actions"><button className="btn small secondary" onClick={()=>{setCatalogEditId(item.id); setCatalogEditDraft({name:item.name,category:item.category||'strength',muscle_group:item.muscle_group||'',equipment:item.equipment||'',movement_pattern:item.movement_pattern||''});}}>Edit</button><button className="btn small red" onClick={()=>archiveCustomExercise(item,true)}>Archive</button></div></>}</div>)}{archivedUserCatalog.length>0&&<><h3 style={{marginTop:12}}>Archived</h3>{archivedUserCatalog.map((item:any)=><div key={item.id} className="catalog-row archived"><div><b>{item.name}</b><div className="muted">Archived · not shown in workout search</div></div><button className="btn small secondary" onClick={()=>archiveCustomExercise(item,false)}>Restore</button></div>)}</>}</div><div className="card"><h2>Create Custom Exercise</h2><div className="catalog-edit-grid"><input value={customDraft.name} onChange={e=>setCustomDraft({...customDraft,name:e.target.value})} placeholder="Exercise name"/><select value={customDraft.category} onChange={e=>setCustomDraft({...customDraft,category:e.target.value})}><option value="warmup">Warmup</option><option value="strength">Strength</option><option value="mobility">Mobility</option><option value="plyometric">Plyometric</option><option value="other">Other</option></select><input value={customDraft.muscle_group} onChange={e=>setCustomDraft({...customDraft,muscle_group:e.target.value})} placeholder="Muscle group"/><input value={customDraft.equipment} onChange={e=>setCustomDraft({...customDraft,equipment:e.target.value})} placeholder="Equipment"/><input value={customDraft.movement_pattern} onChange={e=>setCustomDraft({...customDraft,movement_pattern:e.target.value})} placeholder="Movement pattern"/></div><button className="btn green" style={{marginTop:8}} onClick={()=>createCustomExercise(customDraft.category||'strength', false)}>Save to My Catalog</button></div><div className="card"><h2>Teams</h2><p className="muted">Shared programs and team roles. Owner/editor can edit plans; members log only.</p><div className="actions"><button className="btn secondary" onClick={createTeam}>Create Team</button><button className="btn secondary" onClick={joinTeam}>Join Team</button><button className="btn secondary" onClick={loadMembers}>Refresh Members</button></div>{activeTeam&&<p className="muted" style={{marginTop:8}}>Active: <b>{activeTeam.name}</b> · Invite: <b>{activeTeam.invite_code}</b> · Role: <b>{activeTeam.my_role}</b></p>}{teams.length===0&&<p className="muted" style={{marginTop:8}}>You are not on any team yet.</p>}{members.length>0&&<><h3 style={{marginTop:12}}>Members</h3>{members.map((m:any)=><div key={m.id} className="topline" style={{justifyContent:'space-between',marginTop:6}}><span>{m.display_name||m.user_id.slice(0,6)}</span><select disabled={!isOwner()||m.user_id===session.user.id} value={m.role} onChange={e=>setRole(m,e.target.value)} style={{maxWidth:115}}><option>owner</option><option>editor</option><option>member</option></select></div>)}</>}</div></section>}
  {appNav==='Training'&&<section>
    {programSetupPanel}
    <div className="applybox"><label>When changing workout structure, apply edits to:</label><select value={applyScope} onChange={e=>setApplyScope(e.target.value as any)}><option value="future">This week and all future weeks</option><option value="current">This workout only</option></select><p className="muted">Default is future weeks, so changes carry forward in the plan.</p></div>
    <div className="stats"><div className="stat"><span className="muted">Mode</span><b>{mode==='team'?'Team':'Personal'}</b></div><div className="stat"><span className="muted">Week</span><b>{week}</b></div><div className="stat"><span className="muted">Sets</span><b>{planned}</b></div><div className="stat"><span className="muted">Logged</span><b>{logged}</b></div></div>
    <div className="row"><div><label>Date</label><input type="date" value={logDate} onChange={e=>setLogDate(e.target.value)}/></div><div><label>Week</label><select value={week} onChange={e=>setWeek(Number(e.target.value))}>{Array.from({length:program?.weeks||weeks},(_,i)=><option key={i+1} value={i+1}>Week {i+1}</option>)}</select></div></div>
    <div className="tabs">{(program?.st_workouts||[]).filter((w:any)=>w.week===week).sort((a:any,b:any)=>a.day_order-b.day_order).map((w:any)=><button key={w.id} className={workout?.id===w.id?'active':''} onClick={()=>setActiveWorkout(w.id)}>{w.day_label} · {w.workout_type}</button>)}</div>
    {!program&&<div className="card"><h2>No program yet</h2><p className="muted">Open Program setup above to generate your first plan.</p></div>}
    {workout&&<div className="card"><div className="topline" style={{justifyContent:'space-between'}}><h2>{workout.day_label} · {workout.workout_type}</h2><span className="muted">{sectionExercises(workout,'warmup').length + sectionExercises(workout,'strength').length} exercises</span></div></div>}
    {workout&&SECTIONS.map((sec:any)=>{
      const exercises=sectionExercises(workout,sec.id);
      const blocks=groupSectionBlocks(exercises);
      const query=catalogQuery[sec.id]||'';
      const results=filterCatalog(catalog,query);
      const ssQuery=supersetQuery[sec.id]||'';
      const ssResults=filterCatalog(catalog,ssQuery);
      const ssPicks=supersetDraft[sec.id]?.picks||[];
      const customOpen=!!showCustomForm[sec.id];
      const customSectionDraft={...customDraft,category:customDraft.category||sec.id};
      return <div className="section-block" key={sec.id}><div className="section-head"><h2>{sec.label}</h2><span className="badge">{exercises.length}</span></div>
      {blocks.map((block:any)=>block.type==='superset'
        ?<div className="superset-block" key={block.groupId}><div className="superset-head"><span className="badge superset-badge">Superset · {block.exercises.length} exercises</span>{canEdit()&&<button className="btn small secondary" onClick={()=>breakSuperset(block.exercises[0])}>Break superset</button>}</div>{block.exercises.map((ex:any)=>renderExerciseCard(ex,true))}</div>
        :renderExerciseCard(block.exercises[0]))}
      {canEdit()&&<div className="catalog-picker"><label>Search exercise catalog</label>{catalogError&&<p className="muted" style={{color:'#f87171'}}>Catalog unavailable: {catalogError}. Run migration 20250707_005_exercise_catalog.sql in Supabase.</p>}<input placeholder="Search BuiltIQ + your exercises" value={query} onChange={e=>setCatalogQuery({...catalogQuery,[sec.id]:e.target.value})}/>{results.length>0&&<div className="catalog-results">{results.map((item:any)=><button type="button" key={item.id} className="catalog-result" onClick={()=>addExerciseFromCatalog(item,sec.id)}><span><b>{item.name}</b><span className="muted">{item.muscle_group||'Muscle'}{item.equipment?` · ${item.equipment}`:''}</span></span><span className={`badge ${item.is_system?'':'custom-badge'}`}>{item.is_system?'BuiltIQ':'Mine'}</span></button>)}</div>}{query.trim()&&results.length===0&&<p className="muted">No matches. Create a custom exercise below.</p>}<div className="superset-builder"><label>Add superset (pick 2–3 exercises)</label><input placeholder="Search exercises for superset" value={ssQuery} onChange={e=>setSupersetQuery({...supersetQuery,[sec.id]:e.target.value})}/>{ssResults.length>0&&<div className="catalog-results">{ssResults.map((item:any)=>{const picked=ssPicks.some((p:any)=>p.id===item.id);return <button type="button" key={`ss-${item.id}`} className={`catalog-result${picked?' picked':''}`} onClick={()=>toggleSupersetPick(sec.id,item)}><span><b>{item.name}</b><span className="muted">{item.muscle_group||'Muscle'}{item.equipment?` · ${item.equipment}`:''}</span></span><span className={`badge ${picked?'superset-badge':item.is_system?'':'custom-badge'}`}>{picked?'Selected':item.is_system?'BuiltIQ':'Mine'}</span></button>})}</div>}{ssPicks.length>0&&<div className="superset-picks">{ssPicks.map((p:any)=><span key={p.id} className="badge superset-badge">{p.name}</span>)}</div>}<div className="actions" style={{marginTop:8}}><button className="btn small green" disabled={ssPicks.length<2} onClick={()=>addSupersetFromCatalog(sec.id)}>Add superset ({ssPicks.length}/3)</button>{ssPicks.length>0&&<button className="btn small secondary" onClick={()=>{setSupersetDraft({...supersetDraft,[sec.id]:{picks:[]}});setSupersetQuery({...supersetQuery,[sec.id]:''});}}>Clear picks</button>}</div></div><div className="actions" style={{marginTop:8}}><button className="btn small secondary" onClick={()=>{setShowCustomForm({...showCustomForm,[sec.id]:!customOpen}); setCustomDraft({...customDraft,category:sec.id});}}>{customOpen?'Cancel custom exercise':'Create custom exercise'}</button></div>{customOpen&&<div className="catalog-edit-grid" style={{marginTop:8}}><input value={customSectionDraft.name} onChange={e=>setCustomDraft({...customSectionDraft,name:e.target.value})} placeholder="Exercise name"/><select value={customSectionDraft.category} onChange={e=>setCustomDraft({...customSectionDraft,category:e.target.value})}><option value="warmup">Warmup</option><option value="strength">Strength</option><option value="mobility">Mobility</option><option value="plyometric">Plyometric</option><option value="other">Other</option></select><input value={customSectionDraft.muscle_group} onChange={e=>setCustomDraft({...customSectionDraft,muscle_group:e.target.value})} placeholder="Muscle group"/><input value={customSectionDraft.equipment} onChange={e=>setCustomDraft({...customSectionDraft,equipment:e.target.value})} placeholder="Equipment"/><input value={customSectionDraft.movement_pattern} onChange={e=>setCustomDraft({...customSectionDraft,movement_pattern:e.target.value})} placeholder="Movement pattern"/><button className="btn small green" onClick={()=>createCustomExercise(sec.id)}>Save and add to workout</button></div>}</div>}
      {!exercises.length&&!canEdit()&&<p className="muted section-empty">No {sec.label.toLowerCase()} exercises.</p>}
      </div>;
    })}
  </section>}
 </main></div></>
}
