
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MUSCLES=['Hamstrings','Glutes','Quads','Chest','Upper Chest','Shoulders','Lats','Mid Back','Core'];
const EX:any[]=[
 ['Romanian Deadlift','Hamstrings','Lower Body',4,6,10],['Seated Leg Curl','Hamstrings','Lower Body',3,10,15],['Back Squat','Quads','Lower Body',4,5,8],['Hip Thrust','Glutes','Lower Body',4,8,12],
 ['Bench Press','Chest','Upper Body',4,6,10],['Incline DB Press','Upper Chest','Upper Body',3,8,12],['Lat Pulldown','Lats','Upper Body',3,8,12],['Cable Row','Mid Back','Upper Body',3,8,12],['Plank','Core','Core',3,30,60]
].map(([name,muscle,type,sets,min,max])=>({name,muscle,type,sets,min,max}));

function pickExercises(type:string, priorities:any){
 return [...EX].sort((a,b)=>{
   const am=(type.includes('Lower')&&a.type==='Lower Body'?5:0)+(type.includes('Upper')&&a.type==='Upper Body'?5:0)+(type.includes('Full')?2:0)+(priorities[a.muscle]||0)*4;
   const bm=(type.includes('Lower')&&b.type==='Lower Body'?5:0)+(type.includes('Upper')&&b.type==='Upper Body'?5:0)+(type.includes('Full')?2:0)+(priorities[b.muscle]||0)*4;
   return bm-am;
 }).slice(0,6);
}
function warmups(working:number){
 if(!working || working<50) return [];
 return [
  {set_type:'warmup', set_number:1, target_weight:String(Math.round(working*.5/5)*5), target_reps:'8'},
  {set_type:'warmup', set_number:2, target_weight:String(Math.round(working*.7/5)*5), target_reps:'5'},
  {set_type:'warmup', set_number:3, target_weight:String(Math.round(working*.85/5)*5), target_reps:'3'}
 ];
}

