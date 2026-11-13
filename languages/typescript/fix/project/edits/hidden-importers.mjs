import path from 'node:path';
import { ts } from '../../../typescript-api/typescript-api.mjs';

const TEMPLATE_EXTENSIONS = ['.vue', '.svelte', '.astro', '.mdx', '.md'];
const SKIPPED = ['node_modules', 'dist', 'build', 'coverage', '.git'];
const PACKAGE_KEYS = ['main', 'module', 'types', 'typings', 'bin', 'browser', 'exports'];
const EXTENSION = /\.[cm]?[jt]sx?$/u;

function stemOf(target) {
  const parsed = path.posix.parse(target.replace(EXTENSION, ''));
  return parsed.base === 'index' ? path.posix.basename(parsed.dir) || 'index' : parsed.base;
}

function templateFiles(projectRoot) {
  return ts.sys.readDirectory(
    projectRoot,
    TEMPLATE_EXTENSIONS,
    SKIPPED.map((name) => `**/${name}`),
  );
}

export function templateImporterProblem(projectRoot, target) {
  const stem = stemOf(target);
  const found = templateFiles(projectRoot).find((file) => ts.sys.readFile(file)?.includes(stem));
  return found === undefined
    ? undefined
    : `${path.relative(projectRoot, found).split(path.sep).join('/')} may import the module`;
}

function strings(value) {
  const found = [];
  const pending = [value];
  for (const item of pending) {
    if (typeof item === 'string') {
      found.push(item);
    } else if (item !== null && typeof item === 'object') {
      pending.push(...Object.values(item));
    }
  }
  return found;
}

export function packageEntryProblem(projectRoot, target) {
  const file = path.join(projectRoot, 'package.json');
  const manifest = ts.parseConfigFileTextToJson(file, ts.sys.readFile(file) ?? '{}').config;
  const wanted = target.replace(EXTENSION, '');
  const listed = PACKAGE_KEYS.flatMap((key) => strings(manifest?.[key])).map((value) =>
    path.posix.normalize(value).replace(EXTENSION, ''),
  );
  return listed.includes(wanted) ? 'package.json names the module as an entry point' : undefined;
}
