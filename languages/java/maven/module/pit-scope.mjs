import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { byCodeUnits, isInMutationScope } from '../../../../core/scope/mutation-scope.mjs';
import { sourceFileOf } from '../kotlin/java-classes.mjs';

const PACKAGE_DECLARATION = /^\s*(?:@file:\S+\s+)*package\s+([\w.`]+)/mu;
const SOURCE_FILE = /\.(?:java|kt)$/u;
const CLASS_FILE = /\.class$/u;
const DESCRIPTOR_CLASS = /(?:^|\/)(?:package|module)-info\.class$/u;

function posix(file) {
  return file.split(path.sep).join('/');
}

function filesUnder(directory, pattern) {
  try {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && pattern.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function sourceKey(file) {
  const declared = PACKAGE_DECLARATION.exec(readFileSync(file, 'utf8'))?.[1] ?? '';
  const folders = declared.replaceAll('`', '').split('.').filter(Boolean);
  return [...folders, path.basename(file)].join('/');
}

function scopedSourceKeys({ sourceRoots, projectRoot, mutationScope }) {
  return new Set(
    sourceRoots
      .flatMap((root) => filesUnder(root, SOURCE_FILE))
      .filter((file) => isInMutationScope(posix(path.relative(projectRoot, file)), mutationScope))
      .map(sourceKey),
  );
}

function classKey(relative, buffer) {
  const sourceFile = sourceFileOf(buffer);
  const folder = path.posix.dirname(relative);
  if (sourceFile === undefined) {
    return undefined;
  }
  return folder === '.' ? sourceFile : `${folder}/${sourceFile}`;
}

export function scopedPitTargets({ classDirectory, ...scope }) {
  const keys = scopedSourceKeys(scope);
  return filesUnder(classDirectory, CLASS_FILE)
    .map((file) => ({ file, relative: posix(path.relative(classDirectory, file)) }))
    .filter(({ relative }) => !DESCRIPTOR_CLASS.test(relative))
    .filter(({ file, relative }) => keys.has(classKey(relative, readFileSync(file))))
    .map(({ relative }) => relative.replace(CLASS_FILE, '').replaceAll('/', '.'))
    .toSorted(byCodeUnits);
}

export function pitTargets(classDirectory) {
  const targets = new Set();
  const pending = [{ directory: classDirectory, prefix: '' }];
  for (const { directory, prefix } of pending) {
    const entries = readdirSync(directory, { withFileTypes: true });
    const classes = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.class'))
      .map((entry) => `${prefix}${entry.name.replace(/\.class$/u, '')}`);
    const wholePackage = classes.length > 0 && !'org.pitest.'.startsWith(prefix);
    if (wholePackage) {
      targets.add(`${prefix}*`);
      continue;
    }
    for (const name of classes) {
      targets.add(name);
    }
    pending.push(
      ...entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          directory: path.join(directory, entry.name),
          prefix: `${prefix}${entry.name}.`,
        })),
    );
  }
  return [...targets].toSorted(byCodeUnits);
}

export function pitRunTargets(module, scope) {
  return scope?.mutationScope === undefined
    ? pitTargets(module.outputDirectory)
    : scopedPitTargets({
        classDirectory: module.outputDirectory,
        sourceRoots: module.sourceRoots,
        ...scope,
      });
}
