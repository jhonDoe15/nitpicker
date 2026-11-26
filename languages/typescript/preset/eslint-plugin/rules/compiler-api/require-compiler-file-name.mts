import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';

type ArgumentNode = TSESTree.CallExpressionArgument | undefined;

const FILE_NAME = /^_*[a-z]?(?:[Ff]ile(?:[Nn]ame|[Pp]ath)?|[Ff]ilename|[Pp]ath)$/u;
const MODULES = new Set(['typescript']);
const NAME_AT = new Map([
  ['createSourceFile', 0],
  ['createLanguageServiceSourceFile', 0],
  ['transpile', 2],
]);

function isStringLiteral(node: ArgumentNode): boolean {
  return (
    (node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') ||
    (node?.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0)
  );
}

function unwrapAwait(node: TSESTree.Node | null | undefined): TSESTree.Node | null | undefined {
  return node?.type === AST_NODE_TYPES.AwaitExpression ? node.argument : node;
}

function isRequireOf(node: TSESTree.Node | null | undefined): node is TSESTree.CallExpression {
  return (
    node?.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'require'
  );
}

function isModuleLoad(node: TSESTree.Node | null | undefined): boolean {
  const unwrapped = unwrapAwait(node);
  return isRequireOf(unwrapped) || unwrapped?.type === AST_NODE_TYPES.ImportExpression;
}

function isTypescriptRequire(node: TSESTree.Node | null | undefined): boolean {
  return (
    isRequireOf(node) &&
    node.arguments[0]?.type === AST_NODE_TYPES.Literal &&
    MODULES.has(String(node.arguments[0].value))
  );
}

function findVariable(
  scope: TSESLint.Scope.Scope | null,
  name: string,
): TSESLint.Scope.Variable | undefined {
  for (let current = scope; current !== null; current = current.upper) {
    const variable = current.set.get(name);
    if (variable !== undefined) {
      return variable;
    }
  }
  return undefined;
}

function patternKey(pattern: TSESTree.ObjectPattern, local: string): string | undefined {
  for (const property of pattern.properties) {
    if (
      property.type === AST_NODE_TYPES.Property &&
      !property.computed &&
      property.key.type === AST_NODE_TYPES.Identifier &&
      property.value.type === AST_NODE_TYPES.Identifier &&
      property.value.name === local
    ) {
      return property.key.name;
    }
  }
  return undefined;
}

type Binding = { readonly namespace: true } | { readonly namespace: false; readonly name: string };

function bindingOf(
  name: string,
  scope: TSESLint.Scope.Scope | null,
  depth = 0,
): Binding | undefined {
  const variable = findVariable(scope, name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (variable === undefined || definition === undefined || depth > 3) {
    return undefined;
  }
  const node = definition.node as TSESTree.Node;
  if (definition.type === 'ImportBinding') {
    if (node.type === AST_NODE_TYPES.ImportSpecifier) {
      const source = (node.parent as TSESTree.ImportDeclaration).source.value;
      return MODULES.has(source)
        ? { namespace: false, name: (node.imported as TSESTree.Identifier).name }
        : undefined;
    }
    if (
      node.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
      node.type === AST_NODE_TYPES.ImportNamespaceSpecifier
    ) {
      return MODULES.has((node.parent as TSESTree.ImportDeclaration).source.value)
        ? { namespace: true }
        : undefined;
    }
    return node.type === AST_NODE_TYPES.TSImportEqualsDeclaration &&
      node.moduleReference.type === AST_NODE_TYPES.TSExternalModuleReference &&
      node.moduleReference.expression.type === AST_NODE_TYPES.Literal &&
      MODULES.has(String(node.moduleReference.expression.value))
      ? { namespace: true }
      : undefined;
  }
  if (node.type !== AST_NODE_TYPES.VariableDeclarator || node.init === null) {
    return undefined;
  }
  const init = node.init;
  const fromModule = isTypescriptRequire(init)
    ? ({ namespace: true } as Binding)
    : init.type === AST_NODE_TYPES.Identifier
      ? bindingOf(init.name, variable.scope, depth + 1)
      : undefined;
  if (fromModule === undefined) {
    return undefined;
  }
  if (node.id.type === AST_NODE_TYPES.Identifier) {
    return fromModule;
  }
  if (node.id.type === AST_NODE_TYPES.ObjectPattern && fromModule.namespace) {
    const key = patternKey(node.id, name);
    return key === undefined ? undefined : { namespace: false, name: key };
  }
  return undefined;
}

function apiName(callee: TSESTree.Node, scope: TSESLint.Scope.Scope | null): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    const binding = bindingOf(callee.name, scope);
    return binding?.namespace === false ? binding.name : undefined;
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    bindingOf(callee.object.name, scope)?.namespace === true
  ) {
    return callee.property.name;
  }
  return undefined;
}

function isFileType(variable: TSESLint.Scope.Variable): boolean {
  const annotation = (variable.identifiers[0] as TSESTree.Identifier | undefined)?.typeAnnotation
    ?.typeAnnotation;
  return (
    annotation?.type === AST_NODE_TYPES.TSTypeReference &&
    annotation.typeName.type === AST_NODE_TYPES.Identifier &&
    annotation.typeName.name === 'File'
  );
}

function holdsFileName(variable: TSESLint.Scope.Variable): boolean {
  return (
    FILE_NAME.test(variable.name) &&
    !isFileType(variable) &&
    variable.defs.every(
      (definition) =>
        definition.type !== 'ImportBinding' &&
        !(
          definition.node.type === AST_NODE_TYPES.VariableDeclarator &&
          isModuleLoad(definition.node.init)
        ),
    )
  );
}

function hasFileNameInScope(scope: TSESLint.Scope.Scope | null): boolean {
  for (let current = scope; current !== null; current = current.upper) {
    if (current.type === 'global' || current.type === 'module') {
      return false;
    }
    if (current.variables.some(holdsFileName)) {
      return true;
    }
  }
  return false;
}

function transpileModuleDropsName(args: readonly TSESTree.CallExpressionArgument[]): boolean {
  const options = args[1];
  if (args.some((argument) => argument.type === AST_NODE_TYPES.SpreadElement)) {
    return false;
  }
  if (options === undefined) {
    return true;
  }
  if (options.type !== AST_NODE_TYPES.ObjectExpression) {
    return false;
  }
  if (options.properties.some((property) => property.type === AST_NODE_TYPES.SpreadElement)) {
    return false;
  }
  const keys = options.properties.map((candidate) => {
    const property = candidate as TSESTree.Property;
    if (!property.computed) {
      return property.key.type === AST_NODE_TYPES.Identifier
        ? property.key.name
        : String((property.key as { value?: unknown }).value);
    }
    return property.key.type === AST_NODE_TYPES.Literal ? String(property.key.value) : undefined;
  });
  if (keys.includes(undefined)) {
    return false;
  }
  const property = options.properties[keys.indexOf('fileName')] as TSESTree.Property | undefined;
  return property === undefined || isStringLiteral(property.value as ArgumentNode);
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

export const rule: TSESLint.RuleModule<'fixedName', [], unknown> = {
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
