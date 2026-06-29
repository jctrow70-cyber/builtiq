
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const TABS = ['Dashboard','Train','Mobility','Nutrition','Progress','Coach'];
const MUSCLES = ['Hamstrings','Glutes','Quads','Hips','Ankles','Upper Chest','Chest','Shoulders','Thoracic Spine','Rear Delts','Lats','Mid Back','Biceps','Triceps','Calves','Core','Low Back'];

const EXERCISES:any[] = [
  ['Romanian Deadlift','Hamstrings',['Glutes'],'Lower Body','https://www.youtube.com/results?search_query=romanian+deadlift+proper+form',['Stand hip-width with the bar in front of your thighs.','Push your hips back with a soft knee bend.','Lower until you feel a hamstring stretch.','Drive hips forward to stand tall.'],['Keep the bar close.','Do not turn it into a squat.']],
  ['Seated Leg Curl','Hamstrings',[],'Lower Body','https://www.youtube.com/results?search_query=seated+leg+curl+proper+form',['Set the pad just above your heels.','Curl smoothly and squeeze.','Return under control.'],['Avoid using momentum.']],
  ['Hip Thrust','Glutes',['Hamstrings'],'Lower Body','https://www.youtube.com/results?search_query=hip+thrust+proper+form',['Set upper back on bench.','Drive through heels.','Lock out with ribs down.'],['Do not overarch low back.']],
  ['Bulgarian Split Squat','Glutes',['Quads','Hamstrings'],'Lower Body','https://www.youtube.com/results?search_query=bulgarian+split+squat+proper+form',['Set rear foot on bench.','Lower under control.','Drive through front foot.'],['Slight forward torso bias hits glutes.']],
  ['Back Squat','Quads',['Glutes'],'Lower Body','https://www.youtube.com/results?search_query=back+squat+proper+form',['Brace hard.','Sit between hips.','Drive up evenly.'],['Keep knees tracking over toes.']],
  ['Bench Press','Chest',['Triceps','Shoulders'],'Upper Body','https://www.youtube.com/results?search_query=bench+press+proper+form',['Set shoulder blades.','Lower to lower chest.','Press up and back.'],['Keep feet planted.']],
  ['Incline Dumbbell Press','Upper Chest',['Shoulders','Triceps'],'Upper Body','https://www.youtube.com/results?search_query=incline+dumbbell+press+proper+form',['Set bench to slight incline.','Lower DBs under control.','Press together without clanking.'],['Do not flare elbows too much.']],
  ['Overhead Press','Shoulders',['Triceps'],'Upper Body','https://www.youtube.com/results?search_query=overhead+press+proper+form',['Brace glutes and core.','Press overhead.','Lock out with biceps near ears.'],['Avoid leaning back.']],
  ['Lat Pulldown','Lats',['Biceps'],'Upper Body','https://www.youtube.com/results?search_query=lat+pulldown+proper+form',['Pull elbows down.','Bring bar to upper chest.','Control the return.'],['Do not yank with momentum.']],
  ['Seated Cable Row','Mid Back',['Lats','Biceps'],'Upper Body','https://www.youtube.com/results?search_query=seated+cable+row+proper+form',['Tall chest.','Pull elbows back.','Squeeze shoulder blades.'],['Do not shrug.']],
  ['Lateral Raise','Shoulders',[],'Upper Body','https://www.youtube.com/results?search_query=lateral+raise+proper+form',['Soft elbows.','Raise to shoulder height.','Lower slowly.'],['Think out, not up.']],
  ['Plank','Core',[],'Core','https://www.youtube.com/results?search_query=plank+proper+form',['Elbows under shoulders.','Squeeze glutes.','Hold straight line.'],['Do not sag hips.']]
].map(([name,primary,secondary,cat,video,instructions,tips])=>({name,primary,secondary,cat,video,instructions,tips}));

