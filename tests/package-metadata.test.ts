import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('package exposes the compiled analyzer CLI', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
    bin?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.bin?.['buybartersell-analyze'], 'dist/bin/analyze.mjs');
  assert.match(packageJson.scripts?.build ?? '', /build:analyze/);
});
