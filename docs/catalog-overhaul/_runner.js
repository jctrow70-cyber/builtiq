const fs=require('fs');
const {spawnSync}=require('child_process');
const root='C:/Users/JesseTrowbridge/OneDrive - Tegria/Documents/GitHub/builtiq';
const accept=root+'/docs/catalog-overhaul/phase2a3-acceptance.txt';
fs.writeFileSync(accept,'RUNNER_STARTED\n');
const tsx=root+'/node_modules/tsx/dist/cli.mjs';
const r=spawnSync(process.execPath,[tsx,'lib/scienceEngine/acceptanceCheck.ts'],{cwd:root,encoding:'utf8',timeout:180000,env:process.env});
const body=['RUNNER_STARTED','node version: '+process.version,'node exec: '+process.execPath,'tsx exists: '+fs.existsSync(tsx),'spawn status: '+r.status,'spawn error: '+(r.error?r.error.message:'none'),'--- STDOUT ---',r.stdout||'','--- STDERR ---',r.stderr||'','--- EXIT CODE ---',String(r.status)].join('\n');
fs.writeFileSync(accept,body);
