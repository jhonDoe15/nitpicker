import { ancestorsOf } from '../analysis/ancestry.mjs';
import { stringValue } from '../analysis/constant-resolution.mjs';
import { isCompositionRootFile } from '../boundaries/composition-root-files.mjs';
import { mentionsEntryPoint } from '../modules/no-process-globals-outside-main-guard.mjs';

export const PROCESS_MODULES = new Set(['process', 'node:process']);
const GLOBAL_OBJECTS = new Set(['globalThis', 'global', 'window', 'self']);
const PROCESS_MEMBERS = new Set(['env', 'exit']);
const BUNDLER_REPLACED_VARIABLE = /^(?:NODE_ENV|(?:NEXT_PUBLIC|EXPO_PUBLIC|REACT_APP)_\w+)$/;

export function keyText(node, key) {
  if (!node.computed) {
    return key.type === 'Identifier' ? key.name : undefined;
  }
  return key.type === 'Literal' ? key.value : undefined;
}

export function propertyText(node) {
  return keyText(node, node.property);
}

function isPlainProcess(node) {
  return node.type === 'Identifier' && node.name === 'process';
}

export function isProcessObject(node, namespaces) {
  if (node.type === 'Identifier') {
    return isPlainProcess(node) || namespaces.has(node.name);
  }
  if (node.type === 'MemberExpression') {
    return (
      node.object.type === 'Identifier' &&
      GLOBAL_OBJECTS.has(node.object.name) &&
      propertyText(node) === 'process'
    );
  }
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require' &&
    PROCESS_MODULES.has(stringValue(node.arguments[0]))
  );
}

function isBundlerReplaced(node) {
  const { parent } = node;
  if (parent.type !== 'MemberExpression' || parent.object !== node) {
    return false;
  }
  const variable = propertyText(parent);
  return typeof variable === 'string' && BUNDLER_REPLACED_VARIABLE.test(variable);
}

function envReader(owner, ownerIsProcess) {
  if (owner.type === 'MetaProperty') {
    return 'import.meta';
  }
  if (owner.type === 'Identifier' && owner.name === 'Deno') {
    return 'Deno';
  }
  return ownerIsProcess ? 'process' : undefined;
}

function isEnvAccess(node, options, ownerIsProcess) {
  const reader = propertyText(node) === 'env' ? envReader(node.object, ownerIsProcess) : undefined;
  if (reader === undefined || (reader === 'import.meta' && options.allowImportMetaEnv)) {
    return false;
  }
  return !(options.allowBundlerEnv && isPlainProcess(node.object) && isBundlerReplaced(node));
}

function insideMainGuard(node) {
  return ancestorsOf(node).some(
    (ancestor) => ancestor.type === 'IfStatement' && mentionsEntryPoint(ancestor.test),
  );
}

export function importedNamespaces(program) {
  return new Set(
    program.body
      .filter(
        (statement) =>
          statement.type === 'ImportDeclaration' && PROCESS_MODULES.has(statement.source.value),
      )
      .flatMap((statement) => statement.specifiers)
      .filter((specifier) => specifier.type !== 'ImportSpecifier')
      .map((specifier) => specifier.local.name),
  );
}

function bindingName(value) {
  const target = value.type === 'AssignmentPattern' ? value.left : value;
  return target.type === 'Identifier' ? target.name : undefined;
}

function destructuredMembers(pattern) {
  return pattern.properties
    .filter((property) => property.type === 'Property')
    .map((property) => ({
      node: property,
      member: keyText(property, property.key),
      local: bindingName(property.value),
    }))
    .filter(({ member }) => PROCESS_MEMBERS.has(member));
}

function importedMembers(declaration) {
  return declaration.specifiers
    .filter((specifier) => specifier.type === 'ImportSpecifier')
    .map((specifier) => ({
      node: specifier,
      member: specifier.imported.name ?? specifier.imported.value,
      local: specifier.local.name,
    }))
    .filter(({ member }) => PROCESS_MEMBERS.has(member));
}

function checkMember(state, node, ownerIsProcess) {
  if (isEnvAccess(node, state.options, ownerIsProcess)) {
    state.context.report({ node, messageId: 'envOutsideRoot' });
  } else if (ownerIsProcess && propertyText(node) === 'exit' && !insideMainGuard(node)) {
    state.context.report({ node, messageId: 'exitOutsideRoot' });
  }
}

export function readsOf(context, declaration, name) {
  const variable = context.sourceCode
    .getDeclaredVariables(declaration)
    .find((candidate) => candidate.name === name);
  return (variable?.references ?? [])
    .filter((reference) => reference.isRead())
    .map(({ identifier }) => identifier);
}

function checkMemberBindings(state, declaration, members) {
  for (const { node, member, local } of members) {
    const reads = local === undefined ? [node] : readsOf(state.context, declaration, local);
    for (const read of reads.filter((site) => member === 'env' || !insideMainGuard(site))) {
      const messageId = member === 'env' ? 'envOutsideRoot' : 'exitOutsideRoot';
      state.context.report({ node: read, messageId });
    }
  }
}

function checkDeclarator(state, declarator) {
  if (declarator.init === null || !isProcessObject(declarator.init, state.namespaces)) {
    return;
  }
  if (declarator.id.type === 'ObjectPattern') {
    checkMemberBindings(state, declarator, destructuredMembers(declarator.id));
    return;
  }
  if (declarator.id.type !== 'Identifier' || isPlainProcess(declarator.id)) {
    return;
  }
  for (const read of readsOf(state.context, declarator, declarator.id.name)) {
    if (read.parent.type === 'MemberExpression' && read.parent.object === read) {
      checkMember(state, read.parent, true);
    }
  }
}

export const rule = {
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
    const options = {
      allowImportMetaEnv: context.options[0]?.allowImportMetaEnv === true,
      allowBundlerEnv: context.options[0]?.allowBundlerEnv === true,
    };
    const state = { context, options, namespaces: new Set() };
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
