import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  isProcessModule,
  isProcessValue,
  wrapperTop,
} from '../analysis/globals/process-values.mts';
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
};

const PROCESS = 'process';
const ENV_MESSAGE: MessageId = 'envOutsideRoot';
const EXIT_MESSAGE: MessageId = 'exitOutsideRoot';
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
    state.context.report({ node, messageId: ENV_MESSAGE });
  } else if (ownerIsProcess && propertyText(node) === 'exit' && !insideMainGuard(node)) {
    state.context.report({ node, messageId: EXIT_MESSAGE });
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
      const messageId: MessageId = member === 'env' ? ENV_MESSAGE : EXIT_MESSAGE;
      state.context.report({ node: read, messageId });
    }
  }
}

function checkRestRead(state: State, read: Node): void {
  const top = wrapperTop(read);
  if (top.parent?.type === AST_NODE_TYPES.MemberExpression && top.parent.object === top) {
    checkMember(state, top.parent, true);
  }
}

function restNames(pattern: TSESTree.ObjectPattern): string[] {
  return pattern.properties
    .filter((property) => property.type === AST_NODE_TYPES.RestElement)
    .flatMap((property) => bindingName(property.argument) ?? []);
}

function checkRestReads(state: State, declarator: TSESTree.VariableDeclarator): void {
  const { id } = declarator;
  const names = id.type === AST_NODE_TYPES.ObjectPattern ? restNames(id) : [];
  for (const read of names.flatMap((name) => readsOf(state.context, declarator, name))) {
    checkRestRead(state, read);
  }
}

function checkDeclarator(state: State, declarator: TSESTree.VariableDeclarator): void {
  if (declarator.init === null || !isProcessValue(state.context, declarator.init)) {
    return;
  }
  if (declarator.id.type === AST_NODE_TYPES.ObjectPattern) {
    checkMemberBindings(state, declarator, destructuredMembers(declarator.id));
    checkRestReads(state, declarator);
  }
}

function checkReexport(state: State, declaration: TSESTree.ExportNamedDeclaration): void {
  if (
    declaration.source === null ||
    !isProcessModule(declaration.source.value) ||
    declaration.exportKind === 'type'
  ) {
    return;
  }
  for (const specifier of declaration.specifiers) {
    const { local } = specifier;
    const member = local.type === AST_NODE_TYPES.Identifier ? local.name : local.value;
    if (specifier.exportKind !== 'type' && PROCESS_MEMBERS.has(member)) {
      const messageId: MessageId = member === 'env' ? ENV_MESSAGE : EXIT_MESSAGE;
      state.context.report({ node: specifier, messageId });
    }
  }
}

function ownsProcess(state: State, node: TSESTree.MemberExpression): boolean {
  const member = propertyText(node);
  return (member === 'env' || member === 'exit') && isProcessValue(state.context, node.object);
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
    const state: State = { context, options };
    return {
      ImportDeclaration(node) {
        if (isProcessModule(node.source.value)) {
          checkMemberBindings(state, node, importedMembers(node));
        }
      },
      ExportNamedDeclaration(node) {
        checkReexport(state, node);
      },
      VariableDeclarator(node) {
        checkDeclarator(state, node);
      },
      MemberExpression(node) {
        checkMember(state, node, ownsProcess(state, node));
      },
    };
  },
};
