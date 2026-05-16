#!/usr/bin/env node
import { constants, brotliCompress } from 'node:zlib';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const brotliCompressAsync = promisify(brotliCompress);

const compressibleExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.svg',
  '.txt',
  '.webmanifest',
  '.xml',
]);

const skippedExtensions = new Set([
  '.br',
  '.gz',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.mp4',
  '.mov',
  '.mp3',
  '.ogg',
  '.zip',
]);

function shouldCompress(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (skippedExtensions.has(extension)) return false;
  return compressibleExtensions.has(extension);
}

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

export async function brotliStaticAssets(distDir) {
  const target = path.resolve(distDir);
  const stats = await stat(target);
  if (!stats.isDirectory()) {
    throw new Error(`${target} is not a directory`);
  }

  const files = await walkFiles(target);
  let compressedCount = 0;

  for (const filePath of files) {
    if (!shouldCompress(filePath)) continue;

    const source = await readFile(filePath);
    const compressed = await brotliCompressAsync(source, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
      },
    });

    await writeFile(`${filePath}.br`, compressed);
    compressedCount += 1;
  }

  return compressedCount;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const distDir = process.argv[2];

  if (!distDir) {
    console.error('Usage: node bin/brotli-static-assets.mjs <dist-dir>');
    process.exit(1);
  }

  try {
    const compressedCount = await brotliStaticAssets(distDir);
    console.log(`Created ${compressedCount} Brotli asset(s) in ${distDir}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
