#!/usr/bin/env node
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const compiledJsPath = path.resolve('dist/bin/analyze.js');
const compiledMjsPath = path.resolve('dist/bin/analyze.mjs');

let compiled = await readFile(compiledJsPath, 'utf8');
compiled = compiled
  .replace('#!/usr/bin/env ts-node', '#!/usr/bin/env node')
  .replaceAll('../src/', '../');

await mkdir(path.dirname(compiledMjsPath), { recursive: true });
await writeFile(compiledJsPath, compiled);
await rename(compiledJsPath, compiledMjsPath);
await rm(path.resolve('dist/src'), { recursive: true, force: true });
