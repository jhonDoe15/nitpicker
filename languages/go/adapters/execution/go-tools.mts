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
import { readGoModule } from './go-module.mts';
import { run } from './go-process.mts';
import type { Environment } from '../../../../shared/processes/environment.mts';
import type { GoContext } from '../go-types.mts';

type GoTool = { readonly module: string; readonly version: string };
type Program = {
  name: string;
  source: string;
  rule: string;
  env: Readonly<Record<string, string>>;
  toolchain?: string;
};

export const GO_TOOLS: Readonly<Record<string, GoTool>> = {
  gofumpt: { module: 'mvdan.cc/gofumpt', version: 'v0.12.0' },
  goimports: { module: 'golang.org/x/tools/cmd/goimports', version: 'v0.52.0' },
  deadcode: { module: 'golang.org/x/tools/cmd/deadcode', version: 'v0.52.0' },
};
const INSPECT_SOURCE = path.resolve(import.meta.dirname, '../../inspect');
const LINT_SOURCE = path.resolve(import.meta.dirname, '../../lint');
const LINT_GO_MINOR = 27;
const NEUTRAL_ENV = { GOWORK: 'off', GOFLAGS: '', GOOS: '', GOARCH: '', CGO_ENABLED: '0' };
const HASH_LENGTH = 16;

function cacheRoot(environment: Environment) {
  const root = path.join(
    environment['XDG_CACHE_HOME'] ?? path.join(homedir(), '.cache'),
    'nitpicker',
  );
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return root;
}

function installInto(binary: string, build: (staging: string) => void) {
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

function projectTool(projectRoot: string, module: string) {
  return readGoModule(projectRoot)?.tools.includes(module) ?? false;
}

function toolOf(name: string): GoTool {
  const tool = GO_TOOLS[name];
  if (tool === undefined) {
    throw new Error(`${name} is not a known Go tool`);
  }
  return tool;
}

export function toolCommand(context: GoContext, name: string): string[] {
  const { module, version } = toolOf(name);
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

export function toolVersions(): string[] {
  return Object.entries(GO_TOOLS).map(([name, { version }]) => `${name}@${version}`);
}

function sourceNames(source: string) {
  return readdirSync(source, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.endsWith('_test.go'))
    .map((entry) => path.relative(source, path.join(entry.parentPath, entry.name)))
    .filter((name) => !name.split(path.sep).includes('fixtures'))
    .toSorted();
}

export function sourceHash(source: string, extra: string): string {
  const hash = createHash('sha256').update(extra);
  for (const name of sourceNames(source)) {
    hash.update(`${name}\0`).update(sourceFile(source, name));
  }
  return hash.digest('hex').slice(0, HASH_LENGTH);
}

function sourceFile(source: string, name: string) {
  const full = path.resolve(source, name);
  if (!full.startsWith(source + path.sep)) {
    throw new Error(`${name} is outside ${source}`);
  }
  return readFileSync(full);
}

function buildProgram(context: GoContext, { name, source, rule, env, toolchain = '' }: Program) {
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

export function inspectCommand(context: GoContext): string {
  return buildProgram(context, {
    name: 'inspect',
    source: INSPECT_SOURCE,
    rule: 'go-inspect-build-failed',
    env: { GOFLAGS: '-buildvcs=false -mod=mod' },
  });
}

export function newerToolchain(version: string): string | undefined {
  const match = /^(?<name>go(?<major>\d+)\.(?<minor>\d+)(?:\.\d+|rc\d+)?)(?:\s|$)/u.exec(version);
  if (match?.groups === undefined) {
    return undefined;
  }
  const { name, major, minor } = match.groups;
  return Number(major) > 1 || Number(minor) > LINT_GO_MINOR ? name : undefined;
}

export function lintCommand(context: GoContext): string {
  const version = (
    run(context, ['go', 'env', 'GOVERSION'], { rule: 'go-env-failed' }).stdout ?? ''
  ).trim();
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
