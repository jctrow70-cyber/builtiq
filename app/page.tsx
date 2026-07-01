
'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DEFAULT:any={
 'Lower Body':[['Romanian Deadlift','Hamstrings',4,'6-10','7-8','185'],['Back Squat','Quads',4,'5-8','7-8','185'],['Seated Leg Curl','Hamstrings',3,'10-15','8','90'],['Hip Thrust','Glutes',3,'8-12','8','185']],
 'Upper Body':[['Bench Press','Chest',4,'6-10','7-8','155'],['Lat Pulldown','Lats',3,'8-12','8','120'],['Incline DB Press','Upper Chest',3,'8-12','8','55'],['Cable Row','Mid Back',3,'8-12','8','120']],
 'Full Body':[['Romanian Deadlift','Hamstrings',3,'6-10','7-8','185'],['Bench Press','Chest',3,'6-10','7-8','155'],['Lat Pulldown','Lats',3,'8-12','8','120'],['Goblet Squat','Quads',3,'10-12','8','60']]
};
const today=()=>new Date().toISOString().slice(0,10);

export default function Page(){
 const [session,setSession]=useState<any>(null),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [profile,setProfile]=useState<any>(null),[displayName,setDisplayName]=useState('Jesse');
 const [teams,setTeams]=useState<any[]>([]),[team,setTeam]=useState<any>(null),[members,setMembers]=useState<any[]>([]),[mode,setMode]=useState<'personal'|'team'>('personal');
 const [programs,setPrograms]=useState<any[]>([]),[program,setProgram]=useState<any>(null),[programName,setProgramName]=useState('Strength Program'),[weeks,setWeeks]=useState(6);
 const [week,setWeek]=useState(1),[days,setDays]=useState(['Mon','Tue','Fri']),[dayTypes,setDayTypes]=useState<any>({Mon:'Lower Body',Tue:'Upper Body',Fri:'Full Body'}),[activeWorkout,setActiveWorkout]=useState('');
 const [logDate,setLogDate]=useState(today()),[logs,setLogs]=useState<any>({});
 const refs=useRef<any[]>([]);

 useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const{data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[]);
 useEffect(()=>{if(session?.user) boot()},[session]);
 useEffect(()=>{if(profile) loadPrograms()},[mode,team,profile]);
 useEffect(()=>{if(program) loadLogs(program)},[program,logDate]);

 async function boot(){await loadProfile(); await loadTeams();}
 async function signIn(){const{error}=await supabase.auth.signInWithPassword({email,password}); if(error)alert(error.message)}
 async function signUp(){const{error}=await supabase.auth.signUp({email,password}); if(error)alert(error.message); else alert('Account created. Sign in now.')}
 async function loadProfile(){const{data}=await supabase.from('st_profiles').select('*').eq('user_id',session.user.id).maybeSingle(); if(data){setProfile(data);setDisplayName(data.display_name||'Me')}else setProfile(null)}
 async function createProfile(){const{error}=await supabase.from('st_profiles').upsert({user_id:session.user.id,display_name:displayName}); if(error)return alert(error.message); await loadProfile()}
 async function loadTeams(){const{data}=await supabase.from('st_team_members').select('*, st_teams(*)').eq('user_id',session.user.id).eq('status','active'); const ts=(data||[]).map((m:any)=>({...m.st_teams,my_role:m.role})).filter(Boolean); setTeams(ts); if(!team&&ts.length)setTeam(ts[0])}
 async function createTeam(){const name=prompt('Team name','Trowbridge Team'); if(!name)return; const code=Math.random().toString(36).slice(2,8).toUpperCase(); const{data:t,error}=await supabase.from('st_teams').insert({name,invite_code:code,owner_user_id:session.user.id}).select().single(); if(error)return alert(error.message); const{error:me}=await supabase.from('st_team_members').insert({team_id:t.id,user_id:session.user.id,display_name:displayName,role:'owner'}); if(me)return alert(me.message); await loadTeams(); setMode('team'); setTeam({...t,my_role:'owner'});}
 async function joinTeam(){const code=prompt('Invite code'); if(!code)return; const{data:t,error}=await supabase.from('st_teams').select('*').eq('invite_code',code.toUpperCase()).single(); if(error||!t)return alert('Team not found'); const{error:me}=await supabase.from('st_team_members').insert({team_id:t.id,user_id:session.user.id,display_name:displayName,role:'member'}); if(me)return alert(me.message); await loadTeams(); setMode('team');}
 async function loadMembers(){if(!team)return; const{data}=await supabase.from('st_team_members').select('*').eq('team_id',team.id).order('created_at'); setMembers(data||[])}

 function canEdit(){return mode==='personal'||team?.my_role==='owner'||team?.my_role==='editor'}
 function isOwner(){return mode==='team'&&team?.my_role==='owner'}

 async function loadPrograms(){
  let q=supabase.from('st_programs').select('*, st_workouts(*, st_exercises(*, st_planned_sets(*)))').order('created_at',{ascending:false});
  q=mode==='personal'?q.eq('visibility','personal').eq('owner_user_id',session.user.id):q.eq('visibility','team').eq('team_id',team?.id||'00000000-0000-0000-0000-000000000000');
  const{data,error}=await q; if(error)return alert(error.message);
  setPrograms(data||[]); setProgram((data||[])[0]||null);
  const first=(data||[])[0]?.st_workouts?.sort((a:any,b:any)=>a.week-b.week||a.day_order-b.day_order)?.[0]; if(first)setActiveWorkout(first.id);
 }

 async function loadLogs(p:any){
  const ids:any[]=[];(p.st_workouts||[]).forEach((w:any)=>(w.st_exercises||[]).forEach((e:any)=>(e.st_planned_sets||[]).forEach((s:any)=>ids.push(s.id))));
  if(!ids.length){setLogs({});return}
  const{data}=await supabase.from('st_set_logs').select('*').in('planned_set_id',ids).eq('user_id',session.user.id).eq('log_date',logDate);
  const by:any={};(data||[]).forEach((l:any)=>by[l.planned_set_id]=l);setLogs(by);
 }

 async function generate(){
  if(mode==='team'&&!team)return alert('Create or join a team first.');
  if(mode==='team'&&!canEdit())return alert('Only the owner or editors can create team programs.');
  const{data:p,error}=await supabase.from('st_programs').insert({owner_user_id:session.user.id,team_id:mode==='team'?team.id:null,visibility:mode,name:programName,weeks}).select().single(); if(error)return alert(error.message);
  const wr:any=[]; for(let w=1;w<=weeks;w++)days.forEach(d=>wr.push({program_id:p.id,week:w,day_order:DAYS.indexOf(d),day_label:d,workout_type:dayTypes[d]||'Full Body'}));
  const{data:ws,error:we}=await supabase.from('st_workouts').insert(wr).select(); if(we)return alert(we.message);
  for(const w of ws||[]){
   const list=DEFAULT[w.workout_type]||DEFAULT['Full Body'];
   const{data:exs,error:ee}=await supabase.from('st_exercises').insert(list.map((x:any,i:number)=>({workout_id:w.id,sort_order:i,name:x[0],muscle_group:x[1]}))).select(); if(ee)return alert(ee.message);
   for(const e of exs||[]){
    const t=list.find((x:any)=>x[0]===e.name)||list[0], sets=Number(t[2]), wt=Number(t[5]||0);
    const rows:any[]=[{sort_order:0,set_number:1,set_type:'warmup',target_weight:wt?String(Math.round(wt*.5/5)*5):'',target_reps:'8',target_rpe:'5'},{sort_order:1,set_number:2,set_type:'warmup',target_weight:wt?String(Math.round(wt*.7/5)*5):'',target_reps:'5',target_rpe:'6'}];
    for(let i=0;i<sets;i++)rows.push({sort_order:i+10,set_number:i+1,set_type:'working',target_weight:String(t[5]||''),target_reps:t[3],target_rpe:t[4]});
    await supabase.from('st_planned_sets').insert(rows.map(r=>({...r,exercise_id:e.id})));
   }
  }
  await loadPrograms();
 }

 async function addExercise(wid:string){if(!canEdit())return alert('Only owner/editors can change the shared team program.'); const name=prompt('Exercise name'); if(!name)return; const muscle=prompt('Muscle group','')||''; const{data:e,error}=await supabase.from('st_exercises').insert({workout_id:wid,sort_order:99,name,muscle_group:muscle}).select().single(); if(error)return alert(error.message); await supabase.from('st_planned_sets').insert([{exercise_id:e.id,sort_order:10,set_number:1,set_type:'working',target_reps:'8-12',target_rpe:'8'},{exercise_id:e.id,sort_order:11,set_number:2,set_type:'working',target_reps:'8-12',target_rpe:'8'},{exercise_id:e.id,sort_order:12,set_number:3,set_type:'working',target_reps:'8-12',target_rpe:'8'}]); await loadPrograms();}
 async function editExercise(e:any){if(!canEdit())return alert('Only owner/editors can edit exercises.'); const name=prompt('Exercise',e.name); if(!name)return; const muscle=prompt('Muscle',e.muscle_group||'')||''; await supabase.from('st_exercises').update({name,muscle_group:muscle}).eq('id',e.id); await loadPrograms();}
 async function removeExercise(e:any){if(!canEdit())return alert('Only owner/editors can remove exercises.'); if(confirm('Remove exercise?')){await supabase.from('st_exercises').delete().eq('id',e.id); await loadPrograms();}}
 async function moveExercise(e:any,dir:number){if(!canEdit())return alert('Only owner/editors can reorder.'); await supabase.from('st_exercises').update({sort_order:(e.sort_order||0)+dir}).eq('id',e.id); await loadPrograms();}
 async function addSet(e:any){if(!canEdit())return alert('Only owner/editors can change planned sets.'); const type=prompt('Set type','working')||'working'; const n=Number(prompt('Set #','1')||1); await supabase.from('st_planned_sets').insert({exercise_id:e.id,sort_order:99,set_number:n,set_type:type,target_reps:'8-12',target_rpe:'8'}); await loadPrograms();}
 async function editSet(s:any,field:string,value:any){if(!canEdit())return alert('Only owner/editors can change planned sets.'); await supabase.from('st_planned_sets').update({[field]:value}).eq('id',s.id); await loadPrograms();}
 async function removeSet(s:any){if(!canEdit())return alert('Only owner/editors can remove planned sets.'); if(confirm('Remove planned set for everyone?')){await supabase.from('st_planned_sets').update({is_deleted:true}).eq('id',s.id); await loadPrograms();}}
 async function saveLog(sid:string,field:string,value:any){const old=logs[sid]||{}; const payload={planned_set_id:sid,user_id:session.user.id,log_date:logDate,actual_weight:field==='actual_weight'?value:old.actual_weight||'',actual_reps:field==='actual_reps'?value:old.actual_reps||'',actual_rpe:field==='actual_rpe'?value:old.actual_rpe||'',completed:true}; const{data,error}=await supabase.from('st_set_logs').upsert(payload,{onConflict:'planned_set_id,user_id,log_date'}).select().single(); if(error)return alert(error.message); setLogs({...logs,[sid]:data});}
 async function setRole(member:any,role:string){if(!isOwner())return alert('Only owner can change roles.'); await supabase.from('st_team_members').update({role}).eq('id',member.id); await loadMembers(); await loadTeams();}
 function next(e:any){if(e.key==='Enter'||e.key==='ArrowRight'){e.preventDefault(); const i=refs.current.indexOf(e.currentTarget); if(refs.current[i+1])refs.current[i+1].focus();}}

 const weekWorkouts=(program?.st_workouts||[]).filter((w:any)=>w.week===week).sort((a:any,b:any)=>a.day_order-b.day_order);
 const workout=weekWorkouts.find((w:any)=>w.id===activeWorkout)||weekWorkouts[0];
 const planned=(workout?.st_exercises||[]).reduce((n:number,e:any)=>n+(e.st_planned_sets||[]).filter((s:any)=>!s.is_deleted).length,0);
 const logged=Object.values(logs).filter((x:any)=>x.completed).length;

 if(!session)return <><header className="header"><div><div className="brand">Built<span>IQ</span> Strength Team</div><div className="muted">usable team strength logging</div></div></header><div className="login"><div className="panel"><h2>Sign in</h2><label>Email</label><input value={email} onKeyDown={e=>{if(e.key==='Enter')signIn()}} onChange={e=>setEmail(e.target.value)}/><label>Password</label><input type="password" value={password} onKeyDown={e=>{if(e.key==='Enter')signIn()}} onChange={e=>setPassword(e.target.value)}/><button className="btn full" style={{marginTop:10}} onClick={signIn}>Sign In</button><button className="btn secondary full" style={{marginTop:8}} onClick={signUp}>Create Account</button></div></div></>;
 if(!profile)return <><header className="header"><div className="brand">Built<span>IQ</span> Strength Team</div><button className="btn secondary" onClick={()=>supabase.auth.signOut()}>Sign Out</button></header><div className="login"><div className="panel"><h2>Set up profile</h2><label>Name</label><input value={displayName} onChange={e=>setDisplayName(e.target.value)}/><button className="btn green full" style={{marginTop:10}} onClick={createProfile}>Start</button></div></div></>;

 return <><header className="header"><div><div className="brand">Built<span>IQ</span> Strength Team</div><div className="muted">{displayName} · {mode==='team'?(team?.name||'Team'):'Personal'} · {canEdit()?'can edit plan':'log only'}</div></div><button className="btn secondary" onClick={()=>supabase.auth.signOut()}>Sign Out</button></header>
 <div className="shell"><aside className="panel">
  <div className="tabs"><button className={mode==='personal'?'active':''} onClick={()=>setMode('personal')}>Personal</button><button className={mode==='team'?'active':''} onClick={()=>setMode('team')}>Team</button></div>
  {mode==='team'&&<div className="card compact"><label>Team</label><select value={team?.id||''} onChange={e=>setTeam(teams.find((t:any)=>t.id===e.target.value))}><option value="">Select</option>{teams.map((t:any)=><option key={t.id} value={t.id}>{t.name} · {t.my_role}</option>)}</select><div className="actions" style={{marginTop:8}}><button className="btn small secondary" onClick={createTeam}>Create</button><button className="btn small secondary" onClick={joinTeam}>Join</button><button className="btn small secondary" onClick={loadMembers}>Members</button></div>{team&&<p className="muted">Invite: {team.invite_code}</p>}</div>}
  <label>Program</label><select value={program?.id||''} onChange={e=>setProgram(programs.find((p:any)=>p.id===e.target.value))}>{programs.length===0&&<option>No programs</option>}{programs.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
  <label>New program</label><input value={programName} onChange={e=>setProgramName(e.target.value)}/><label>Weeks</label><input type="number" value={weeks} onChange={e=>setWeeks(Number(e.target.value))}/>
  <label>Workout days</label><div className="tabs">{DAYS.map(d=><button key={d} className={days.includes(d)?'active':''} onClick={()=>setDays(days.includes(d)?days.filter(x=>x!==d):[...days,d].sort((a,b)=>DAYS.indexOf(a)-DAYS.indexOf(b)))}>{d}</button>)}</div>
  {days.map(d=><div key={d}><label>{d} type</label><select value={dayTypes[d]||'Full Body'} onChange={e=>setDayTypes({...dayTypes,[d]:e.target.value})}><option>Lower Body</option><option>Upper Body</option><option>Full Body</option></select></div>)}
  <button className="btn green full" style={{marginTop:10}} onClick={generate}>Generate {mode==='team'?'Team':'Personal'} Program</button>
  {members.length>0&&<div className="card compact"><h3>Team Members</h3>{members.map((m:any)=><div key={m.id} className="topline" style={{justifyContent:'space-between',marginTop:6}}><span>{m.display_name||m.user_id.slice(0,6)}</span><select disabled={!isOwner()||m.user_id===session.user.id} value={m.role} onChange={e=>setRole(m,e.target.value)} style={{maxWidth:115}}><option>owner</option><option>editor</option><option>member</option></select></div>)}</div>}
 </aside>
 <main className="main">
  <div className="stats"><div className="stat"><span className="muted">Week</span><b>{week}</b></div><div className="stat"><span className="muted">Exercises</span><b>{workout?.st_exercises?.length||0}</b></div><div className="stat"><span className="muted">Sets</span><b>{planned}</b></div><div className="stat"><span className="muted">Logged</span><b>{logged}</b></div></div>
  <div className="row"><div><label>Date</label><input type="date" value={logDate} onChange={e=>setLogDate(e.target.value)}/></div><div><label>Week</label><select value={week} onChange={e=>setWeek(Number(e.target.value))}>{Array.from({length:program?.weeks||weeks},(_,i)=><option key={i+1} value={i+1}>Week {i+1}</option>)}</select></div></div>
  <div className="tabs">{weekWorkouts.map((w:any)=><button key={w.id} className={workout?.id===w.id?'active':''} onClick={()=>setActiveWorkout(w.id)}>{w.day_label} · {w.workout_type}</button>)}</div>
  {!program&&<div className="card"><h2>No program yet</h2><p className="muted">Generate a program. Team programs are edited by owner/editors only; members log only.</p></div>}
  {workout&&<div className="card compact"><div className="topline" style={{justifyContent:'space-between'}}><h2>{workout.day_label} · {workout.workout_type}</h2>{canEdit()&&<button className="btn small secondary" onClick={()=>addExercise(workout.id)}>Add Exercise</button>}</div></div>}
  {(workout?.st_exercises||[]).sort((a:any,b:any)=>(a.sort_order||0)-(b.sort_order||0)).map((ex:any)=><div className="card compact" key={ex.id}>
   <div className="exercise-head"><div><h3>{ex.name}</h3><span className="badge">{ex.muscle_group||'Muscle'}</span></div>{canEdit()&&<div className="actions"><button className="btn small secondary" onClick={()=>moveExercise(ex,-1)}>↑</button><button className="btn small secondary" onClick={()=>moveExercise(ex,1)}>↓</button><button className="btn small secondary" onClick={()=>editExercise(ex)}>Edit</button><button className="btn small red" onClick={()=>removeExercise(ex)}>X</button></div>}</div>
   {canEdit()&&<button className="btn small secondary" onClick={()=>addSet(ex)}>Add Set</button>}
   <div className="setgrid muted"><b>Type</b><b>#</b><b>Wt</b><b>Reps</b><b>RPE</b><b>Plan</b></div>
   {(ex.st_planned_sets||[]).filter((s:any)=>!s.is_deleted).sort((a:any,b:any)=>(a.sort_order||0)-(b.sort_order||0)).map((s:any)=>{const l=logs[s.id]||{};return <div className="setgrid" key={s.id}>
    <select disabled={!canEdit()} value={s.set_type} onChange={e=>editSet(s,'set_type',e.target.value)}><option>warmup</option><option>working</option><option>backoff</option><option>dropset</option><option>amrap</option></select>
    <input disabled={!canEdit()} value={s.set_number} onChange={e=>editSet(s,'set_number',Number(e.target.value))}/>
    <input ref={el=>{if(el&&!refs.current.includes(el))refs.current.push(el)}} onKeyDown={next} placeholder={s.target_weight||'lb'} defaultValue={l.actual_weight||''} onBlur={e=>saveLog(s.id,'actual_weight',e.target.value)}/>
    <input ref={el=>{if(el&&!refs.current.includes(el))refs.current.push(el)}} onKeyDown={next} placeholder={s.target_reps||'reps'} defaultValue={l.actual_reps||''} onBlur={e=>saveLog(s.id,'actual_reps',e.target.value)}/>
    <input ref={el=>{if(el&&!refs.current.includes(el))refs.current.push(el)}} onKeyDown={next} placeholder={s.target_rpe||'rpe'} defaultValue={l.actual_rpe||''} onBlur={e=>saveLog(s.id,'actual_rpe',e.target.value)}/>
    {canEdit()?<button className="btn small red" onClick={()=>removeSet(s)}>X</button>:<span className="muted">log</span>}
   </div>})}
  </div>)}
 </main></div></>
}
