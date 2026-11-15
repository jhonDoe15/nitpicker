import path from 'node:path';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { fieldOf, fieldsOf } from '../../../../../shared/values/readers.mts';

const ts = typescriptApi();
const TEMPLATE_EXTENSIONS = ['.vue', '.svelte', '.astro', '.mdx', '.md'];
const SKIPPED = ['node_modules', 'dist', 'build', 'coverage', '.git'];
const PACKAGE_KEYS = ['main', 'module', 'types', 'typings', 'bin', 'browser', 'exports'];
const EXTENSION = /\.[cm]?[jt]sx?$/u;

function stemOf(target: string): string {
  const parsed = path.posix.parse(target.replace(EXTENSION, ''));
  return parsed.base === 'index' ? path.posix.basename(parsed.dir) || 'index' : parsed.base;
}

function templateFiles(projectRoot: string): string[] {
  return ts.sys.readDirectory(
    projectRoot,
    TEMPLATE_EXTENSIONS,
    SKIPPED.map((name) => `**/${name}`),
  );
}

export function templateImporterProblem(projectRoot: string, target: string): string | undefined {
  const stem = stemOf(target);
  const found = templateFiles(projectRoot).find((file) => ts.sys.readFile(file)?.includes(stem));
  return found === undefined
    ? undefined
    : `${path.relative(projectRoot, found).split(path.sep).join('/')} may import the module`;
}

function strings(value: unknown): string[] {
  const found: string[] = [];
  const pending: unknown[] = [value];
  for (const item of pending) {
    if (typeof item === 'string') {
      found.push(item);
    } else if (item !== null && typeof item === 'object') {
      pending.push(...Object.values(fieldsOf(item)));
    }
  }
  return found;
}

export function packageEntryProblem(projectRoot: string, target: string): string | undefined {
  const file = path.join(projectRoot, 'package.json');
  const manifest: unknown = ts.parseConfigFileTextToJson(
    file,
    ts.sys.readFile(file) ?? '{}',
  ).config;
  const wanted = target.replace(EXTENSION, '');
  const listed = PACKAGE_KEYS.flatMap((key) => strings(fieldOf(manifest, key))).map((value) =>
    path.posix.normalize(value).replace(EXTENSION, ''),
  );
  return listed.includes(wanted) ? 'package.json names the module as an entry point' : undefined;
}