const MOBILITY:any[] = [
  ['World’s Greatest Stretch','Hips',['Lower Body','Full Body','Hamstrings & Glutes'],'60 sec/side','Open hips and thoracic spine.','https://www.youtube.com/results?search_query=worlds+greatest+stretch+demo'],
  ['Hamstring Floss','Hamstrings',['Lower Body','Full Body','Hamstrings & Glutes'],'10/side','Prep hamstrings before hinge work.','https://www.youtube.com/results?search_query=hamstring+floss+mobility+demo'],
  ['90/90 Hip Switch','Hips',['Lower Body','Full Body','Hamstrings & Glutes'],'60 sec','Hip internal/external rotation.','https://www.youtube.com/results?search_query=90+90+hip+switch+demo'],
  ['Ankle Rocks','Ankles',['Lower Body','Legs','Full Body'],'15/side','Improve squat and lunge positions.','https://www.youtube.com/results?search_query=ankle+rocks+mobility+demo'],
  ['Band Pull-Aparts','Shoulders',['Upper Body','Push','Pull','Full Body'],'20 reps','Shoulder and upper-back activation.','https://www.youtube.com/results?search_query=band+pull+apart+demo'],
  ['Wall Slides','Shoulders',['Upper Body','Push','Full Body'],'10 reps','Shoulder mobility and control.','https://www.youtube.com/results?search_query=wall+slides+shoulder+mobility'],
  ['Thoracic Open Books','Thoracic Spine',['Upper Body','Pull','Push','Full Body'],'8/side','Upper-back rotation.','https://www.youtube.com/results?search_query=thoracic+open+book+stretch'],
  ['Lat Prayer Stretch','Lats',['Upper Body','Pull','Full Body'],'45 sec','Prep overhead and pulling patterns.','https://www.youtube.com/results?search_query=lat+prayer+stretch']
].map(([name,focus,types,duration,notes,video])=>({name,focus,types,duration,notes,video}));

function scoreExercise(ex:any, type:string, priorities:any) {
  let s = 0;
  if(type.includes('Lower') && ex.cat === 'Lower Body') s += 6;
  if(type.includes('Upper') && ex.cat === 'Upper Body') s += 6;
  if(type.includes('Full')) s += 3;
  if(type.includes('Push') && ['Chest','Upper Chest','Shoulders','Triceps'].includes(ex.primary)) s += 6;
  if(type.includes('Pull') && ['Lats','Mid Back','Rear Delts','Biceps'].includes(ex.primary)) s += 6;
  if(type.includes('Leg') && ex.cat === 'Lower Body') s += 6;
  if(type.includes('Hamstrings') && (ex.primary === 'Hamstrings' || ex.secondary.includes('Hamstrings'))) s += 10;
  s += (priorities[ex.primary] || 0) * 5;
  ex.secondary.forEach((m:string)=>s += (priorities[m] || 0) * 2);
  return s;
}
function scoreMobility(m:any, type:string, priorities:any) {
  return (m.types.includes(type) ? 6 : 0) + (priorities[m.focus] || 0) * 4;
}

