import path from 'node:path';
import { packageSpecifierPattern, uiFrameworks } from '../../../architecture/domain-packages.mjs';
import { reachableModules, resolveModuleSpecifier } from '../../../modules/module-resolution.mjs';
import { moduleSourceOf, moduleSourcesOf } from '../../../modules/module-sources.mjs';

const UI_FRAMEWORK = packageSpecifierPattern(uiFrameworks);
const SHARED_MODULE = /(?:^|\/)main\/shared\//u;
const LIMITS = { maxDepth: 6, maxFiles: 100 };

function isSharedModule(file) {
  return SHARED_MODULE.test(file.replaceAll('\\', '/'));
}

function frameworkReachedThroughShared(source, filename) {
  const entry = resolveModuleSpecifier(source, filename).path;
  if (entry === undefined || !isSharedModule(entry)) {
    return undefined;
  }
  function specifiersOf(file) {
    if (file === filename) return [source];
    return isSharedModule(file) ? moduleSourcesOf(file) : [];
  }
  for (const step of reachableModules(filename, specifiersOf, LIMITS)) {
    if (step.truncated === true) return undefined;
    const framework = specifiersOf(step.file).find((next) => UI_FRAMEWORK.test(next));
    if (framework !== undefined) return framework;
  }
  return undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep UI frameworks and UI state libraries out of domain/' },
    schema: [],
    messages: {
      uiFramework:
        'domain/ does not import a UI framework or UI state library (`{{source}}`): components, hooks and stores live in adapters/ (or shared/ui) and call the logic in domain/, which takes and returns plain values. If a framework requires this file in domain/, add an exception for this rule for those paths in nitpicker.config.json.',
      uiFrameworkThroughShared:
        'domain/ does not import a UI framework or UI state library, here `{{framework}}` through `{{source}}`: components, hooks and stores live in adapters/ (or shared/ui) and call the logic in domain/, which takes and returns plain values. If a framework requires this file in domain/, add an exception for this rule for those paths in nitpicker.config.json.',
    },
  },
  create(context) {
    function check(node) {
      const source = moduleSourceOf(node);
      if (source === undefined) {
        return;
      }
      if (UI_FRAMEWORK.test(source)) {
        context.report({ node, messageId: 'uiFramework', data: { source } });
        return;
      }
      const framework = path.isAbsolute(context.filename)
        ? frameworkReachedThroughShared(source, context.filename)
        : undefined;
      if (framework !== undefined) {
        context.report({
          node,
          messageId: 'uiFrameworkThroughShared',
          data: { framework, source },
        });
      }
    }
    return {
      ImportDeclaration: check,
      ImportExpression: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      TSImportEqualsDeclaration: check,
      CallExpression: check,
    };
  },
};
