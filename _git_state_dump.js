const { execSync } = require('child_process');
const fs = require('fs');
const cwd = __dirname;
const g = (args) => execSync(`git -c core.pager=cat ${args}`, { cwd, encoding: 'utf8' });
const lines = [];
const add = (title, cmd) => {
  lines.push(`\n=== ${title} ===\n`);
  try {
    lines.push(g(cmd));
  } catch (e) {
    lines.push(String(e.stdout || e.message));
  }
};
add('status', 'status');
add('head', 'rev-parse --abbrev-ref HEAD');
add('branch -vv', 'branch -vv');
add('branch -a nutrition', 'branch -a --list "*nutrition*"');
add('log -15', 'log --oneline -15');
add('main log -5', 'log --oneline -5 main');
add('preview log -5', 'log --oneline -5 preview/nutrition-ux-biq-0135');
add('main..preview', 'log --oneline main..preview/nutrition-ux-biq-0135');
add('preview..main', 'log --oneline preview/nutrition-ux-biq-0135..main');
add('remote -v', 'remote -v');
add('branch -r', 'branch -r');
fs.writeFileSync('_git_state_dump.txt', lines.join(''), 'utf8');
console.log('written _git_state_dump.txt');
