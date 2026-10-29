import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from './tooling/tool-resolution.mjs';

const repoRoot = PACKAGE_ROOT;
const read = (file) => readFileSync(path.join(repoRoot, file), 'utf8');
const dockerfile = read('Dockerfile');
const dockerignore = read('.dockerignore');
const containerWorkflow = read('.github/workflows/container.yml');
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
// Stages that only supply files to the images; every other stage is an image variant.
const HELPER_STAGES = ['base', 'jdk', 'maven', 'gradle', 'jvm-files'];
const JVM_ENVIRONMENT = {
  JAVA_HOME: '/opt/java/openjdk',
  PATH: '/opt/java/openjdk/bin:/opt/maven/bin:/opt/gradle/bin:${PATH}',
  GRADLE_USER_HOME: '/home/nitpicker/.gradle',
  MAVEN_OPTS: '-Duser.home=/home/nitpicker',
};
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

function stageNames() {
  return instruction('FROM').map((line) => line.split(' AS ')[1]);
}

function environment(name) {
  const pairs = stage(name)
    .filter((line) => line.startsWith('ENV '))
    .flatMap((line) => line.slice('ENV '.length).split(' '))
    .map((pair) => pair.split('='));
  return Object.fromEntries(pairs.map(([key, ...value]) => [key, value.join('=')]));
}

function setting(text, pattern) {
  const [, value] = text.match(pattern) ?? [];
  expect(typeof value, `${pattern} has no match`).toBe('string');
  return value;
}

function runSteps(name) {
  return stage(name).filter((line) => line.startsWith('RUN '));
}

describe('container image Dockerfile', () => {
  it('builds one stage per preset, with the TypeScript image as the default last stage', () => {
    expect(stageNames()).toEqual([
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
      .filter((line) => line.includes('--from='))
      .map((line) => setting(line, /--from=(\S+)/))
      .filter((source) => source.includes(':'));
    expect(images.length + copied.length).toBe(5);
    for (const image of [...images, ...copied]) {
      expect(image, image).toMatch(EXACT_VERSION_TAG);
    }
  });

  it('uses the Node major version that CI targets', () => {
    const major = setting(read('.github/workflows/typescript.yml'), /node-version: (\d+)/);
    expect(setting(stage('base')[0], /^FROM node:(\d+)\.\d+\.\d+-bookworm-slim AS base$/)).toBe(
      major,
    );
  });

  it('installs git, and ps for mutation testing', () => {
    expect(
      runSteps('base').some((line) => /apt-get install\b.*\bgit\b.*\bprocps\b/.test(line)),
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
    expect(environment('base')).toEqual({
      COREPACK_HOME: '/opt/corepack',
      HOME: '/home/nitpicker',
    });
    const setup = runSteps('base').join('\n');
    expect(setup.includes('corepack enable')).toBe(true);
    expect(setting(setup, /mkdir -m 1777 ([^&]+?) &&/).split(' ')).toEqual([
      '/opt/corepack',
      '/home/nitpicker',
    ]);
    expect(setting(setup, /npm install --global bun@([\d.]+)/)).toBe(
      setting(read('.github/workflows/typescript.yml'), /bun-version: ([\d.]+)/),
    );
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

  it('labels the image with the repository it is built from, the package repository by default', () => {
    const repository = JSON.parse(read('package.json')).repository.url;
    expect(setting(dockerfile, /org\.opencontainers\.image\.source="([^"]+)"/)).toBe(
      '${SOURCE_URL}',
    );
    expect(`git+${setting(dockerfile, /^ARG SOURCE_URL=(\S+)$/m)}.git`).toBe(repository);
  });

  it('keeps dependencies and reports out of the build context', () => {
    expect([...new Set(dockerignore.split('\n'))].sort()).toEqual(expectedDockerignoreLines);
  });
});

describe('container image toolchains', () => {
  const javaWorkflow = read('.github/workflows/java-e2e.yml');
  const kotlinWorkflow = read('.github/workflows/kotlin-e2e.yml');
  const pythonWorkflow = read('.github/workflows/python-e2e.yml');
  const pythonConstraints = read('.github/python-e2e-constraints.txt');

  it('gives the JVM images the JDK and the Gradle that the end-to-end suites use', () => {
    for (const workflow of [javaWorkflow, kotlinWorkflow]) {
      const java = setting(workflow, /java-version: (\d+)/);
      expect(
        setting(stage('jdk')[0], /^FROM eclipse-temurin:(\d+)\.\d+\.\d+_\d+-jdk-noble AS jdk$/),
      ).toBe(java);
      expect(setting(stage('maven')[0], /^FROM maven:3\.9\.\d+-eclipse-temurin-(\d+)-noble/)).toBe(
        java,
      );
      expect(setting(stage('gradle')[0], /^FROM gradle:[\d.]+-jdk(\d+)-noble/)).toBe(java);
      expect(setting(stage('gradle')[0], /^FROM gradle:([\d.]+)-jdk/)).toBe(
        setting(workflow, /gradle-version: ([\d.]+)/),
      );
    }
  });

  it('keeps the Gradle and Maven caches in the home directory for every user', () => {
    expect(stage('jvm').slice(0, 2)).toEqual([
      'FROM base AS jvm',
      'COPY --from=jvm-files /opt/ /opt/',
    ]);
    expect(environment('jvm')).toEqual(JVM_ENVIRONMENT);
  });

  it('gives the Python images the Python, uv and Poetry that the end-to-end suite uses', () => {
    const python = stage('python').join('\n');
    const versions = setting(pythonWorkflow, /python-version: \|\n((?:\s+\d+\.\d+\n)+)/)
      .trim()
      .split(/\s+/);
    expect(setting(python, /uv python install (\d+\.\d+)\.\d+/)).toBe(versions.at(-1));
    expect(setting(python, /ghcr\.io\/astral-sh\/uv:([\d.]+)/)).toBe(
      setting(pythonConstraints, /^uv==([\d.]+)$/m),
    );
    expect(setting(python, /poetry==([\d.]+)/)).toBe(
      setting(pythonWorkflow, /pipx install poetry==([\d.]+)/),
    );
  });

  it('keeps Poetry environments in the checkout and lets any user add Pythons', () => {
    const variables = environment('python');
    expect(variables.UV_PYTHON_INSTALL_DIR).toBe('/opt/python');
    expect(variables.POETRY_VIRTUALENVS_IN_PROJECT).toBe('true');
    expect(runSteps('python').some((line) => line.includes('chmod -R a+rwX /opt/python'))).toBe(
      true,
    );
  });

  it('builds the all image from the Python image plus the JVM files', () => {
    expect(stage('all').slice(0, 2)).toEqual([
      'FROM python AS all',
      'COPY --from=jvm-files /opt/ /opt/',
    ]);
    expect(environment('all')).toEqual(JVM_ENVIRONMENT);
  });

  it('ends with the TypeScript image, which stays the default build target', () => {
    expect(instruction('FROM').at(-1)).toBe('FROM base AS typescript');
  });
});

describe('container workflow', () => {
  const variants = stageNames()
    .filter((name) => !HELPER_STAGES.includes(name))
    .sort();

  it('builds and smoke-tests every image variant of the Dockerfile', () => {
    const built = [...containerWorkflow.matchAll(/^ {10}- variant: (\S+)$/gm)].map(
      ([, name]) => name,
    );
    expect(built.sort()).toEqual(variants);
  });

  it('moves the latest tag of every image variant', () => {
    const moved = setting(containerWorkflow, /for variant in ([\w ]+); do/).split(' ');
    expect(moved.sort()).toEqual(variants);
  });
});
