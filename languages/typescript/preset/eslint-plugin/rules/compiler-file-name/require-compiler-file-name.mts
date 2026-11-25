import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { bindingsOf, importedFunction } from '../security/imported-names.mts';
import { staticKey, unwrapped } from '../security/security-values.mts';
import { isPlainString } from '../typed/node-views.mts';
import { enclosingFileNameCandidate } from './compiler-file-name-scope.mts';

type MessageId = 'missingCompilerFileName';
type CompilerApi =
  'transpileModule' | 'transpile' | 'createSourceFile' | 'createLanguageServiceSourceFile';

const TYPESCRIPT_MODULES = new Set(['typescript']);
const COMPILER_APIS = new Set<string>([
  'transpileModule',
  'transpile',
  'createSourceFile',
  'createLanguageServiceSourceFile',
]);

const MESSAGE =
  'Pass the real file name (`{{candidate}}`) to `{{api}}` instead of omitting it or using a ' +
  'fixed string literal: without the real name, the compiler treats every input as the same file, ' +
  'so relative imports resolve against the wrong path and the file extension picks the wrong TSX ' +
  'or module format.';

function isCompilerApi(name: string | undefined): name is CompilerApi {
  return name !== undefined && COMPILER_APIS.has(name);
}

function isUndefinedExpression(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined') ||
    (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === 'void')
  );
}

function isMissingOrLiteralFileName(node: TSESTree.CallExpressionArgument | undefined): boolean {
  if (node === undefined) {
    return true;
  }
  if (node.type === AST_NODE_TYPES.SpreadElement) {
    return false;
  }
  const value = unwrapped(node);
  return isPlainString(value) || isUndefinedExpression(value);
}

function isFileNameProperty(
  property: TSESTree.ObjectLiteralElement,
): property is TSESTree.Property {
  return property.type === AST_NODE_TYPES.Property && staticKey(property) === 'fileName';
}

function hasInvalidFileNameOption(options: TSESTree.ObjectExpression): boolean {
  const lastSpreadIndex = options.properties.findLastIndex(
    (property) => property.type === AST_NODE_TYPES.SpreadElement,
  );
  const lastFileNameIndex = options.properties.findLastIndex(isFileNameProperty);
  if (lastFileNameIndex <= lastSpreadIndex) {
    return lastSpreadIndex < 0;
  }
  const property = options.properties[lastFileNameIndex];
  if (property === undefined || property.type !== AST_NODE_TYPES.Property) {
    return lastSpreadIndex < 0;
  }
  const value = unwrapped(property.value);
  return isPlainString(value) || isUndefinedExpression(value);
}

function hasInvalidTranspileModuleOptions(
  optionsArg: TSESTree.CallExpressionArgument | undefined,
): boolean {
  if (optionsArg === undefined) {
    return true;
  }
  if (optionsArg.type === AST_NODE_TYPES.SpreadElement) {
    return false;
  }
  const target = unwrapped(optionsArg);
  if (isUndefinedExpression(target)) {
    return true;
  }
  return target.type === AST_NODE_TYPES.ObjectExpression && hasInvalidFileNameOption(target);
}

function hasInvalidFileNameArgument(api: CompilerApi, call: TSESTree.CallExpression): boolean {
  const [first, second, third] = call.arguments;
  if (api === 'transpileModule') {
    return first?.type !== AST_NODE_TYPES.SpreadElement && hasInvalidTranspileModuleOptions(second);
  }
  if (api === 'transpile') {
    const hasEarlierSpread =
      first?.type === AST_NODE_TYPES.SpreadElement || second?.type === AST_NODE_TYPES.SpreadElement;
    return !hasEarlierSpread && isMissingOrLiteralFileName(third);
  }
  return isMissingOrLiteralFileName(first);
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require passing the real file name to TypeScript compiler APIs when an enclosing function has a file name or path',
    },
    schema: [],
    messages: {
      missingCompilerFileName: MESSAGE,
    },
  },
  create(context) {
    const bindings = bindingsOf(context.sourceCode.ast, TYPESCRIPT_MODULES);
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const api = importedFunction(context, node.callee, bindings);
        if (!isCompilerApi(api) || !hasInvalidFileNameArgument(api, node)) {
          return;
        }
        const candidate = enclosingFileNameCandidate(context.sourceCode, node);
        if (candidate !== undefined) {
          context.report({
            node,
            messageId: 'missingCompilerFileName',
            data: { api, candidate },
          });
        }
      },
    };
  },
};
