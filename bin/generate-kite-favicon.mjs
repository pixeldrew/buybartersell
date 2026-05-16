#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const targets = [
  'client/admin/public/favicon.ico',
  'client/join/public/favicon.ico',
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <path
    d="M20 106 C46 46 93 24 128 55 C163 24 210 46 236 106 C202 139 165 160 128 170 C91 160 54 139 20 106 Z"
    fill="#071827"
  />
  <path
    d="M43 103 C67 61 96 45 124 72 C105 91 91 113 82 137 C67 130 54 119 43 103 Z"
    fill="#23b8c7"
  />
  <path
    d="M132 72 C160 45 189 61 213 103 C202 119 189 130 174 137 C165 113 151 91 132 72 Z"
    fill="#ff785b"
  />
  <path
    d="M82 137 C94 113 109 91 128 72 C147 91 162 113 174 137 C145 148 111 148 82 137 Z"
    fill="#f9fbff"
    opacity="0.9"
  />
  <path
    d="M43 103 C67 61 96 45 124 72 C126 74 127 76 128 78 C129 76 130 74 132 72 C160 45 189 61 213 103"
    fill="none"
    stroke="#071827"
    stroke-width="13"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M128 65 V171"
    fill="none"
    stroke="#071827"
    stroke-width="12"
    stroke-linecap="round"
  />
  <path
    d="M95 105 H115 M141 105 H161 M104 130 H121 M135 130 H152"
    fill="none"
    stroke="#071827"
    stroke-width="9"
    stroke-linecap="round"
  />
  <path
    d="M63 101 C81 75 101 67 118 82 M138 82 C155 67 175 75 193 101"
    fill="none"
    stroke="#f9fbff"
    stroke-width="8"
    stroke-linecap="round"
    opacity="0.75"
  />
</svg>`;

async function generateFavicon(target) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'handwing-favicon-'));
  const svgPath = path.join(tempDir, 'handwing.svg');
  const icoPath = path.join(tempDir, 'favicon.ico');

  try {
    await writeFile(svgPath, svg);
    await execFileAsync('magick', [
      '-background',
      'none',
      '-density',
      '512',
      svgPath,
      '-define',
      'icon:auto-resize=64,48,32,16',
      icoPath,
    ]);

    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(icoPath, target);
    console.log(`Wrote ${target}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

for (const target of targets) {
  await generateFavicon(target);
}
