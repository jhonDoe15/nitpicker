import { ancestorsOf } from '../analysis/ancestry.mjs';
import { isCompositionRootFile } from '../boundaries/composition-root-files.mjs';
import { mentionsEntryPoint } from '../modules/no-process-globals-outside-main-guard.mjs';

function propertyText(node) {
  if (!node.computed) {
    return node.property.type === 'Identifier' ? node.property.name : undefined;
  }
  return node.property.type === 'Literal' ? node.property.value : undefined;
}

function isEnvAccess(node, allowImportMetaEnv) {
  const owner = node.object;
  const base = owner.type === 'MetaProperty' ? 'import.meta' : owner.name;
  const readers = allowImportMetaEnv ? ['process', 'Deno'] : ['process', 'import.meta', 'Deno'];
  return readers.includes(base) && propertyText(node) === 'env';
}

function isProcessExit(node) {
  return (
    node.object.type === 'Identifier' &&
    node.object.name === 'process' &&
    propertyText(node) === 'exit'
  );
}

function insideMainGuard(node) {
  return ancestorsOf(node).some(
    (ancestor) => ancestor.type === 'IfStatement' && mentionsEntryPoint(ancestor.test),
  );
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
        },
        additionalProperties: false,
      },
    ],
    messages: {
      envOutsideRoot:
        'Read environment variables only in the composition root: parse the environment once with a zod schema there and pass the typed config down as a parameter. If this module is a config loader or a script, add an exception for this rule in nitpicker.config.json.',
      exitOutsideRoot:
        'process.exit stops the whole process from inside library code. Return a result or throw an Error subclass, and call process.exit only in the composition root or a main guard (`if (import.meta.main)`). If this module is an entry script, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    if (isCompositionRootFile(context)) {
      return {};
    }
    const allowImportMetaEnv = context.options[0]?.allowImportMetaEnv === true;
    return {
      MemberExpression(node) {
        if (isEnvAccess(node, allowImportMetaEnv)) {
          context.report({ node, messageId: 'envOutsideRoot' });
        } else if (isProcessExit(node) && !insideMainGuard(node)) {
          context.report({ node, messageId: 'exitOutsideRoot' });
        }
      },
    };
  },
};