export default function Page(){
 const [session,setSession]=useState<any>(null),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [householdId,setHouseholdId]=useState(''),[displayName,setDisplayName]=useState('Jesse'),[invite,setInvite]=useState('');
 const [scope,setScope]=useState<'household'|'personal'>('household'),[program,setProgram]=useState<any>(null),[programs,setPrograms]=useState<any[]>([]);
 const [programName,setProgramName]=useState('BuiltIQ V2 Plan'),[weeks,setWeeks]=useState(6),[days,setDays]=useState(['Mon','Tue','Fri']),[dayTypes,setDayTypes]=useState<any>({Mon:'Lower Body',Tue:'Upper Body',Fri:'Full Body'}),[priorities,setPriorities]=useState<any>({Hamstrings:3});
 const [week,setWeek]=useState(1),[setLogs,setSetLogs]=useState<any>({});

 useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const{data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[]);
 useEffect(()=>{if(session?.user) loadHousehold()},[session]);
 useEffect(()=>{if(householdId) loadPrograms()},[scope,householdId]);

 async function signIn(){const{error}=await supabase.auth.signInWithPassword({email,password}); if(error) alert(error.message)}
 async function signUp(){const{error}=await supabase.auth.signUp({email,password}); if(error) alert(error.message); else alert('Account created. Sign in now.')}
 async function loadHousehold(){const{data}=await supabase.from('household_members').select('*').eq('user_id',session.user.id).limit(1).maybeSingle(); if(data){setHouseholdId(data.household_id);setDisplayName(data.display_name||'Me')}}
 async function createHousehold(){const code=Math.random().toString(36).slice(2,8).toUpperCase();const{data:h,error}=await supabase.from('households').insert({name:'BuiltIQ Household',invite_code:code}).select().single();if(error)return alert(error.message);await supabase.from('household_members').insert({household_id:h.id,user_id:session.user.id,display_name:displayName});setHouseholdId(h.id);setInvite(code)}
 async function loadPrograms(){let q=supabase.from('programs').select('*, workouts(*, exercises(*))').eq('visibility',scope).order('created_at',{ascending:false}); if(scope==='household') q=q.eq('household_id',householdId); else q=q.eq('owner_user_id',session.user.id); const{data,error}=await q; if(error)return alert(error.message); setPrograms(data||[]); setProgram((data||[])[0]||null); if((data||[])[0]) await loadSetLogs((data||[])[0]);}
 async function loadSetLogs(p:any){const ids:any[]=[];(p.workouts||[]).forEach((w:any)=>(w.exercises||[]).forEach((e:any)=>ids.push(e.id))); if(!ids.length){setSetLogs({});return} const{data}=await supabase.from('exercise_set_logs').select('*').in('exercise_id',ids).eq('user_id',session.user.id); const by:any={};(data||[]).forEach((x:any)=>by[`${x.exercise_id}-${x.set_type}-${x.set_number}`]=x);setSetLogs(by)}
 async function generate(){
  const {data:p,error}=await supabase.from('programs').insert({household_id:householdId,owner_user_id:session.user.id,visibility:scope,name:programName,weeks,goal:'Build Muscle',priorities}).select().single(); if(error)return alert(error.message);
  const workoutRows:any[]=[]; for(let w=1;w<=weeks;w++) days.forEach(d=>workoutRows.push({program_id:p.id,week:w,day_label:d,day_order:DAYS.indexOf(d),workout_type:dayTypes[d]||'Full Body'}));
  const{data:ws,error:we}=await supabase.from('workouts').insert(workoutRows).select(); if(we)return alert(we.message);
  for(const w of ws||[]){const rows=pickExercises(w.workout_type,priorities).map((e:any,i:number)=>({workout_id:w.id,sort_order:i,name:e.name,primary_muscle:e.muscle,target_sets:e.sets,target_rep_min:e.min,target_rep_max:e.max,video_url:'https://www.youtube.com/results?search_query='+encodeURIComponent(e.name+' proper form')})); const{error:ee}=await supabase.from('exercises').insert(rows); if(ee)return alert(ee.message)}
  await loadPrograms();
 }
 async function saveSet(exercise:any,setType:string,setNumber:number,field:string,value:string){
   const key=`${exercise.id}-${setType}-${setNumber}`; const old=setLogs[key]||{};
   const payload={exercise_id:exercise.id,user_id:session.user.id,set_type:setType,set_number:setNumber,target_reps:old.target_reps||'',target_weight:old.target_weight||'',weight:field==='weight'?value:old.weight||'',reps:field==='reps'?value:old.reps||'',rpe:field==='rpe'?value:old.rpe||'',completed:old.completed||false};
   const{data,error}=await supabase.from('exercise_set_logs').upsert(payload,{onConflict:'exercise_id,user_id,set_number,set_type'}).select().single(); if(error)return alert(error.message); setSetLogs({...setLogs,[key]:data});
 }
 function suggestedWeight(e:any){return e.primary_muscle==='Hamstrings'?185:e.primary_muscle==='Chest'?155:e.primary_muscle==='Quads'?185:100}

 if(!session)return <><header className="header"><div><div className="brand">Built<span>IQ</span> V2</div><div className="muted">Household + personal training</div></div></header><div className="login"><div className="panel"><h2>Sign in</h2><label>Email</label><input value={email} onChange={e=>setEmail(e.target.value)}/><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)}/><button className="btn full" style={{marginTop:12}} onClick={signIn}>Sign In</button><button className="btn secondary full" style={{marginTop:8}} onClick={signUp}>Create Account</button></div></div></>;
 if(!householdId)return <><header className="header"><div className="brand">Built<span>IQ</span> V2</div><button className="btn secondary" onClick={()=>supabase.auth.signOut()}>Sign Out</button></header><div className="login"><div className="panel"><h2>Household Setup</h2><label>Your name</label><input value={displayName} onChange={e=>setDisplayName(e.target.value)}/><button className="btn green full" style={{marginTop:12}} onClick={createHousehold}>Create Household</button></div></div></>;

 const workouts=(program?.workouts||[]).filter((w:any)=>w.week===week).sort((a:any,b:any)=>a.day_order-b.day_order);
 return <><header className="header"><div><div className="brand">Built<span>IQ</span> V2</div><div className="muted">Logged in as {displayName}</div></div><button className="btn secondary" onClick={()=>supabase.auth.signOut()}>Sign Out</button></header><div className="shell"><aside className="panel"><div className="scope"><button className={scope==='household'?'active':''} onClick={()=>setScope('household')}>Household</button><button className={scope==='personal'?'active':''} onClick={()=>setScope('personal')}>My Personal</button></div><p className="muted">{scope==='household'?'Shared workout plans visible to household members.':'Private workout plans visible only to you.'}</p>{invite&&<p className="badge green">Invite: {invite}</p>}<label>Program name</label><input value={programName} onChange={e=>setProgramName(e.target.value)}/><div className="row"><div><label>Weeks</label><input type="number" value={weeks} onChange={e=>setWeeks(Number(e.target.value))}/></div><div><label>Week view</label><select value={week} onChange={e=>setWeek(Number(e.target.value))}>{Array.from({length:weeks},(_,i)=><option key={i+1}>{i+1}</option>)}</select></div></div><label>Workout days</label><div className="days">{DAYS.map(d=><button key={d} className={'day '+(days.includes(d)?'active':'')} onClick={()=>setDays(days.includes(d)?days.filter(x=>x!==d):[...days,d].sort((a,b)=>DAYS.indexOf(a)-DAYS.indexOf(b)))}>{d}</button>)}</div>{days.map(d=><div key={d}><label>{d} split</label><select value={dayTypes[d]||'Full Body'} onChange={e=>setDayTypes({...dayTypes,[d]:e.target.value})}><option>Lower Body</option><option>Upper Body</option><option>Full Body</option><option>Push</option><option>Pull</option><option>Legs</option></select></div>)}<label>Muscle focus</label>{MUSCLES.map(m=><div className="priority" key={m}><span className="muted">{m}</span><select value={priorities[m]||0} onChange={e=>setPriorities({...priorities,[m]:Number(e.target.value)})}><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></div>)}<button className="btn green full" style={{marginTop:14}} onClick={generate}>Generate {scope==='household'?'Household':'Personal'} Program</button></aside><main className="main"><div className="stats"><div className="stat"><span className="muted">Scope</span><b>{scope==='household'?'Shared':'Personal'}</b></div><div className="stat"><span className="muted">Programs</span><b>{programs.length}</b></div><div className="stat"><span className="muted">Week</span><b>{week}</b></div><div className="stat"><span className="muted">Workouts</span><b>{workouts.length}</b></div></div>{!program&&<div className="card"><h2>No {scope} program yet</h2><p className="muted">Generate one from the builder.</p></div>}{workouts.map((w:any)=><div className="card" key={w.id}><h2>{w.day_label} · {w.workout_type}</h2>{(w.exercises||[]).sort((a:any,b:any)=>a.sort_order-b.sort_order).map((e:any)=>{const sw=suggestedWeight(e);const wu=warmups(sw);const working=Array.from({length:e.target_sets||3},(_,i)=>({set_type:'working',set_number:i+1,target_weight:String(sw),target_reps:`${e.target_rep_min}-${e.target_rep_max}`}));return <div className="card" key={e.id}><h3>{e.name}</h3><span className="badge">{e.primary_muscle}</span><span className="badge green">{e.target_sets} sets · {e.target_rep_min}-{e.target_rep_max} reps</span><a className="btn small secondary" target="_blank" href={e.video_url}>Video</a><p className="muted">Suggested working weight: {sw} lb. Warm-ups are calculated from that target.</p><div className="setgrid muted"><b>Type</b><b>Target</b><b>Weight</b><b>Reps</b><b>RPE</b></div>{[...wu,...working].map((s:any)=>{const key=`${e.id}-${s.set_type}-${s.set_number}`;const l=setLogs[key]||{};return <div className="setgrid" key={key}><span className={'badge '+(s.set_type==='warmup'?'amber':'green')}>{s.set_type} {s.set_number}</span><span className="muted">{s.target_weight} × {s.target_reps}</span><input placeholder="lb" defaultValue={l.weight||s.target_weight||''} onBlur={ev=>saveSet(e,s.set_type,s.set_number,'weight',ev.target.value)}/><input placeholder="reps" defaultValue={l.reps||''} onBlur={ev=>saveSet(e,s.set_type,s.set_number,'reps',ev.target.value)}/><input placeholder="RPE" defaultValue={l.rpe||''} onBlur={ev=>saveSet(e,s.set_type,s.set_number,'rpe',ev.target.value)}/></div>})}</div>})}</div>)}</main></div></>;
}
