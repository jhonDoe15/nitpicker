import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const REACT_PACKAGE = 'react';
const reactTestModule = /^(?:@testing-library\/.+|react(?:-[^/]+)?(?:\/.*)?|enzyme(?:\/.*)?)$/;
const testingLibraryModule =
  /^(?:@testing-library\/.+|enzyme(?:\/.*)?|react-test-renderer(?:\/.*)?)$/u;
const testingLibraryQueryModule = /^@testing-library\/(?!user-event$|jest-dom(?:\/|$)).+$/u;
const componentFile = /\.[cm]?[jt]sx$/u;
const browserTestModule = /^(?:@playwright\/|cypress(?:\/|$))/u;
const relativeModule = /^\.{1,2}\//u;
const compiledExtension = /\.(?:[cm]?js|jsx)$/u;
const scriptExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const moduleSource = /(?:\bfrom|\bimport|\brequire\s*\()\s*\(?\s*['"]([^'"\n]+)['"]/gu;
const runtimeImport = String.raw`\b(?:import|export)(?!\s+type\b)(?:\s*\(|[^'";()=]*?\bfrom)?`;
const quotedSource = String.raw`\s*['"]([^'"\n]+)['"]`;
const runtimeModuleSource = new RegExp(
  `${runtimeImport}${quotedSource}|\\brequire\\s*\\(${quotedSource}`,
  'gu',
);

function isReactTestModule(source) {
  return typeof source === 'string' && reactTestModule.test(source);
}

function isFile(candidate) {
  return statSync(candidate, { throwIfNoEntry: false })?.isFile() === true;
}

function helperFile(testFile, source) {
  const target = path.resolve(path.dirname(testFile), source);
  const stem = target.replace(compiledExtension, '');
  return [
    target,
    ...scriptExtensions.map((extension) => `${stem}${extension}`),
    ...scriptExtensions.map((extension) => path.join(target, `index${extension}`)),
  ].find(isFile);
}

function helperImportsTestingLibrary(testFile, source) {
  const file = relativeModule.test(source) ? helperFile(testFile, source) : undefined;
  return (
    file !== undefined &&
    [...readFileSync(file, 'utf8').matchAll(moduleSource)].some(([, imported]) =>
      testingLibraryModule.test(imported),
    )
  );
}

export function helperRuntimeImports(testFile, source) {
  const file = relativeModule.test(source) ? helperFile(testFile, source) : undefined;
  const sources =
    file === undefined
      ? []
      : [...readFileSync(file, 'utf8').matchAll(runtimeModuleSource)].map(
          ([, imported, required]) => imported ?? required,
        );
  return { file, sources };
}

function requiredSource(node) {
  const isRequire =
    node?.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require';
  const [argument] = isRequire ? node.arguments : [];
  return argument?.type === 'Literal' ? argument.value : undefined;
}

function statementSources(statement) {
  switch (statement.type) {
    case 'ImportDeclaration':
    case 'ExportNamedDeclaration':
    case 'ExportAllDeclaration':
      return [statement.source?.value];
    case 'TSImportEqualsDeclaration':
      return [statement.moduleReference.expression?.value];
    case 'ExpressionStatement':
      return [requiredSource(statement.expression)];
    case 'VariableDeclaration':
      return statement.declarations.map((declarator) => requiredSource(declarator.init));
    default:
      return [];
  }
}

function reactTestScope(context) {
  const sources = context.sourceCode.ast.body
    .flatMap(statementSources)
    .filter((source) => typeof source === 'string');
  const helper = sources.find((source) => helperImportsTestingLibrary(context.filename, source));
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
  const settings = { ...context.settings, 'testing-library/utils-module': helper };
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
