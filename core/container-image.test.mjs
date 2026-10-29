import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from './tooling/tool-resolution.mjs';

const repoRoot = PACKAGE_ROOT;
const read = (file) => readFileSync(path.join(repoRoot, file), 'utf8');
const dockerfile = read('Dockerfile');
const dockerignore = read('.dockerignore');
const instructions = dockerfile
  .replaceAll('\\\n', ' ')
  .split('\n')
  .map((line) => line.replace(/\s+/g, ' ').trim())
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
const EXACT_VERSION_TAG = /^[\w./-]+:\d+(?:\.\d+){1,2}(?:_\d+)?(?:-[a-z0-9-]+)?$/;

function instruction(name) {
  return instructions.filter((line) => line.startsWith(`${name} `));
}

function stage(name) {
  const start = instructions.findIndex((line) => line.endsWith(` AS ${name}`));
  const rest = instructions.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('FROM '));
  return [instructions[start], ...(end === -1 ? rest : rest.slice(0, end))];
}

function setting(text, pattern) {
  const [, value] = text.match(pattern) ?? [];
  return value;
}

describe('container image Dockerfile', () => {
  it('builds one stage per preset, with the TypeScript image as the default last stage', () => {
    const stages = instruction('FROM').map((line) => line.split(' AS ')[1]);
    expect(stages).toEqual([
      'base',
      'jdk',
      'maven',
      'gradle',
      'jvm-files',
      'jvm',
      'python',
      'all',
      'typescript',
    ]);
  });

  it('pins every base image to an exact version', () => {
    const images = instruction('FROM')
      .map((line) => line.split(' ')[1])
      .filter((image) => image.includes(':'));
    const copied = instruction('COPY')
      .map((line) => setting(line, /--from=(\S+)/))
      .filter((source) => source?.includes(':'));
    for (const image of [...images, ...copied]) {
      expect(image, image).toMatch(EXACT_VERSION_TAG);
    }
  });

  it('uses the Node major version that CI and the docs target', () => {
    expect(stage('base')[0]).toMatch(/^FROM node:24\.\d+\.\d+-bookworm-slim AS base$/);
    expect(read('.github/workflows/typescript.yml')).toContain('node-version: 24');
  });

  it('installs git, and ps for mutation testing', () => {
    expect(
      stage('base')
        .filter((line) => line.startsWith('RUN'))
        .some((line) => /apt-get install\b.*\bgit\b.*\bprocps\b/.test(line)),
    ).toBe(true);
  });

  it('installs the package from the repo source and exposes the nitpicker binary', () => {
    expect(
      [...new Set(instruction('COPY'))].filter((line) => !line.includes('--from')).sort(),
    ).toEqual(expectedCopyInstructions);
    expect(instruction('RUN').some((line) => line.includes('npm ci --omit=dev'))).toBe(true);
    expect(
      instruction('RUN').some((line) => line.includes('core/cli.mjs /usr/local/bin/nitpicker')),
    ).toBe(true);
  });

  it('provides the package managers that projects use, writable for any user', () => {
    expect(stage('base').filter((line) => line.startsWith('ENV'))).toEqual([
      'ENV COREPACK_HOME=/opt/corepack HOME=/home/nitpicker',
    ]);
    expect(stage('base').filter((line) => line.includes('corepack enable'))).toEqual([
      'RUN corepack enable && mkdir -m 1777 /opt/corepack /home/nitpicker && npm install --global bun@1.4.2 && rm -rf /home/nitpicker/.npm',
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

  it('labels the image with its source repository', () => {
    expect(dockerfile).toContain(
      'org.opencontainers.image.source="https://github.com/jhonDoe15/nitpicker"',
    );
  });

  it('keeps dependencies and reports out of the build context', () => {
    expect([...new Set(dockerignore.split('\n'))].sort()).toEqual(expectedDockerignoreLines);
  });
});

describe('container image toolchains', () => {
  const javaWorkflow = read('.github/workflows/java-e2e.yml');
  const pythonWorkflow = read('.github/workflows/python-e2e.yml');
  const pythonConstraints = read('.github/python-e2e-constraints.txt');

  it('gives the JVM images Temurin 21 and the Gradle that the end-to-end suites use', () => {
    expect(stage('jdk')[0]).toMatch(/^FROM eclipse-temurin:21\.\d+\.\d+_\d+-jdk-noble AS jdk$/);
    expect(stage('maven')[0]).toMatch(/^FROM maven:3\.9\.\d+-eclipse-temurin-21-noble AS maven$/);
    expect(setting(stage('gradle')[0], /^FROM gradle:([\d.]+)-jdk21/)).toBe(
      setting(javaWorkflow, /gradle-version: ([\d.]+)/),
    );
    expect(stage('jvm')).toContain('COPY --from=jvm-files /opt/ /opt/');
    expect(stage('jvm').join('\n')).toContain('JAVA_HOME=/opt/java/openjdk');
  });

  it('gives the Python images the uv and Poetry that the end-to-end suite uses', () => {
    const python = stage('python').join('\n');
    expect(setting(python, /ghcr\.io\/astral-sh\/uv:([\d.]+)/)).toBe(
      setting(pythonConstraints, /^uv==([\d.]+)$/m),
    );
    expect(setting(python, /poetry==([\d.]+)/)).toBe(
      setting(pythonWorkflow, /pipx install poetry==([\d.]+)/),
    );
    expect(setting(python, /uv python install (\d+\.\d+)\./)).toBe('3.13');
    expect(python).toContain('UV_PYTHON_INSTALL_DIR=/opt/python');
  });

  it('builds the all image from the Python image plus the JVM files', () => {
    expect(stage('all')).toContain('FROM python AS all');
    expect(stage('all')).toContain('COPY --from=jvm-files /opt/ /opt/');
    expect(stage('all').join('\n')).toContain('JAVA_HOME=/opt/java/openjdk');
  });

  it('ends with the TypeScript image, which stays the default build target', () => {
    expect(instruction('FROM').at(-1)).toBe('FROM base AS typescript');
  });
});
