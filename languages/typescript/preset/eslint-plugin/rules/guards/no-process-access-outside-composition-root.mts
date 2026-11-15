import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../analysis/constant-resolution.mts';
import { isCompositionRootFile } from '../boundaries/composition-root-files.mts';
import { mentionsEntryPoint } from '../modules/no-process-globals-outside-main-guard.mts';
import { ancestorsOf } from '../typed/node-views.mts';

type Node = TSESTree.Node;
type MessageId = 'envOutsideRoot' | 'exitOutsideRoot';
type Options = readonly [Readonly<Record<string, unknown>>?];
type EnvOptions = { readonly allowImportMetaEnv: boolean; readonly allowBundlerEnv: boolean };
type Member = {
  readonly node: Node;
  readonly member: string | undefined;
  readonly local: string | undefined;
};
type State = {
  readonly context: TSESLint.RuleContext<MessageId, Options>;
  readonly options: EnvOptions;
  namespaces: ReadonlySet<string>;
};

const PROCESS = 'process';
const PROCESS_MODULES = new Set<string>(['process', 'node:process']);
const GLOBAL_OBJECTS = new Set<string>(['globalThis', 'global', 'window', 'self']);
const PROCESS_MEMBERS = new Set<string>(['env', 'exit']);
const BUNDLER_REPLACED_VARIABLE = /^(?:NODE_ENV|(?:NEXT_PUBLIC|EXPO_PUBLIC|REACT_APP)_\w+)$/;

function keyText(node: { readonly computed: boolean }, key: Node): string | undefined {
  if (!node.computed) {
    return key.type === AST_NODE_TYPES.Identifier ? key.name : undefined;
  }
  return key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string'
    ? key.value
    : undefined;
}

function propertyText(node: TSESTree.MemberExpression): string | undefined {
  return keyText(node, node.property);
}

function isPlainProcess(node: Node): boolean {
  return node.type === AST_NODE_TYPES.Identifier && node.name === PROCESS;
}

function isProcessObject(node: Node, namespaces: ReadonlySet<string>): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return isPlainProcess(node) || namespaces.has(node.name);
  }
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return (
      node.object.type === AST_NODE_TYPES.Identifier &&
      GLOBAL_OBJECTS.has(node.object.name) &&
      propertyText(node) === PROCESS
    );
  }
  const module =
    node.type === AST_NODE_TYPES.CallExpression ? stringValue(node.arguments[0]) : undefined;
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'require' &&
    module !== undefined &&
    PROCESS_MODULES.has(module)
  );
}

function isBundlerReplaced(node: Node): boolean {
  const { parent } = node;
  if (parent?.type !== AST_NODE_TYPES.MemberExpression || parent.object !== node) {
    return false;
  }
  const variable = propertyText(parent);
  return typeof variable === 'string' && BUNDLER_REPLACED_VARIABLE.test(variable);
}

function envReader(
  owner: Node,
  ownerIsProcess: boolean,
): 'import.meta' | 'Deno' | 'process' | undefined {
  if (owner.type === AST_NODE_TYPES.MetaProperty) {
    return 'import.meta';
  }
  if (owner.type === AST_NODE_TYPES.Identifier && owner.name === 'Deno') {
    return 'Deno';
  }
  return ownerIsProcess ? PROCESS : undefined;
}

function isEnvAccess(
  node: TSESTree.MemberExpression,
  options: EnvOptions,
  ownerIsProcess: boolean,
): boolean {
  const reader = propertyText(node) === 'env' ? envReader(node.object, ownerIsProcess) : undefined;
  if (reader === undefined || (reader === 'import.meta' && options.allowImportMetaEnv)) {
    return false;
  }
  return !(options.allowBundlerEnv && isPlainProcess(node.object) && isBundlerReplaced(node));
}

function insideMainGuard(node: Node): boolean {
  return ancestorsOf(node).some(
    (ancestor) => ancestor.type === AST_NODE_TYPES.IfStatement && mentionsEntryPoint(ancestor.test),
  );
}

function importedNamespaces(program: TSESTree.Program): Set<string> {
  return new Set(
    program.body
      .flatMap((statement) =>
        statement.type === AST_NODE_TYPES.ImportDeclaration &&
        PROCESS_MODULES.has(statement.source.value)
          ? statement.specifiers
          : [],
      )
      .filter((specifier) => specifier.type !== AST_NODE_TYPES.ImportSpecifier)
      .map((specifier) => specifier.local.name),
  );
}

function bindingName(value: Node): string | undefined {
  const target = value.type === AST_NODE_TYPES.AssignmentPattern ? value.left : value;
  return target.type === AST_NODE_TYPES.Identifier ? target.name : undefined;
}

