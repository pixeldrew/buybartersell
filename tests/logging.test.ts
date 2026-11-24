import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('server console output includes UTC timestamps and preserves error details', () => {
  const result = spawnSync(process.execPath, [
    '--import', 'ts-node/register', '--input-type=module', '-e',
    "import './src/logging.ts'; console.log('value: %s', 'ok'); console.error('failed:', new Error('example'));",
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^\[\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\] value: ok/m);
  assert.match(result.stderr, /^\[\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\] failed: Error: example/m);
  assert.match(result.stderr, /\n\s+at /);
});
