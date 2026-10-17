import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from './tooling/tool-resolution.mjs';

const repoRoot = PACKAGE_ROOT;
const dockerfile = readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8');
const dockerignore = readFileSync(path.join(repoRoot, '.dockerignore'), 'utf8');
const instructions = dockerfile
  .replaceAll('\\\n', ' ')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'));

const expectedCopyInstructions = [
  'COPY core/ /opt/nitpicker/core/',
  'COPY languages/ /opt/nitpicker/languages/',
  'COPY package.json package-lock.json .npmrc LICENSE README.md /opt/nitpicker/',
  'COPY shared/ /opt/nitpicker/shared/',
];
const expectedDockerignoreLines = [
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

function instruction(name) {
  return instructions.filter((line) => line.startsWith(`${name} `));
}

describe('container image Dockerfile', () => {
  it('uses a Node base image pinned by an exact version tag', () => {
    expect(instruction('FROM')).toHaveLength(1);
    expect(instruction('FROM')[0]).toMatch(/^FROM node:\d+\.\d+\.\d+-slim$/);
  });

  it('installs git', () => {
    expect(instruction('RUN').some((line) => /apt-get install\b.*\bgit\b/.test(line))).toBe(true);
  });

  it('installs the package from the repo source and exposes the nitpicker binary', () => {
    expect([...new Set(instruction('COPY'))].sort()).toEqual(expectedCopyInstructions);
    expect(instruction('RUN').some((line) => line.includes('npm ci'))).toBe(true);
    expect(
      instruction('RUN').some((line) => line.includes('core/cli.mjs /usr/local/bin/nitpicker')),
    ).toBe(true);
  });

  it('provides the package managers that projects use', () => {
    expect(instruction('ENV')).toEqual(['ENV COREPACK_HOME=/opt/corepack']);
    expect(
      instruction('RUN')
        .filter((line) => line.includes('corepack enable'))
        .map((line) => line.replace(/\s+/g, ' ')),
    ).toEqual([
      'RUN corepack enable && mkdir -m 1777 /opt/corepack && npm install --global bun@1.4.2',
    ]);
  });

  it('marks the workspace as a git safe.directory', () => {
    expect(instruction('RUN').some((line) => line.includes('safe.directory /work'))).toBe(true);
  });

  it('works in /work', () => {
    expect(instruction('WORKDIR')).toEqual(['WORKDIR /work']);
  });

  it('has nitpicker as its entrypoint', () => {
    expect(instruction('ENTRYPOINT')).toEqual(['ENTRYPOINT ["nitpicker"]']);
  });

  it('keeps dependencies and reports out of the build context', () => {
    expect([...new Set(dockerignore.split('\n'))].sort()).toEqual(expectedDockerignoreLines);
  });
});
