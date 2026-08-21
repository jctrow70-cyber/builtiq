const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const cwd = 'C:/Users/JesseTrowbridge/OneDrive - Tegria/Documents/GitHub/builtiq';
const out = path.join(cwd, '_git_state_dump.txt');
const g = (args) => execSync(`git -c core.pager=cat ${args}`, { cwd, encoding: 'utf8' });
const lines = [];
const add = (title, cmd) => {
  lines.push(`\n=== ${title} ===\n`);
  try {
    lines.push(g(cmd));
  } catch (e) {
    lines.push(String(e.stdout || e.stderr || e.message));
  }
};
add('status', 'status --short --branch');
add('head', 'rev-parse --abbrev-ref HEAD');
add('branch -vv', 'branch -vv');
add('branch -a nutrition', 'branch -a --list "*nutrition*"');
add('log -8', 'log --oneline -8');
add('main..HEAD', 'log --oneline main..HEAD');
add('HEAD..main', 'log --oneline HEAD..main');
add('remote -v', 'remote -v');
fs.writeFileSync(out, lines.join(''), 'utf8');
