import assert from 'node:assert/strict';
import { brotliDecompress } from 'node:zlib';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const brotliDecompressAsync = promisify(brotliDecompress);

test('brotli static asset script creates precompressed files for static exports', async () => {
  const distDir = await mkdtemp(path.join(os.tmpdir(), 'brotli-static-assets-'));
  const jsPath = path.join(distDir, 'app.js');
  const imagePath = path.join(distDir, 'logo.png');
  const existingCompressedPath = path.join(distDir, 'already.css.br');
  const jsSource = 'const message = "hello static export";\n'.repeat(20);

  await writeFile(jsPath, jsSource);
  await writeFile(imagePath, 'png data should not be recompressed');
  await writeFile(existingCompressedPath, 'existing compressed asset');

  await execFileAsync(process.execPath, ['bin/brotli-static-assets.mjs', distDir], {
    cwd: process.cwd(),
  });

  const compressed = await readFile(`${jsPath}.br`);
  const decompressed = await brotliDecompressAsync(compressed);

  assert.equal(decompressed.toString(), jsSource);
  await assert.rejects(readFile(`${imagePath}.br`), { code: 'ENOENT' });
  await assert.rejects(readFile(`${existingCompressedPath}.br`), { code: 'ENOENT' });
});
