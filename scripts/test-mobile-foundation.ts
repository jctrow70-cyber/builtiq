/**
 * MOB-01 / BIQ-0325 — lightweight foundation checks (no device required).
 */
import assert from 'assert';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  apiUrl,
  getApiBaseUrl,
  getNativeServiceStatus,
  listNativeServiceStatuses,
  parseBuildIqDeepLink,
} from '../lib/mobile';

const root = join(__dirname, '..');

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

assert.equal(getApiBaseUrl(), '', 'API base defaults empty for same-origin web');
assert.equal(apiUrl('/api/programs/generate'), '/api/programs/generate');

const invite = parseBuildIqDeepLink('https://example.test/invite/abc%20123');
assert.equal(invite?.token, 'abc 123');
assert.equal(parseBuildIqDeepLink('not a url'), null);

assert.equal(getNativeServiceStatus('healthkit').available, false);
assert.equal(listNativeServiceStatuses().length, 4);

assert.ok(existsSync(join(root, 'capacitor.config.ts')));
assert.ok(existsSync(join(root, 'mobile/www/index.html')));
assert.ok(existsSync(join(root, 'mobile/dev-target.example.json')));
assert.ok(existsSync(join(root, 'docs/mobile/MOB-01.md')));

const cap = read('capacitor.config.ts');
assert.ok(cap.includes("appId: 'com.buildiq.health.dev'"));
assert.ok(cap.includes('BuildIQ Health Dev'));
// Production host may appear only as an explicit "do not use" warning, never as server.url.
assert.ok(
  !/url:\s*['"`]https:\/\/builtiq-duf7\.vercel\.app['"`]/.test(cap),
  'capacitor config must not set server.url to production'
);
assert.ok(/Never default to production/i.test(cap) || /Do not/i.test(cap));

const pkg = JSON.parse(read('package.json'));
assert.ok(pkg.dependencies['@capacitor/core']);
assert.ok(pkg.dependencies['@capacitor/app']);
assert.ok(pkg.devDependencies['@capacitor/cli']);
assert.ok(pkg.devDependencies['@capacitor/android']);
assert.ok(pkg.devDependencies['@capacitor/ios']);

const envExample = read('.env.example');
assert.ok(envExample.includes('BUILDIQ_MOBILE_SERVER_URL'));
assert.ok(envExample.includes('Do NOT set this to https://builtiq-duf7.vercel.app'));

console.log('MOB-01 mobile foundation checks passed');
