import path from 'node:path';
import { reachableModules } from '../../../modules/module-resolution.mjs';
import { moduleSourcesOf, statementSources } from '../../../modules/module-sources.mjs';

const reactTestModule = /^(?:@testing-library\/.+|react(?:-[^/]+)?(?:\/.*)?|enzyme(?:\/.*)?)$/u;
const projectTestUtilsModule = /^\.{1,2}\/(?:.*\/)?[^/]*test-utils[^/]*$/u;
const testingLibraryModule = /^@testing-library\/.+$/u;
const TEST_UTILS_NAME = 'test-utils';
const LIMITS = { maxDepth: 4, maxFiles: 50 };
const UTILS_MODULE_SETTING = 'testing-library/utils-module';

function isReactTestModule(source) {
  return reactTestModule.test(source) || projectTestUtilsModule.test(source);
}

function moduleNameOf(file) {
  const base = path.basename(file).replace(/\.[^.]+$/u, '');
  return base === 'index' ? path.basename(path.dirname(file)) : base;
}

function isTestHelperModule(file) {
  return (
    moduleNameOf(file).includes(TEST_UTILS_NAME) ||
    moduleSourcesOf(file).some((source) => testingLibraryModule.test(source))
  );
}

function reachesTestHelper(source, filename) {
  function specifiersOf(file) {
    return file === filename ? [source] : moduleSourcesOf(file);
  }
  for (const step of reachableModules(filename, specifiersOf, LIMITS)) {
    if (step.truncated === true) return false;
    if (isTestHelperModule(step.file)) return true;
  }
  return false;
}

function reactTestImportOf(program, filename) {
  const sources = program.body.flatMap(statementSources);
  if (sources.some(isReactTestModule)) return { direct: true };
  const helper = path.isAbsolute(filename)
    ? sources.find((source) => reachesTestHelper(source, filename))
    : undefined;
  return helper === undefined ? undefined : { helper };
}

function withUtilsModule(context, helper) {
  const settings = { ...context.settings, [UTILS_MODULE_SETTING]: helper };
  return Object.create(context, { settings: { value: settings } });
}

export function inReactTestFilesOnly(create) {
  return (context) => {
    const found = reactTestImportOf(context.sourceCode.ast, context.filename);
    if (found === undefined) return {};
    return create(found.direct ? context : withUtilsModule(context, found.helper));
  };
}
