import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { readLayout } from '../../../../head-policy.mjs';
import { readStamped } from '../../../../modules/stamped-file-cache.mjs';

const layout = readLayout();
const { testRoots } = layout;

const DEFAULT_EXEMPT_PATTERN = String.raw`/(?:${testRoots.join('|')})/contract/|\.policy\.test\.[cm]?[jt]s$`;
const RUNNABLE_TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const TEST_SUPPORT = new RegExp(
  `(?:^|/)(?:__tests__|fixtures)(?:/|$)|^(?:${testRoots.join('|')})(?:/|$)|\\.(?:test|spec)\\.[cm]?[jt]sx?$`,
);

const relativeModule = /^\.{1,2}\//u;
const compiledExtension = /\.(?:[cm]?js|jsx)$/u;
const componentFile = /\.[cm]?[jt]sx$/u;
const scriptExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const MAX_REEXPORT_DEPTH = 3;
const moduleCache = new Map();
const pathsCache = new Map();
const configHost = { ...ts.sys, readDirectory: () => [] };

function isFile(candidate) {
  return statSync(candidate, { throwIfNoEntry: false })?.isFile() === true;
}

function fileFor(target) {
  const stem = target.replace(compiledExtension, '');
  return [
    target,
    ...scriptExtensions.map((extension) => `${stem}${extension}`),
    ...scriptExtensions.map((extension) => path.join(target, `index${extension}`)),
  ].find(isFile);
}

function readPaths(configFile) {
  const { config } = ts.readConfigFile(configFile, (file) => ts.sys.readFile(file));
  const configDirectory = path.dirname(configFile);
  const { options } = ts.parseJsonConfigFileContent(config ?? {}, configHost, configDirectory);
  const baseUrl = config?.compilerOptions?.baseUrl;
  const base = typeof baseUrl === 'string' ? path.resolve(configDirectory, baseUrl) : undefined;
  return { paths: options.paths ?? {}, base: base ?? options.pathsBasePath ?? configDirectory };
}

function aliasTargets(fromFile, source) {
  const directory = path.dirname(fromFile);
  const configFile = ts.findConfigFile(directory, (file) => ts.sys.fileExists(file));
  const config =
    configFile === undefined ? undefined : readStamped(pathsCache, configFile, readPaths);
  const { paths, base } = config ?? { paths: {}, base: directory };
  return Object.entries(paths).flatMap(([pattern, targets]) => {
    const [prefix, suffix = ''] = pattern.split('*');
    const wildcard = pattern.includes('*');
    const matches = wildcard
      ? source.length >= prefix.length + suffix.length &&
        source.startsWith(prefix) &&
        source.endsWith(suffix)
      : source === pattern;
    const captured = wildcard ? source.slice(prefix.length, source.length - suffix.length) : '';
    return matches
      ? targets.map((target) => path.resolve(base, target.replace('*', captured)))
      : [];
  });
}

function resolveModule(fromFile, source) {
  if (relativeModule.test(source)) {
    return fileFor(path.resolve(path.dirname(fromFile), source));
  }
  return aliasTargets(fromFile, source)
    .map(fileFor)
    .find((file) => file !== undefined);
}

function importsAtRuntime(clause) {
  const named = clause?.namedBindings;
  if (clause === undefined || named === undefined || clause.name !== undefined) {
    return clause?.isTypeOnly !== true;
  }
  return (
    !clause.isTypeOnly &&
    (ts.isNamespaceImport(named) ||
      named.elements.length === 0 ||
      named.elements.some((element) => !element.isTypeOnly))
  );
}

function exportsAtRuntime(statement) {
  const clause = statement.exportClause;
  return (
    !statement.isTypeOnly &&
    (clause === undefined ||
      !ts.isNamedExports(clause) ||
      clause.elements.some((element) => !element.isTypeOnly))
  );
}

function loadedSource(node) {
  const isLoader =
    node.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(node.expression) && node.expression.text === 'require');
  const [argument] = node.arguments;
  return isLoader && argument !== undefined && ts.isStringLiteral(argument)
    ? argument.text
    : undefined;
}

function moduleReference(node) {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    const { text } = node.moduleSpecifier;
    return { source: text, runtime: importsAtRuntime(node.importClause), reexport: false };
  }
  if (
    ts.isExportDeclaration(node) &&
    node.moduleSpecifier &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return { source: node.moduleSpecifier.text, runtime: exportsAtRuntime(node), reexport: true };
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    const { expression } = node.moduleReference;
    const source = ts.isStringLiteral(expression) ? expression.text : undefined;
    return source === undefined
      ? undefined
      : { source, runtime: !node.isTypeOnly, reexport: false };
  }
  const loaded = ts.isCallExpression(node) ? loadedSource(node) : undefined;
  return loaded === undefined ? undefined : { source: loaded, runtime: true, reexport: false };
}

