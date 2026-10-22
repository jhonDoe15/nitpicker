import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isGeneratedJvm } from '../../generated/generated-sources.mjs';
import { compileDesignProgram, runDesignProgram } from './design-program.mjs';
import { resolveInside } from '../../../../../shared/conventions/read-inside.mjs';

const SKIPPED_FILES = new Set(['module-info.java', 'package-info.java']);

function javaFilesUnder(projectRoot, root) {
  const directory = resolveInside(projectRoot, root);
  if (directory === undefined || !existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { recursive: true })
    .map((name) => String(name).replaceAll('\\', '/'))
    .filter((name) => name.endsWith('.java') && !SKIPPED_FILES.has(path.posix.basename(name)))
    .map((name) => `${root.replaceAll('\\', '/')}/${name}`);
}

export function designSourceFiles(projectRoot, modules) {
  const files = new Set(
    modules.flatMap((module) =>
      module.sourceRoots.flatMap((root) => javaFilesUnder(projectRoot, root)),
    ),
  );
  return [...files].filter((file) => !isGeneratedJvm(projectRoot, file)).toSorted();
}

export function designPackages(modules) {
  return modules.length < 2
    ? []
    : modules.map((module) => ({ root: module.dir, published: module.published === true }));
}

function publishedRoots(modules) {
  return modules
    .filter((module) => module.published === true)
    .flatMap((module) => module.sourceRoots.map((root) => `${root.replaceAll('\\', '/')}/`));
}

export function markPublished(types, modules) {
  const roots = publishedRoots(modules);
  return types.map((type) =>
    type.exported && roots.some((root) => type.file.startsWith(root))
      ? { ...type, published: true }
      : type,
  );
}

export function produceDesignFacts({ projectRoot, modules, output }) {
  const files = designSourceFiles(projectRoot, modules);
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-design-'));
  try {
    const fileList = path.join(work, 'files.txt');
    const target = output ?? path.join(work, 'design-facts.json');
    mkdirSync(path.dirname(target), { recursive: true });
    rmSync(target, { force: true });
    writeFileSync(fileList, files.join('\n'));
    runDesignProgram({ classes: compileDesignProgram(), projectRoot, fileList, output: target });
    const facts = JSON.parse(readFileSync(target, 'utf8'));
    const bundle = {
      ...facts,
      types: markPublished(facts.types, modules),
      packages: designPackages(modules),
    };
    writeFileSync(target, `${JSON.stringify(bundle)}\n`);
    return bundle;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
