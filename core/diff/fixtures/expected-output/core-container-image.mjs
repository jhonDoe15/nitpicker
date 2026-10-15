import { expect } from 'vitest';
export function expectedOutput30_33() {
  return [
    'COPY core/ /opt/nitpicker/core/',
    'COPY languages/ /opt/nitpicker/languages/',
    'COPY package.json package-lock.json .npmrc LICENSE README.md /opt/nitpicker/',
    'COPY shared/ /opt/nitpicker/shared/',
  ];
}

export function expectedOutput58_19() {
  return [
    '',
    '**/*.test.mjs',
    '**/.nitpicker-*',
    '**/.stryker-tmp',
    '**/coverage',
    '**/fixtures',
    '**/node_modules',
    '**/reports',
    '.claude',
    '.git',
    '.github',
    'docs',
  ];
}

export function expectedOutput59_19() {
  return [
    '',
    '**/*.test.mjs',
    '**/.nitpicker-*',
    '**/.stryker-tmp',
    '**/coverage',
    '**/fixtures',
    '**/node_modules',
    '**/reports',
    '.claude',
    '.git',
    '.github',
    'docs',
  ];
}

export function expectedOutput60_19() {
  return [
    '',
    '**/*.test.mjs',
    '**/.nitpicker-*',
    '**/.stryker-tmp',
    '**/coverage',
    '**/fixtures',
    '**/node_modules',
    '**/reports',
    '.claude',
    '.git',
    '.github',
    'docs',
  ];
}
