import path from 'node:path';
import { escapeRegExp } from '../../../../paths/glob.mjs';
import { languageOf } from '../../source.mjs';
import { projectFiles, textOf } from '../project-tests.mjs';

function modulePaths(file) {
  const parts = file.replace(/\.py$/u, '').split('/');
  const suffixes = parts.map((_, index) => parts.slice(index));
  return suffixes.filter((suffix) => suffix.length >= 2 || parts.length === 1);
}

export function pythonImports(file, text) {
  const leaf = path.posix.basename(file, '.py');
  return modulePaths(file).some((suffix) => {
    const module = escapeRegExp(suffix.join('.'));
    const direct = new RegExp(
      String.raw`^\s*(?:from\s+${module}\s+import|import\s+${module}\b)`,
      'mu',
    );
    const parent = suffix
      .slice(0, -1)
      .map(escapeRegExp)
      .join(String.raw`\.`);
    const viaParent =
      parent === ''
        ? undefined
        : new RegExp(
            String.raw`^\s*from\s+${parent}\s+import\s+[^\n]*\b${escapeRegExp(leaf)}\b`,
            'mu',
          );
    return direct.test(text) || viaParent?.test(text) === true;
  });
}

export function pythonTest(file, env) {
  return projectFiles(env)
    .tests.filter((test) => languageOf(test) === 'python')
    .find((test) => pythonImports(file, textOf(env, test)));
}
