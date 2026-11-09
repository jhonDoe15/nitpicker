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

function inspectHash() {
  const hash = createHash('sha256');
  const files = readdirSync(INSPECT_SOURCE, { recursive: true })
    .map((name) => name.split(path.sep).join('/'))
    .filter((name) => /\.(?:go|mod|sum)$/u.test(name) && !name.endsWith('_test.go'))
    .toSorted((left, right) => left.localeCompare(right));
  for (const file of files) {
    hash.update(`${file}\0`).update(readFileSync(path.join(INSPECT_SOURCE, file)));
  }
  return hash.digest('hex').slice(0, HASH_LENGTH);
}

export function inspectCommand(context) {
  const directory = path.join(cacheRoot(context.environment), `go-inspect-${inspectHash()}`);
  return installInto(path.join(directory, 'inspect'), (staging) => {
    run(context, ['go', 'build', '-o', path.join(staging, 'inspect'), '.'], {
      rule: 'go-inspect-build-failed',
      cwd: INSPECT_SOURCE,
      env: { ...NEUTRAL_ENV, GOFLAGS: '-buildvcs=false -mod=mod' },
    });
  });
}
