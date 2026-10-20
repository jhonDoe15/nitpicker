import { existsSync } from 'node:fs';
import path from 'node:path';
import { END_TO_END_ROOT } from '../layout.mjs';
import { readHeadPolicy } from '../head-policy.mjs';
import { hasDomDirectiveTests } from './dom-code/dom-tests.mjs';

const DOM_LIB = 'dom';
function hasEndToEndRoot(name, { projectDirectory, layout }) {
  return (
    name === 'tsconfig.quality.json' &&
    layout.testRoots.includes(END_TO_END_ROOT) &&
    existsSync(path.join(projectDirectory, END_TO_END_ROOT))
  );
}

function testsUseDom(name, context) {
  return (
    hasEndToEndRoot(name, context) ||
    readHeadPolicy().tools.tests?.domEnvironment === true ||
    hasDomDirectiveTests(context.layout, context.projectDirectory)
  );
}

export function libsWithTestDom(libs, name, context) {
  const lacksDom = libs?.every((lib) => lib.toLowerCase() !== DOM_LIB) ?? false;
  return lacksDom && testsUseDom(name, context) ? [...libs, DOM_LIB] : undefined;
}

export function withTestDom(text, name, context) {
  const config = JSON.parse(text);
  const lib = libsWithTestDom(config.compilerOptions?.lib, name, context);
  if (lib === undefined) {
    return text;
  }
  const compilerOptions = { ...config.compilerOptions, lib };
  return `${JSON.stringify({ ...config, compilerOptions }, null, 2)}\n`;
}
