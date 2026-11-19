import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, stringValue } from '../../analysis/constant-resolution.mts';
import { nameOf } from '../../typed/node-views.mts';
import { ASSERTION_FORMS, unwrapOf } from '../../typed/syntax-views.mts';
import { PATH_CALLS, PATH_OBJECTS } from './path-names.mts';

type RuleContext = Readonly<TSESLint.RuleContext<'filePath', []>>;

const MAX_DEPTH = 6;
const PATH_FUNCTIONS = new Set(['resolve', 'join', 'normalize', 'relative']);
const CURRENT_DIRECTORY_NAMES = new Set(['__dirname', '__filename']);
const FILE_URL_TEXT = /pathToFileURL|file:\/\//u;
const FILE_URL_START = /^file:/u;
const TEST_FILE = /__test__|playground/u;
const NODE_SIGNAL =
  /node:(?:path|fs|url|module|os)|['"](?:path|fs|url)['"]|\b__dirname\b|process\.cwd/u;
const URL_TEXT = /pathToFileURL|\.href|new URL|\.toString\(|url/iu;
const PATH_NAME = /(?:Path|File|Dir|Filepath|Filename)$/u;

function isPathCall(node: TSESTree.CallExpression, imported: ReadonlySet<string>): boolean {
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return PATH_CALLS.has(callee.name) || callee.name === 'cwd' || imported.has(callee.name);
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }
  const method = nameOf(callee.property) ?? '';
  const owner = callee.object;
  const ownerName =
    owner.type === AST_NODE_TYPES.MemberExpression ? nameOf(owner.property) : nameOf(owner);
  return (
    (PATH_FUNCTIONS.has(method) && PATH_OBJECTS.has(ownerName ?? '')) ||
    (method === 'resolve' && ownerName === 'require') ||
    PATH_CALLS.has(method) ||
    (method === 'cwd' && ownerName === 'process')
  );
}

function isCurrentDirectory(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return CURRENT_DIRECTORY_NAMES.has(node.name);
  }
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    node.object.type === AST_NODE_TYPES.MetaProperty &&
    ['dirname', 'filename'].includes(nameOf(node.property) ?? '')
  );
}

function specifierNames(statement: TSESTree.ImportDeclaration): string[] {
  return statement.specifiers.flatMap((specifier) => {
    const imported =
      specifier.type === AST_NODE_TYPES.ImportSpecifier ? nameOf(specifier.imported) : undefined;
    return imported !== undefined && PATH_FUNCTIONS.has(imported) ? [specifier.local.name] : [];
  });
}

function importedPathFunctions(program: TSESTree.Program): Set<string> {
  return new Set(
    program.body.flatMap((statement) =>
      statement.type === AST_NODE_TYPES.ImportDeclaration &&
      /^(?:node:)?path(?:\/posix|\/win32)?$/u.test(statement.source.value)
        ? specifierNames(statement)
        : [],
    ),
  );
}

function isNamedPath(node: TSESTree.Identifier): boolean {
  return PATH_NAME.test(node.name);
}

type Walk = {
  readonly context: RuleContext;
  readonly imported: ReadonlySet<string>;
};

type Pending = { readonly node: TSESTree.Node; readonly depth: number };

function deeper(parts: readonly TSESTree.Node[], depth: number): Pending[] {
  return depth < MAX_DEPTH ? parts.map((node) => ({ node, depth: depth + 1 })) : [];
}

function isNamedPathValue(context: RuleContext, written: TSESTree.Node, value: TSESTree.Node) {
  const { text } = context.sourceCode;
  return (
    written.type === AST_NODE_TYPES.Identifier &&
    isNamedPath(written) &&
    !URL_TEXT.test(context.sourceCode.getText(value)) &&
    stringValue(value) === undefined &&
    !FILE_URL_TEXT.test(text) &&
    NODE_SIGNAL.test(text)
  );
}

function pathOutcome(walk: Walk, { node, depth }: Pending): boolean | Pending[] {
  const { context, imported } = walk;
  const written = unwrapOf(node, ASSERTION_FORMS);
  const value = unwrapOf(resolveConstant(context, written) ?? written, ASSERTION_FORMS);
  if (written.type === AST_NODE_TYPES.Identifier && isNamedPath(written)) {
    return isNamedPathValue(context, written, value);
  }
  if (value.type === AST_NODE_TYPES.CallExpression) {
    return isPathCall(value, imported);
  }
  if (value.type === AST_NODE_TYPES.BinaryExpression) {
    return value.operator === '+' ? deeper([value.left, value.right], depth) : false;
  }
  if (value.type === AST_NODE_TYPES.TemplateLiteral) {
    return deeper(value.expressions, depth);
  }
  if (value.type === AST_NODE_TYPES.Identifier) {
    return CURRENT_DIRECTORY_NAMES.has(value.name);
  }
  return value.type === AST_NODE_TYPES.MemberExpression && isCurrentDirectory(value);
}

function isPathValue(node: TSESTree.Node, walk: Walk): boolean {
  const pending: Pending[] = [{ node, depth: 0 }];
  for (const item of pending) {
    const outcome = pathOutcome(walk, item);
    if (outcome === true) {
      return true;
    }
    if (outcome !== false) {
      for (const next of outcome) {
        pending.push(next);
      }
    }
  }
  return false;
}

function startsAsFileUrl(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.TemplateLiteral &&
    FILE_URL_START.test(node.quasis[0]?.value.cooked ?? '')
  );
}

export const rule: TSESLint.RuleModule<'filePath'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require a dynamic import of a filesystem path to go through a file URL',
    },
    schema: [],
    messages: {
      filePath:
        'Import a filesystem path as a file URL: `await import(pathToFileURL(file).href)`. ' +
        'On Windows a drive letter reads as a URL scheme and the import fails with ' +
        'ERR_UNSUPPORTED_ESM_URL_SCHEME.',
    },
  },
  create(context) {
    if (TEST_FILE.test(context.filename)) {
      return {};
    }
    const imported = importedPathFunctions(context.sourceCode.ast);

    return {
      ImportExpression(node: TSESTree.ImportExpression) {
        const source = unwrapOf(node.source, ASSERTION_FORMS);
        if (
          stringValue(resolveConstant(context, source)) !== undefined ||
          startsAsFileUrl(source)
        ) {
          return;
        }
        if (isPathValue(source, { context, imported })) {
          context.report({ node: node.source, messageId: 'filePath' });
        }
      },
    };
  },
};
