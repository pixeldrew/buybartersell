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

test('semantic-release updates package metadata before committing release assets', async () => {
  const releaseConfig = JSON.parse(await readFile('.releaserc.json', 'utf8')) as {
    plugins?: Array<string | [string, Record<string, unknown>]>;
  };

  const pluginNames = releaseConfig.plugins?.map((plugin) => Array.isArray(plugin) ? plugin[0] : plugin) ?? [];
  const npmPlugin = releaseConfig.plugins?.find(
    (plugin): plugin is [string, Record<string, unknown>] => Array.isArray(plugin) && plugin[0] === '@semantic-release/npm',
  );
  const gitPlugin = releaseConfig.plugins?.find(
    (plugin): plugin is [string, { assets?: string[] }] => Array.isArray(plugin) && plugin[0] === '@semantic-release/git',
  );

  assert.ok(npmPlugin, 'semantic-release must run @semantic-release/npm to write the next version to package.json');
  assert.equal(npmPlugin[1].npmPublish, false);
  assert.ok(
    pluginNames.indexOf('@semantic-release/npm') < pluginNames.indexOf('@semantic-release/git'),
    '@semantic-release/npm must prepare package files before @semantic-release/git commits them',
  );
  assert.deepEqual(gitPlugin?.[1].assets, ['CHANGELOG.md', 'package.json', 'package-lock.json']);
});

test('semantic-release release commit skips ci with no ci marker', async () => {
  const releaseConfig = JSON.parse(await readFile('.releaserc.json', 'utf8')) as {
    plugins?: Array<string | [string, { message?: string }]>;
  };
  const gitPlugin = releaseConfig.plugins?.find(
    (plugin): plugin is [string, { message?: string }] => Array.isArray(plugin) && plugin[0] === '@semantic-release/git',
  );

  assert.match(gitPlugin?.[1].message ?? '', /\[no ci\]/);
});
