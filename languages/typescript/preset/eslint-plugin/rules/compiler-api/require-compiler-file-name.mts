import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { scopeChain } from '../typed/node-views.mts';
import {
  apiName,
  type Definition,
  isModuleLoad,
  type Scope,
  type Variable,
} from './module-bindings.mts';

const { DefinitionType, ScopeType } = TSESLint.Scope;

const FILE_NAME = /^_*[a-z]?(?:[Ff]ile(?:[Nn]ame|[Pp]ath)?|[Pp]ath)$/u;
const TRANSPILE_NAME_INDEX = 2;
const NAME_AT = new Map([
  ['createSourceFile', 0],
  ['createLanguageServiceSourceFile', 0],
  ['transpile', TRANSPILE_NAME_INDEX],
]);

function isStringLiteral(node: TSESTree.Node | undefined): boolean {
  return (
    (node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') ||
    (node?.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0)
  );
}

function isFileType(variable: Variable): boolean {
  const annotation = variable.identifiers[0]?.typeAnnotation?.typeAnnotation;
  return (
    annotation?.type === AST_NODE_TYPES.TSTypeReference &&
    annotation.typeName.type === AST_NODE_TYPES.Identifier &&
    annotation.typeName.name === 'File'
  );
}

function isLoadedModule(definition: Definition): boolean {
  return (
    definition.type === DefinitionType.ImportBinding ||
    (definition.node.type === AST_NODE_TYPES.VariableDeclarator &&
      isModuleLoad(definition.node.init ?? undefined))
  );
}

function holdsFileName(variable: Variable): boolean {
  return (
    FILE_NAME.test(variable.name) && !isFileType(variable) && !variable.defs.some(isLoadedModule)
  );
}

function hasFileNameInScope(scope: Scope): boolean {
  const chain = scopeChain(scope);
  const outer = chain.findIndex(
    (current) => current.type === ScopeType.global || current.type === ScopeType.module,
  );
  return chain.slice(0, outer).some((current) => current.variables.some(holdsFileName));
}

function propertyKey(property: TSESTree.Property): string | undefined {
  if (property.key.type === AST_NODE_TYPES.Identifier && !property.computed) {
    return property.key.name;
  }
  return property.key.type === AST_NODE_TYPES.Literal ? String(property.key.value) : undefined;
}

function optionsDropName(options: TSESTree.ObjectExpression): boolean {
  const properties = options.properties.filter(
    (property): property is TSESTree.Property => property.type === AST_NODE_TYPES.Property,
  );
  if (properties.length !== options.properties.length) {
    return false;
  }
  const keys = properties.map(propertyKey);
  if (keys.includes(undefined)) {
    return false;
  }
  const property = properties[keys.indexOf('fileName')];
  return property === undefined || isStringLiteral(property.value);
}

function transpileModuleDropsName(args: readonly TSESTree.CallExpressionArgument[]): boolean {
  const options = args[1];
  if (args.some((argument) => argument.type === AST_NODE_TYPES.SpreadElement)) {
    return false;
  }
  if (options === undefined) {
    return true;
  }
  return options.type === AST_NODE_TYPES.ObjectExpression && optionsDropName(options);
}

function dropsName(name: string, args: readonly TSESTree.CallExpressionArgument[]): boolean {
  if (name === 'transpileModule') {
    return transpileModuleDropsName(args);
  }
  const index = NAME_AT.get(name);
  if (
    index === undefined ||
    args.some((argument) => argument.type === AST_NODE_TYPES.SpreadElement)
  ) {
    return false;
  }
  const argument = args[index];
  return name === 'transpile'
    ? argument === undefined || isStringLiteral(argument)
    : isStringLiteral(argument);
}

export const rule: TSESLint.RuleModule<'fixedName'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require the TypeScript compiler API to be given the real file name of its input',
    },
    schema: [],
    messages: {
      fixedName:
        'This call to the TypeScript compiler leaves the file name out or fixes it to a literal, while the enclosing function has the real name. The compiler then treats every input as the same file: relative imports resolve against it (a file importing "./module" imports itself), and its extension picks TSX or the module format. Pass the real file name.',
    },
  },
  create(context) {
    if (!context.sourceCode.text.includes('typescript')) {
      return {};
    }
    return {
      CallExpression(node) {
        const name = apiName(node.callee, context.sourceCode.getScope(node));
        if (
          name !== undefined &&
          dropsName(name, node.arguments) &&
          hasFileNameInScope(context.sourceCode.getScope(node))
        ) {
          context.report({ node, messageId: 'fixedName' });
        }
      },
    };
  },
};