function destructuredMembers(pattern: TSESTree.ObjectPattern): Member[] {
  return pattern.properties
    .filter((property) => property.type === AST_NODE_TYPES.Property)
    .map((property) => ({
      node: property,
      member: keyText(property, property.key),
      local: bindingName(property.value),
    }))
    .filter(({ member }) => member !== undefined && PROCESS_MEMBERS.has(member));
}

function importedMembers(declaration: TSESTree.ImportDeclaration): Member[] {
  return declaration.specifiers
    .filter((specifier) => specifier.type === AST_NODE_TYPES.ImportSpecifier)
    .map((specifier) => ({
      node: specifier,
      member:
        specifier.imported.type === AST_NODE_TYPES.Identifier
          ? specifier.imported.name
          : specifier.imported.value,
      local: specifier.local.name,
    }))
    .filter(({ member }) => PROCESS_MEMBERS.has(member));
}

function checkMember(state: State, node: TSESTree.MemberExpression, ownerIsProcess: boolean): void {
  if (isEnvAccess(node, state.options, ownerIsProcess)) {
    state.context.report({ node, messageId: 'envOutsideRoot' });
  } else if (ownerIsProcess && propertyText(node) === 'exit' && !insideMainGuard(node)) {
    state.context.report({ node, messageId: 'exitOutsideRoot' });
  }
}

function readsOf(
  context: State['context'],
  declaration: Node,
  name: string,
): (TSESTree.Identifier | TSESTree.JSXIdentifier)[] {
  const variable = context.sourceCode
    .getDeclaredVariables(declaration)
    .find((candidate) => candidate.name === name);
  return (variable?.references ?? [])
    .filter((reference) => reference.isRead())
    .map(({ identifier }) => identifier);
}

function checkMemberBindings(state: State, declaration: Node, members: readonly Member[]): void {
  for (const { node, member, local } of members) {
    const reads: readonly Node[] =
      local === undefined ? [node] : readsOf(state.context, declaration, local);
    for (const read of reads.filter((site) => member === 'env' || !insideMainGuard(site))) {
      const messageId: MessageId = member === 'env' ? 'envOutsideRoot' : 'exitOutsideRoot';
      state.context.report({ node: read, messageId });
    }
  }
}

function checkDeclarator(state: State, declarator: TSESTree.VariableDeclarator): void {
  if (declarator.init === null || !isProcessObject(declarator.init, state.namespaces)) {
    return;
  }
  if (declarator.id.type === AST_NODE_TYPES.ObjectPattern) {
    checkMemberBindings(state, declarator, destructuredMembers(declarator.id));
    return;
  }
  if (declarator.id.type !== AST_NODE_TYPES.Identifier || isPlainProcess(declarator.id)) {
    return;
  }
  for (const read of readsOf(state.context, declarator, declarator.id.name)) {
    if (read.parent.type === AST_NODE_TYPES.MemberExpression && read.parent.object === read) {
      checkMember(state, read.parent, true);
    }
  }
}

export const rule: TSESLint.RuleModule<MessageId, Options> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Read environment variables and exit the process only in the composition root',
    },
    schema: [
      {
        type: 'object',
        properties: {
          compositionRootPattern: { type: 'string' },
          allowImportMetaEnv: { type: 'boolean' },
          allowBundlerEnv: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      envOutsideRoot:
        'Read environment variables only in the composition root: parse the environment once with a zod schema there and pass the typed config down as a parameter. An exception fits only when this module is a config loader or a script.',
      exitOutsideRoot:
        'process.exit stops the whole process from inside library code. Return a result or throw an Error subclass, and call process.exit only in the composition root or a main guard (`if (import.meta.main)`). An exception fits only when this module is an entry script.',
    },
  },
  create(context) {
    if (isCompositionRootFile(context)) {
      return {};
    }
    const options: EnvOptions = {
      allowImportMetaEnv: context.options[0]?.['allowImportMetaEnv'] === true,
      allowBundlerEnv: context.options[0]?.['allowBundlerEnv'] === true,
    };
    const state: State = { context, options, namespaces: new Set() };
    return {
      Program(node) {
        state.namespaces = importedNamespaces(node);
      },
      ImportDeclaration(node) {
        if (PROCESS_MODULES.has(node.source.value)) {
          checkMemberBindings(state, node, importedMembers(node));
        }
      },
      VariableDeclarator(node) {
        checkDeclarator(state, node);
      },
      MemberExpression(node) {
        checkMember(state, node, isProcessObject(node.object, state.namespaces));
      },
    };
  },
};
