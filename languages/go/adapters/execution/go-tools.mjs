import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { readGoModule } from './go-module.mjs';
import { run } from './go-process.mjs';

export const GO_TOOLS = {
  gofumpt: { module: 'mvdan.cc/gofumpt', version: 'v0.12.0' },
  goimports: { module: 'golang.org/x/tools/cmd/goimports', version: 'v0.52.0' },
};
const INSPECT_SOURCE = path.resolve(import.meta.dirname, '../../inspect');
const LINT_SOURCE = path.resolve(import.meta.dirname, '../../lint');
const LINT_GO_MINOR = 27;
const NEUTRAL_ENV = { GOWORK: 'off', GOFLAGS: '', GOOS: '', GOARCH: '', CGO_ENABLED: '0' };
const HASH_LENGTH = 16;

function cacheRoot(environment) {
  const root = path.join(environment.XDG_CACHE_HOME ?? path.join(homedir(), '.cache'), 'nitpicker');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return root;
}

function installInto(binary, build) {
  if (existsSync(binary)) {
    return binary;
  }
  const directory = path.dirname(binary);
  mkdirSync(path.dirname(directory), { recursive: true });
  const staging = mkdtempSync(`${directory}.staging-`);
  try {
    build(staging);
    renameSync(staging, directory);
  } catch (error) {
    if (!existsSync(binary)) {
      throw error;
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return binary;
}

function projectTool(projectRoot, module) {
  return readGoModule(projectRoot)?.tools.includes(module) ?? false;
}

export function toolCommand(context, name) {
  const { module, version } = GO_TOOLS[name];
  if (projectTool(context.projectRoot, module)) {
    return ['go', 'tool', module];
  }
  const directory = path.join(cacheRoot(context.environment), 'go-tools', `${name}@${version}`);
  const binary = installInto(path.join(directory, name), (staging) => {
    run(context, ['go', 'install', `${module}@${version}`], {
      rule: 'go-tool-install-failed',
      cwd: staging,
      env: { ...NEUTRAL_ENV, GOBIN: staging },
    });
  });
  return [binary];
}

export function toolVersions() {
  return Object.entries(GO_TOOLS).map(([name, { version }]) => `${name}@${version}`);
}

const UNBUILT_FOLDERS = new Set(['fixtures', 'testdata']);

function programFiles(source) {
  return readdirSync(source, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.endsWith('_test.go'))
    .map((entry) => path.relative(source, path.join(entry.parentPath, entry.name)).split(path.sep))
    .filter((parts) => !parts.some((part) => UNBUILT_FOLDERS.has(part)))
    .map((parts) => parts.join('/'));
}

export function sourceHash(source, extra) {
  const hash = createHash('sha256').update(extra);
  for (const name of programFiles(source).toSorted((left, right) => left.localeCompare(right))) {
    hash.update(`${name}\0`).update(sourceFile(source, name));
  }
  return hash.digest('hex').slice(0, HASH_LENGTH);
}

function sourceFile(source, name) {
  const full = path.resolve(source, name);
  if (!full.startsWith(source + path.sep)) {
    throw new Error(`${name} is outside ${source}`);
  }
  return readFileSync(full);
}

function buildProgram(context, { name, source, rule, env, toolchain = '' }) {
  const directory = path.join(
    cacheRoot(context.environment),
    `go-${name}-${sourceHash(source, toolchain)}`,
  );
  return installInto(path.join(directory, name), (staging) => {
    run(context, ['go', 'build', '-o', path.join(staging, name), '.'], {
      rule,
      cwd: source,
      env: { ...NEUTRAL_ENV, ...env },
    });
  });
}

export function inspectCommand(context) {
  return buildProgram(context, {
    name: 'inspect',
    source: INSPECT_SOURCE,
    rule: 'go-inspect-build-failed',
    env: { GOFLAGS: '-buildvcs=false -mod=mod' },
  });
}

export function newerToolchain(version) {
  const match = /^(?<name>go(?<major>\d+)\.(?<minor>\d+)(?:\.\d+|rc\d+)?)(?:\s|$)/u.exec(version);
  if (match?.groups === undefined) {
    return undefined;
  }
  const { name, major, minor } = match.groups;
  return Number(major) > 1 || Number(minor) > LINT_GO_MINOR ? name : undefined;
}

export function lintCommand(context) {
  const version = run(context, ['go', 'env', 'GOVERSION'], { rule: 'go-env-failed' }).stdout.trim();
  const toolchain = newerToolchain(version);
  return buildProgram(context, {
    name: 'lint',
    source: LINT_SOURCE,
    rule: 'go-lint-build-failed',
    toolchain: version,
    env: {
      GOFLAGS: '-buildvcs=false -mod=readonly',
      ...(toolchain === undefined ? {} : { GOTOOLCHAIN: toolchain }),
    },
  });
}
