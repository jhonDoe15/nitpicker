import path from 'node:path';
import { reachableModules } from '../../../modules/module-resolution.mjs';
import { moduleSourcesOf, statementSources } from '../../../modules/module-sources.mjs';

const REACT_PACKAGE = 'react';
const reactTestModule = /^(?:@testing-library\/.+|react(?:-[^/]+)?(?:\/.*)?|enzyme(?:\/.*)?)$/u;
const projectTestUtilsModule = /^\.{1,2}\/(?:.*\/)?[^/]*test-utils[^/]*$/u;
const testingLibraryModule =
  /^(?:@testing-library\/.+|enzyme(?:\/.*)?|react-test-renderer(?:\/.*)?)$/u;
const testingLibraryQueryModule = /^@testing-library\/(?!user-event$|jest-dom(?:\/|$)).+$/u;
const componentFile = /\.[cm]?[jt]sx$/u;
const browserTestModule = /^(?:@playwright\/|cypress(?:\/|$))/u;
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
    if (step.truncated === true) {
      return false;
    }
    if (isTestHelperModule(step.file)) {
      return true;
    }
  }
  return false;
}

const mockRunners = new Set(['vi', 'jest']);
const mockMethods = new Set(['mock', 'doMock']);

function mockedSource(node) {
  const isMock =
    node?.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'Identifier' &&
    mockRunners.has(node.callee.object.name) &&
    !node.callee.computed &&
    mockMethods.has(node.callee.property.name);
  const [argument] = isMock ? node.arguments : [];
  const source = argument?.type === 'ImportExpression' ? argument.source : argument;
  return source?.type === 'Literal' ? source.value : undefined;
}

function topLevelSources(program) {
  return program.body.flatMap((statement) => [
    ...statementSources(statement),
    ...(statement.type === 'ExpressionStatement' ? [mockedSource(statement.expression)] : []),
  ]);
}

function testHelperOf(sources, filename) {
  return path.isAbsolute(filename)
    ? sources
        .filter((source) => !isReactTestModule(source))
        .find((source) => reachesTestHelper(source, filename))
    : undefined;
}

function reactTestScope(context) {
  const sources = topLevelSources(context.sourceCode.ast).filter(
    (source) => typeof source === 'string',
  );
  const helper = testHelperOf(sources, context.filename);
  const component =
    componentFile.test(context.filename) &&
    !sources.some((source) => browserTestModule.test(source));
  const direct = sources.some((source) => testingLibraryQueryModule.test(source));
  return {
    inScope: component || helper !== undefined || sources.some(isReactTestModule),
    utilsModule: direct ? undefined : helper,
  };
}

function withUtilsModule(context, helper) {
  const settings = { ...context.settings, [UTILS_MODULE_SETTING]: helper };
  return Object.create(context, { settings: { value: settings } });
}

export function inReactTestFilesOnly(create) {
  return (context) => {
    const { inScope, utilsModule } = reactTestScope(context);
    if (!inScope) {
      return {};
    }
    return create(utilsModule === undefined ? context : withUtilsModule(context, utilsModule));
  };
}

const moduleLoaders = new Set(['require', 'importActual', 'requireActual']);
const transparentWrappers = new Set([
  'AwaitExpression',
  'ChainExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

function innerExpression(node) {
  if (transparentWrappers.has(node.type)) {
    return node.argument ?? node.expression;
  }
  const isDefault =
    node.type === 'MemberExpression' && !node.computed && node.property.name === 'default';
  return isDefault ? node.object : undefined;
}

function coreExpression(node) {
  const chain = [node];
  for (const current of chain) {
    const inner = current ? innerExpression(current) : undefined;
    if (inner !== undefined) {
      chain.push(inner);
    }
  }
  return chain.at(-1);
}

function loaderName(callee) {
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  return callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : undefined;
}

function loadsReact(node) {
  if (node?.type === 'ImportExpression') {
    return node.source.type === 'Literal' && node.source.value === REACT_PACKAGE;
  }
  if (node?.type !== 'CallExpression') {
    return false;
  }
  const [argument] = node.arguments;
  return (
    moduleLoaders.has(loaderName(node.callee)) &&
    argument?.type === 'Literal' &&
    argument.value === REACT_PACKAGE
  );
}

export function isReactExpression(node, names) {
  const core = coreExpression(node);
  if (core?.type === 'Identifier') {
    return names.has(core.name);
  }
  return loadsReact(core);
}

function importedNames(statement) {
  if (statement.type === 'TSImportEqualsDeclaration') {
    return statement.moduleReference.expression?.value === REACT_PACKAGE ? [statement.id.name] : [];
  }
  if (statement.type !== 'ImportDeclaration' || statement.source.value !== REACT_PACKAGE) {
    return [];
  }
  return statement.specifiers
    .filter(
      (specifier) => specifier.type !== 'ImportSpecifier' || specifier.imported.name === 'default',
    )
    .map((specifier) => specifier.local.name);
}

function children(node, visitorKeys) {
  return (visitorKeys[node.type] ?? [])
    .flatMap((key) => [node[key]].flat())
    .filter((child) => typeof child?.type === 'string');
}

export function descendants(root, visitorKeys) {
  const found = [root];
  for (const node of found) {
    found.push(...children(node, visitorKeys));
  }
  return found;
}

export function reactBindingNames(sourceCode, seed) {
  const nodes = descendants(sourceCode.ast, sourceCode.visitorKeys);
  const names = new Set([...seed, ...nodes.flatMap(importedNames)]);
  const declarators = nodes
    .filter((node) => node.type === 'VariableDeclarator' && node.id.type === 'Identifier')
    .toSorted((left, right) => left.range[0] - right.range[0]);
  for (const declarator of declarators) {
    if (isReactExpression(declarator.init, names)) {
      names.add(declarator.id.name);
    }
  }
  return names;
}