export default function Page() {
  const [session,setSession] = useState<any>(null);
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [tab,setTab] = useState('Dashboard');
  const [householdId,setHouseholdId] = useState('');
  const [invite,setInvite] = useState('');
  const [displayName,setDisplayName] = useState('Jesse');
  const [program,setProgram] = useState<any>(null);
  const [programName,setProgramName] = useState('BuiltIQ Hamstring Focus');
  const [weeks,setWeeks] = useState(6);
  const [selectedDays,setSelectedDays] = useState(['Mon','Tue','Fri']);
  const [dayTypes,setDayTypes] = useState<any>({Mon:'Lower Body', Tue:'Upper Body', Fri:'Full Body'});
  const [priorities,setPriorities] = useState<any>({Hamstrings:3,Hips:2});
  const [currentWeek,setCurrentWeek] = useState(1);
  const [selectedWorkout,setSelectedWorkout] = useState('');
  const [logs,setLogs] = useState<any>({});
  const [mobLogs,setMobLogs] = useState<any>({});
  const [nutrition,setNutrition] = useState<any[]>([]);
  const [food,setFood] = useState<any>({food_name:'',calories:'',protein:'',carbs:'',fat:''});
  const [metrics,setMetrics] = useState<any[]>([]);
  const [metric,setMetric] = useState<any>({body_weight:'',waist:'',notes:''});
  const [detailExercise,setDetailExercise] = useState<any>(null);

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    return ()=>data.subscription.unsubscribe();
  },[]);
  useEffect(()=>{ if(session?.user) loadHousehold(); },[session]);

  async function signIn(){
    if(!email || !password) return alert('Enter email and password.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if(error) alert(error.message);
  }
  async function signUp(){
    if(!email || !password) return alert('Enter email and password.');
    const { error } = await supabase.auth.signUp({ email, password });
    if(error) alert(error.message);
    else alert('Account created. Click Sign In now.');
  }
  async function loadHousehold(){
    const { data } = await supabase.from('household_members').select('*').eq('user_id',session.user.id).limit(1).maybeSingle();
    if(data){ setHouseholdId(data.household_id); setDisplayName(data.display_name || 'Me'); await loadAll(data.household_id); }
  }
  async function createHousehold(){
    const code = Math.random().toString(36).slice(2,8).toUpperCase();
    const { data:h, error } = await supabase.from('households').insert({name:'BuiltIQ Household', invite_code:code}).select().single();
    if(error) return alert(error.message);
    await supabase.from('household_members').insert({household_id:h.id,user_id:session.user.id,display_name:displayName});
    setHouseholdId(h.id); setInvite(code);
  }
  async function joinHousehold(){
    const { data:h, error } = await supabase.from('households').select('*').eq('invite_code', invite.toUpperCase()).single();
    if(error || !h) return alert('Invite code not found.');
    await supabase.from('household_members').insert({household_id:h.id,user_id:session.user.id,display_name:displayName});
    setHouseholdId(h.id); await loadAll(h.id);
  }
  async function loadAll(hid:string){ await loadProgram(hid); await loadNutrition(hid); await loadMetrics(hid); }
  async function loadProgram(hid:string){
    const { data:p } = await supabase.from('programs').select('*').eq('household_id',hid).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(!p) return;
    const { data:w } = await supabase.from('workouts').select('*, exercises(*), mobility_exercises(*)').eq('program_id',p.id).order('week').order('day_order');
    setProgram({...p, workouts:w || []});
    setProgramName(p.name); setWeeks(p.weeks); setPriorities(p.priorities || {});
    const { data:l } = await supabase.from('exercise_logs').select('*').eq('user_id',session.user.id);
    const by:any = {}; (l || []).forEach((x:any)=>by[x.exercise_id]=x); setLogs(by);
    const { data:ml } = await supabase.from('mobility_logs').select('*').eq('user_id',session.user.id);
    const mby:any = {}; (ml || []).forEach((x:any)=>mby[x.mobility_exercise_id]=x); setMobLogs(mby);
  }
  async function loadNutrition(hid:string){
    const { data } = await supabase.from('nutrition_logs').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(30);
    setNutrition(data || []);
  }
  async function loadMetrics(hid:string){
    const { data } = await supabase.from('body_metrics').select('*').eq('user_id',session.user.id).order('metric_date',{ascending:false}).limit(20);
    setMetrics(data || []);
  }
  function makeExercises(type:string){ return [...EXERCISES].sort((a,b)=>scoreExercise(b,type,priorities)-scoreExercise(a,type,priorities)).slice(0,5); }
  function makeMobility(type:string){ return [...MOBILITY].sort((a,b)=>scoreMobility(b,type,priorities)-scoreMobility(a,type,priorities)).slice(0,3); }
  async function generateProgram(){
    if(!householdId) return alert('Create or join a household first.');
    const { data:p, error } = await supabase.from('programs').insert({household_id:householdId,name:programName,weeks,goal:'Build Muscle',priorities}).select().single();
    if(error) return alert(error.message);
    let rows:any[] = [];
    for(let w=1; w<=weeks; w++){ selectedDays.forEach(day=>rows.push({program_id:p.id,week:w,day_label:day,day_order:DAYS.indexOf(day),workout_type:dayTypes[day] || 'Full Body'})); }
    const { data:ws, error:werr } = await supabase.from('workouts').insert(rows).select();
    if(werr) return alert(werr.message);
    for(const w of ws || []){
      await supabase.from('exercises').insert(makeExercises(w.workout_type).map((e:any,i:number)=>({workout_id:w.id,sort_order:i,name:e.name,primary_muscle:e.primary,secondary_muscles:e.secondary,target_sets:'3',target_reps:e.primary==='Core'?'45 sec':'8-12',video_url:e.video,instructions:e.instructions,tips:e.tips})));
      await supabase.from('mobility_exercises').insert(makeMobility(w.workout_type).map((m:any,i:number)=>({workout_id:w.id,sort_order:i,name:m.name,focus_area:m.focus,duration:m.duration,video_url:m.video,notes:m.notes})));
    }
    await loadProgram(householdId); setCurrentWeek(1); setTab('Train');
  }
  async function updateLog(exId:string, field:string, value:any){
    const old = logs[exId] || {};
    const payload:any = {exercise_id:exId,user_id:session.user.id,actual_sets:field==='actual_sets'?value:old.actual_sets || '',actual_reps:field==='actual_reps'?value:old.actual_reps || '',weight:field==='weight'?value:old.weight || '',rpe:field==='rpe'?value:old.rpe || '',notes:field==='notes'?value:old.notes || '',completed:field==='completed'?value:old.completed || false};
    const { data } = await supabase.from('exercise_logs').upsert(payload,{onConflict:'exercise_id,user_id'}).select().single();
    if(data) setLogs({...logs,[exId]:data});
  }
  async function updateMobLog(id:string, completed:boolean){
    const { data } = await supabase.from('mobility_logs').upsert({mobility_exercise_id:id,user_id:session.user.id,completed},{onConflict:'mobility_exercise_id,user_id'}).select().single();
    if(data) setMobLogs({...mobLogs,[id]:data});
  }
  async function addFood(source='manual'){
    if(!food.food_name) return;
    await supabase.from('nutrition_logs').insert({...food,source,household_id:householdId,user_id:session.user.id});
    setFood({food_name:'',calories:'',protein:'',carbs:'',fat:''}); await loadNutrition(householdId);
  }
  function estimateVoiceFood(){
    const text = prompt('Say/type food: example "8 oz chicken breast, 1 cup rice, broccoli"');
    if(!text) return;
    let estimate:any = {food_name:text, calories:400, protein:35, carbs:35, fat:8};
    const lower = text.toLowerCase();
    if(lower.includes('chicken')) { estimate.calories += 250; estimate.protein += 45; }
    if(lower.includes('rice')) { estimate.calories += 200; estimate.carbs += 45; }
    if(lower.includes('pizza')) { estimate.calories += 600; estimate.protein += 25; estimate.carbs += 70; estimate.fat += 25; }
    setFood(estimate); alert('AI estimate filled in. Review and tap Add Food.');
  }
  function barcodeConcept(){ alert('Production version: use phone camera + barcode database. For now, enter food manually or use Speak Food to AI.'); }
  async function addMetric(){
    await supabase.from('body_metrics').insert({...metric,household_id:householdId,user_id:session.user.id});
    setMetric({body_weight:'',waist:'',notes:''}); await loadMetrics(householdId);
  }
  async function editExercise(ex:any){
    const name = prompt('Exercise name', ex.name); if(name === null) return;
    const sets = prompt('Target sets', ex.target_sets); if(sets === null) return;
    const reps = prompt('Target reps', ex.target_reps); if(reps === null) return;
    await supabase.from('exercises').update({name,target_sets:sets,target_reps:reps}).eq('id',ex.id); await loadProgram(householdId);
  }
  async function removeExercise(id:string){
    if(!confirm('Remove from shared plan?')) return;
    await supabase.from('exercises').delete().eq('id',id); await loadProgram(householdId);
  }
  const visible = (program?.workouts || []).filter((w:any)=>w.week === currentWeek);
  const todayNutrition = nutrition.reduce((a:any,f:any)=>({calories:a.calories + Number(f.calories || 0),protein:a.protein + Number(f.protein || 0),carbs:a.carbs + Number(f.carbs || 0),fat:a.fat + Number(f.fat || 0)}),{calories:0,protein:0,carbs:0,fat:0});
  const coverage = useMemo(()=>{ const c:any={}; visible.forEach((w:any)=>(w.exercises||[]).forEach((e:any)=>c[e.primary_muscle]=(c[e.primary_muscle]||0)+Number(e.target_sets||3))); return c; },[visible]);

  if(!session){
    return <><header className="header"><div><div className="brand">Built<span>IQ</span></div><small>Smarter training. Better nutrition. Mobility built in.</small></div></header>
    <div className="loginWrap"><div className="loginCard"><h2>Sign in</h2><p className="muted">Use email and password. No magic link required.</p><label>Email</label><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password"/><button className="btn full" style={{marginTop:12}} onClick={signIn}>Sign In</button><button className="btn secondary full" style={{marginTop:8}} onClick={signUp}>Create Account</button></div></div></>
  }

  if(!householdId){
    return <><header className="header"><div><div className="brand">Built<span>IQ</span></div><small>Create or join your household.</small></div><button className="btn small secondary" onClick={()=>supabase.auth.signOut()}>Sign Out</button></header>
    <div className="loginWrap"><div className="loginCard"><h2>Household Setup</h2><label>Your name</label><input value={displayName} onChange={e=>setDisplayName(e.target.value)} /><button className="btn green full" style={{marginTop:12}} onClick={createHousehold}>Create Household</button><label>Join with invite code</label><input value={invite} onChange={e=>setInvite(e.target.value.toUpperCase())} placeholder="ABC123"/><button className="btn full" style={{marginTop:8}} onClick={joinHousehold}>Join Household</button></div></div></>
  }

  function NavButtons(){ return <>{TABS.map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</> }
  function renderExerciseDetail(){
    if(!detailExercise) return null;
    return <div className="workoutCard" style={{borderColor:'#7c5cff'}}><div className="topline"><div><h2>{detailExercise.name}</h2><span className="badge">{detailExercise.primary_muscle}</span>{(detailExercise.secondary_muscles||[]).map((m:string)=><span key={m} className="badge gray">{m}</span>)}</div><button className="btn small secondary" onClick={()=>setDetailExercise(null)}>Close</button></div><a href={detailExercise.video_url} target="_blank" className="thumb" style={{width:'100%',height:220,textDecoration:'none'}}></a><h3 style={{marginTop:14}}>How to Perform</h3>{(detailExercise.instructions || []).map((x:string,i:number)=><p key={i}><span className="badge">{i+1}</span>{x}</p>)}<h3>Coaching Tips</h3>{(detailExercise.tips || []).map((x:string,i:number)=><p key={i}><span className="badge green">✓</span>{x}</p>)}</div>
  }

  return <><header className="header"><div><div className="brand">Built<span>IQ</span></div><small>Logged in as {displayName}</small></div><button className="btn small secondary" onClick={()=>supabase.auth.signOut()}>Sign Out</button></header>
  <div className="shell"><aside className="panel"><div className="nav"><NavButtons /></div>{invite && <div className="notice">Household invite code: <b>{invite}</b></div>}<h3>Program Builder</h3><label>Program Name</label><input value={programName} onChange={e=>setProgramName(e.target.value)}/><div className="row"><div><label>Weeks</label><input type="number" value={weeks} onChange={e=>setWeeks(Number(e.target.value))}/></div><div><label>Goal</label><select><option>Build Muscle</option><option>Strength</option><option>Fat Loss</option></select></div></div><label>Workout Days</label><div className="days">{DAYS.map(d=><button key={d} className={'day ' + (selectedDays.includes(d)?'active':'')} onClick={()=>setSelectedDays(selectedDays.includes(d)?selectedDays.filter(x=>x!==d):[...selectedDays,d].sort((a,b)=>DAYS.indexOf(a)-DAYS.indexOf(b)))}>{d}</button>)}</div>{selectedDays.map(d=><div key={d}><label>{d} Split</label><select value={dayTypes[d] || 'Full Body'} onChange={e=>setDayTypes({...dayTypes,[d]:e.target.value})}><option>Lower Body</option><option>Upper Body</option><option>Full Body</option><option>Push</option><option>Pull</option><option>Legs</option><option>Hamstrings & Glutes</option><option>Chest & Shoulders</option><option>Back</option><option>Arms</option></select></div>)}<label>Body / Mobility Focus</label>{MUSCLES.map(m=><div className="priority" key={m}><span className="muted">{m}</span><select value={priorities[m] || 0} onChange={e=>setPriorities({...priorities,[m]:Number(e.target.value)})}><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></div>)}<button className="btn full green" style={{marginTop:14}} onClick={generateProgram}>Generate Program</button></aside>
  <main className="main"><div className="topline"><div><h2>{tab}</h2><p className="muted">{program ? program.name : 'Create your first BuiltIQ program.'}</p></div>{program && <select style={{maxWidth:150}} value={currentWeek} onChange={e=>setCurrentWeek(Number(e.target.value))}>{Array.from({length:program.weeks},(_,i)=><option key={i+1} value={i+1}>Week {i+1}</option>)}</select>}</div>
  {tab==='Dashboard' && <section><div className="stats"><div className="stat"><span>Program</span><b>{program?.weeks || 0} wk</b></div><div className="stat"><span>Workouts</span><b>{visible.length}</b></div><div className="stat"><span>Calories</span><b>{Math.round(todayNutrition.calories)}</b></div><div className="stat"><span>Protein</span><b>{Math.round(todayNutrition.protein)}g</b></div></div><div className="workoutCard"><h3>Today’s Training</h3><p className="muted">Lower body hamstring focus with mobility, exercise videos, and tracking.</p><button className="btn" onClick={()=>setTab('Train')}>Start Workout</button></div><h3>Muscle Coverage This Week</h3>{Object.entries(coverage).map(([m,v]:any)=><span key={m} className={'badge ' + (v>=9?'green':'amber')}>{m}: {v} sets</span>)}</section>}
  {tab==='Train' && <section>{renderExerciseDetail()}{!program && <div className="notice">Use the builder to generate your first program.</div>}{visible.map((w:any)=><div key={w.id} className={'workoutCard ' + (selectedWorkout===w.id?'selected':'')} onClick={()=>setSelectedWorkout(w.id)}><div className="workoutHead"><div><h2>{w.day_label}</h2><span className="badge">{w.workout_type}</span><p className="muted">Workout + mobility · tracked separately for {displayName}</p></div></div><div className="mobilityBox"><h3>Pre-Workout Mobility</h3>{(w.mobility_exercises||[]).sort((a:any,b:any)=>a.sort_order-b.sort_order).map((m:any)=><div className="mobilityRow" key={m.id}><div><b>{m.name}</b><div className="muted">{m.focus_area} · {m.duration}</div><div className="muted">{m.notes}</div></div><div><a className="btn small secondary" target="_blank" href={m.video_url}>Video</a><label className="check"><input type="checkbox" defaultChecked={mobLogs[m.id]?.completed || false} onChange={e=>updateMobLog(m.id,e.target.checked)}/>Done</label></div></div>)}</div>{(w.exercises||[]).sort((a:any,b:any)=>a.sort_order-b.sort_order).map((e:any)=>{const l=logs[e.id]||{};return <div key={e.id} className="exercise"><div className="exTop"><a className="thumb" href={e.video_url} target="_blank"></a><div><div className="exerciseName">{e.name}</div><div className="muted">{e.target_sets} sets · {e.target_reps} reps · RPE 7–8</div><span className="badge">{e.primary_muscle}</span></div><div className="actions"><button className="btn small secondary" onClick={(ev)=>{ev.stopPropagation();setDetailExercise(e)}}>Details</button> <button className="btn small secondary" onClick={(ev)=>{ev.stopPropagation();editExercise(e)}}>Edit</button> <button className="btn small red" onClick={(ev)=>{ev.stopPropagation();removeExercise(e.id)}}>Remove</button></div></div><div className="trackHeader"><span>Set</span><span>Sets</span><span>Reps</span><span>Weight</span><span>RPE</span></div><div className="track"><input value="1" readOnly/><input placeholder="Sets" defaultValue={l.actual_sets||''} onBlur={ev=>updateLog(e.id,'actual_sets',ev.target.value)}/><input placeholder="Reps" defaultValue={l.actual_reps||''} onBlur={ev=>updateLog(e.id,'actual_reps',ev.target.value)}/><input placeholder="Weight" defaultValue={l.weight||''} onBlur={ev=>updateLog(e.id,'weight',ev.target.value)}/><input placeholder="RPE" defaultValue={l.rpe||''} onBlur={ev=>updateLog(e.id,'rpe',ev.target.value)}/></div><label className="check"><input type="checkbox" defaultChecked={l.completed||false} onChange={ev=>updateLog(e.id,'completed',ev.target.checked)}/> Mark exercise complete</label><textarea rows={2} placeholder="Notes" defaultValue={l.notes||''} onBlur={ev=>updateLog(e.id,'notes',ev.target.value)}/></div>})}</div>)}</section>}
  {tab==='Mobility' && <section><div className="notice">Standalone mobility plans are next. Pre-workout mobility is already generated inside Train.</div></section>}
  {tab==='Nutrition' && <section><div className="stats"><div className="stat"><span>Calories</span><b>{Math.round(todayNutrition.calories)}</b></div><div className="stat"><span>Protein</span><b>{Math.round(todayNutrition.protein)}g</b></div><div className="stat"><span>Carbs</span><b>{Math.round(todayNutrition.carbs)}g</b></div><div className="stat"><span>Fat</span><b>{Math.round(todayNutrition.fat)}g</b></div></div><div className="workoutCard"><h3>Fast Entry</h3><div className="row"><button className="btn secondary" onClick={()=>alert('Barcode scanning comes in production app.')}>Scan Barcode</button><button className="btn" onClick={estimateVoiceFood}>Speak Food to AI</button></div></div><div className="foodrow"><input placeholder="Food" value={food.food_name} onChange={e=>setFood({...food,food_name:e.target.value})}/><input placeholder="Cal" value={food.calories} onChange={e=>setFood({...food,calories:e.target.value})}/><input placeholder="Protein" value={food.protein} onChange={e=>setFood({...food,protein:e.target.value})}/><input placeholder="Carbs" value={food.carbs} onChange={e=>setFood({...food,carbs:e.target.value})}/><input placeholder="Fat" value={food.fat} onChange={e=>setFood({...food,fat:e.target.value})}/></div><button className="btn green" onClick={()=>addFood()}>Add Food</button>{nutrition.map(f=><div key={f.id} className="exercise"><b>{f.food_name}</b><div className="muted">{f.calories} cal · {f.protein}p · {f.carbs}c · {f.fat}f · {f.source}</div></div>)}</section>}
  {tab==='Progress' && <section><div className="row"><input placeholder="Body weight" value={metric.body_weight} onChange={e=>setMetric({...metric,body_weight:e.target.value})}/><input placeholder="Waist" value={metric.waist} onChange={e=>setMetric({...metric,waist:e.target.value})}/></div><textarea rows={2} placeholder="Notes" value={metric.notes} onChange={e=>setMetric({...metric,notes:e.target.value})}/><button className="btn green" style={{marginTop:10}} onClick={addMetric}>Add Progress Entry</button>{metrics.map(m=><div key={m.id} className="exercise"><b>{m.metric_date}</b><div className="muted">Weight: {m.body_weight || '-'} · Waist: {m.waist || '-'}</div><div>{m.notes}</div></div>)}</section>}
  {tab==='Coach' && <section><div className="notice">Future AI Coach: “My hamstrings are tight,” “Only 35 minutes,” “Hotel gym,” or “I need more upper chest.”</div><h3>Body Focus Map</h3><div className="bodygrid">{MUSCLES.map(m=><div key={m} className={'bodypart ' + ((priorities[m]||0)>=3?'hot':(priorities[m]||0)>=1?'warm':'')}><div>{m}</div><div className="muted">Priority {priorities[m] || 0}</div></div>)}</div></section>}
  </main></div><div className="mobileNav">{TABS.map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</div></>
}
