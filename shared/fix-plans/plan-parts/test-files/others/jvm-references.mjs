import path from 'node:path';
import { escapeRegExp } from '../../../../paths/glob.mjs';
import { languageOf } from '../../source.mjs';
import { withoutComments } from '../scripts/code.mjs';
import { memoized, projectFiles, textOf } from '../project-tests.mjs';

const SCAN_LIMIT = 400;
const PACKAGE = /^\s*package\s+([\w.]+)/mu;

function codeOf(env, file) {
  return memoized(env, `code:${file}`, () => withoutComments(textOf(env, file)));
}

function packageOf(env, file) {
  return PACKAGE.exec(codeOf(env, file))?.[1];
}

function usage(name) {
  const word = escapeRegExp(name);
  return new RegExp(String.raw`\bnew\s+${word}\b|\b${word}\s*[.(<:]|[:<,(]\s*${word}\b`, 'u');
}

export function jvmTestImports(file, test, env) {
  const name = path.posix.basename(file).replace(/\.[^.]+$/u, '');
  const text = codeOf(env, test);
  const pkg = packageOf(env, file);
  const qualified = pkg === undefined ? name : `${pkg}.${name}`;
  const imported = new RegExp(
    String.raw`^\s*import\s+(?:static\s+)?${escapeRegExp(qualified)}\b|^\s*import\s+${escapeRegExp(pkg ?? '')}\.\*`,
    'mu',
  ).test(text);
  const samePackage = packageOf(env, test) === pkg;
  return (imported || samePackage) && usage(name).test(text);
}

export function jvmTest(file, env) {
  const language = languageOf(file);
  const name = path.posix.basename(file).replace(/\.[^.]+$/u, '');
  const exact = new RegExp(String.raw`/${escapeRegExp(name)}(?:Tests?|Spec|IT)\.[^.]+$`, 'u');
  const tests = projectFiles(env)
    .tests.filter((test) => languageOf(test) === language)
    .slice(0, SCAN_LIMIT);
  return (
    tests.find((test) => exact.test(`/${test}`)) ??
    tests.find((test) => jvmTestImports(file, test, env))
  );
}
