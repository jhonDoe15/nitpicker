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

export function consoleMethodOf(call) {
  const { callee } = call;
  const isConsoleMember =
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'console' &&
    callee.property.type === 'Identifier';
  return isConsoleMember ? callee.property.name : undefined;
}

function consoleCallMethod(callee) {
  const isConsole =
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'console';
  return isConsole ? memberName(callee) : undefined;
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
        'Use the application logger instead of console.{{method}}(). An exception fits only when this module prints the program output.',
      streamWrite:
        'Use the application logger instead of process.{{stream}}.write(). Program output is written in the composition root. An exception fits only when this module prints the program output.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const method = consoleCallMethod(node.callee);
        if (method !== undefined) {
          context.report({ node, messageId: 'consoleCall', data: { method } });
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
