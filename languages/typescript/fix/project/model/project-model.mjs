import path from 'node:path';
import { ts } from '../../../typescript-api/typescript-api.mjs';
import { createFixService } from '../../code-fixes/language-service.mjs';
import { globMatcher, resolveLayoutFor, toPosix } from '../../../preset/layout.mjs';
import { configFileGlobsFor } from '../../../preset/eslint-config/policy/production-policy.mjs';

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const SKIPPED_DIRECTORIES = ['node_modules', 'dist', 'build', 'coverage', '.git'];

function projectNames(projectRoot, files) {
  const listed = ts.sys
    .readDirectory(
      projectRoot,
      EXTENSIONS,
      SKIPPED_DIRECTORIES.map((name) => `**/${name}`),
    )
    .map((file) => toPosix(path.relative(projectRoot, file)));
  return [...new Set([...files.map(({ path: name }) => name), ...listed])].toSorted((left, right) =>
    left.localeCompare(right),
  );
}

function isInside(relative) {
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function createProject({ projectRoot, files, read, javascript = false }) {
  const listed = projectNames(projectRoot, files);
  const names = listed.filter((name) => read(name) !== undefined);
  const fixService = createFixService({ projectRoot, javascript, names });
  for (const name of listed) {
    fixService.setText(name, read(name));
  }
  const { service, absolute, host } = fixService;
  const program = service.getProgram();
  const options = program.getCompilerOptions();
  const known = new Set(names);

  function nameOf(file) {
    const relative = toPosix(path.relative(projectRoot, file));
    return isInside(relative) && !/(?:^|\/)node_modules\//u.test(relative) ? relative : undefined;
  }

  return {
    ts,
    projectRoot,
    service,
    program,
    absolute,
    names,
    read,
    nameOf,
    has: (name) => known.has(name),
    sourceFile: (name) => program.getSourceFile(absolute(name)),
    resolve(specifier, from) {
      const { resolvedModule } = ts.resolveModuleName(specifier, absolute(from), options, host);
      const resolved =
        resolvedModule === undefined ? undefined : nameOf(resolvedModule.resolvedFileName);
      return resolved !== undefined && known.has(resolved) ? resolved : undefined;
    },
    lineOf: (name, offset) => read(name).slice(0, offset).split('\n').length,
    dispose: () => service.dispose(),
  };
}

export function withProject(context, work) {
  const project = createProject({
    projectRoot: context.projectRoot,
    files: context.files,
    read: context.read,
    javascript: context.inputs?.layout?.javascript === true,
  });
  try {
    return work(project);
  } finally {
    project.dispose();
  }
}

export function layoutOf(inputs = {}) {
  return inputs.layout ?? resolveLayoutFor();
}

const CODE_FILE = /\.[cm]?[jt]sx?$/u;

export function isCodeFile(name) {
  return CODE_FILE.test(name);
}

export function productionScope(inputs, extraGlobs = []) {
  const layout = layoutOf(inputs);
  const configFiles = [...configFileGlobsFor(layout), ...extraGlobs].map(globMatcher);
  return (name) =>
    CODE_FILE.test(name) && layout.isSourceFile(name) && !configFiles.some((m) => m.test(name));
}
