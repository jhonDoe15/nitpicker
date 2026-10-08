import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const dockerfile = readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8');
const dockerignore = readFileSync(path.join(repoRoot, '.dockerignore'), 'utf8');
const instructions = dockerfile
  .replaceAll('\\\n', ' ')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'));

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
    expect(instruction('COPY')).toContain('COPY typescript/ /opt/nitpicker/');
    expect(instruction('RUN').some((line) => line.includes('npm ci'))).toBe(true);
    expect(
      instruction('RUN').some((line) => line.includes('core/cli.mjs /usr/local/bin/nitpicker')),
    ).toBe(true);
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
    const lines = dockerignore.split('\n');
    expect(lines).toContain('.git');
    expect(lines).toContain('**/node_modules');
    expect(lines).toContain('**/reports');
  });
});