function parseReferences(file) {
  const kind = componentFile.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const text = readFileSync(file, 'utf8');
  const nodes = [ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind)];
  for (const node of nodes) {
    ts.forEachChild(node, (child) => {
      nodes.push(child);
    });
  }
  return nodes.map(moduleReference).filter((reference) => reference !== undefined);
}

function referencesOf(file) {
  return readStamped(moduleCache, file, parseReferences) ?? [];
}

function helperReaches(testFile, source, matches) {
  const pending = [{ file: resolveModule(testFile, source), depth: 0 }];
  const seen = new Set();
  for (const { file, depth } of pending) {
    const references = file === undefined || seen.has(file) ? [] : referencesOf(file);
    seen.add(file);
    if (references.some((reference) => matches(file, reference))) {
      return true;
    }
    const reexports =
      depth < MAX_REEXPORT_DEPTH ? references.filter(({ reexport }) => reexport) : [];
    pending.push(
      ...reexports.map((reference) => ({
        file: resolveModule(file, reference.source),
        depth: depth + 1,
      })),
    );
  }
  return false;
}

function isRuntimeImport(node) {
  if (node.importKind === 'type') {
    return false;
  }
  if (node.specifiers.length === 0) {
    return true;
  }
  return node.specifiers.some((specifier) => specifier.importKind !== 'type');
}

function isProductionModule(filename, source) {
  const sourceRoot = layout.sourceRoots.find(
    (root) => source.includes(`/${root}/`) || source.startsWith(`${root}/`),
  );
  if (
    sourceRoot !== undefined &&
    layout.isSourceFile(source.slice(source.indexOf(`${sourceRoot}/`)))
  ) {
    return true;
  }
  const resolved = (
    relativeModule.test(source)
      ? path.resolve(path.dirname(filename), source)
      : (resolveModule(filename, source) ?? '')
  ).replaceAll('\\', '/');
  const resolvedRoot = layout.sourceRootOf(`${resolved}/`);
  return (
    resolvedRoot !== undefined &&
    !TEST_SUPPORT.test(resolved.slice(resolved.indexOf(`/${resolvedRoot}/`) + 1))
  );
}

function reachesProduction(filename, source) {
  if (isProductionModule(filename, source)) {
    return true;
  }
  return helperReaches(
    filename,
    source,
    (helper, reference) => reference.runtime && isProductionModule(helper, reference.source),
  );
}

function isProductionRequire(filename, node) {
  const [argument] = node.arguments;
  return (
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require' &&
    argument?.type === 'Literal' &&
    typeof argument.value === 'string' &&
    reachesProduction(filename, argument.value)
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require tests to execute a production runtime dependency',
    },
    schema: [
      {
        type: 'object',
        properties: {
          exemptPattern: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingRuntime:
        'This test imports no production code at runtime (only types, libraries, or helpers that import none). Import the code under test from the source root, directly or through a helper such as a render function that imports it. Shared helpers belong in a file not named *.test.* or *.spec.*.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    const exemptTest = new RegExp(context.options[0]?.exemptPattern ?? DEFAULT_EXEMPT_PATTERN);
    const projectFile = path.relative(context.cwd, filename).replaceAll('\\', '/');
    if (
      !RUNNABLE_TEST.test(filename) ||
      exemptTest.test(filename) ||
      layout.isEndToEndTest(projectFile)
    ) {
      return {};
    }

    let program;
    let hasProductionRuntime = false;

    return {
      Program(node) {
        program = node;
      },
      ImportDeclaration(node) {
        if (
          isRuntimeImport(node) &&
          typeof node.source.value === 'string' &&
          reachesProduction(filename, node.source.value)
        ) {
          hasProductionRuntime = true;
        }
      },
      ImportExpression(node) {
        if (
          node.source.type === 'Literal' &&
          typeof node.source.value === 'string' &&
          reachesProduction(filename, node.source.value)
        ) {
          hasProductionRuntime = true;
        }
      },
      CallExpression(node) {
        if (isProductionRequire(filename, node)) {
          hasProductionRuntime = true;
        }
      },
      'Program:exit'() {
        if (!hasProductionRuntime) {
          context.report({ node: program, messageId: 'missingRuntime' });
        }
      },
    };
  },
};
