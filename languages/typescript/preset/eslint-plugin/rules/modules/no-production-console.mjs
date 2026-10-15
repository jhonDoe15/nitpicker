import {
  compositionRootOptionsSchema,
  isCompositionRootFile,
} from '../boundaries/composition-root-files.mjs';

function memberName(member) {
  if (!member.computed) {
    return member.property.type === 'Identifier' ? member.property.name : undefined;
  }
  return member.property.type === 'Literal' ? String(member.property.value) : undefined;
}

function isConsoleCall(callee) {
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'console' &&
    memberName(callee) !== undefined
  );
}

function isStandardStreamWrite(callee) {
  return (
    callee.type === 'MemberExpression' &&
    memberName(callee) === 'write' &&
    callee.object.type === 'MemberExpression' &&
    callee.object.object.type === 'Identifier' &&
    callee.object.object.name === 'process' &&
    ['stdout', 'stderr'].includes(memberName(callee.object))
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Keep production logging on the application logger path',
    },
    schema: compositionRootOptionsSchema,
    messages: {
      consoleCall:
        'Use the application logger instead of console.{{method}}(). If this module prints the program output, add an exception for this rule in nitpicker.config.json.',
      streamWrite:
        'Use the application logger instead of process.{{stream}}.write(). Program output is written in the composition root. If this module prints the program output, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isConsoleCall(node.callee)) {
          context.report({
            node,
            messageId: 'consoleCall',
            data: { method: memberName(node.callee) },
          });
        } else if (isStandardStreamWrite(node.callee) && !isCompositionRootFile(context)) {
          context.report({
            node,
            messageId: 'streamWrite',
            data: { stream: memberName(node.callee.object) },
          });
        }
      },
    };
  },
};
