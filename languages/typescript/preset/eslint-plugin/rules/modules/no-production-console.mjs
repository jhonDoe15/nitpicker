import {
  importedNamespaces,
  isProcessObject,
  keyText,
  isProcessModule,
  propertyText,
  readsOf,
} from '../guards/no-process-access-outside-composition-root.mjs';
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

const STANDARD_STREAMS = new Set(['stdout', 'stderr']);

function streamNamed(name) {
  return STANDARD_STREAMS.has(name) ? name : undefined;
}

function patternSource(pattern) {
  const { parent } = pattern;
  if (parent.type === 'VariableDeclarator' && parent.id === pattern) {
    return parent.init ?? undefined;
  }
  const isAssignment =
    parent.type === 'AssignmentExpression' || parent.type === 'AssignmentPattern';
  return isAssignment && parent.left === pattern ? parent.right : undefined;
}

function destructuredStreams(pattern) {
  return pattern.properties
    .filter((property) => property.type === 'Property')
    .map((node) => ({ node, stream: streamNamed(keyText(node, node.key)) }))
    .filter(({ stream }) => stream !== undefined);
}

function importedStreams(declaration) {
  return declaration.specifiers
    .filter((specifier) => specifier.type === 'ImportSpecifier')
    .map((node) => ({ node, stream: streamNamed(node.imported.name ?? node.imported.value) }))
    .filter(({ stream }) => stream !== undefined);
}

function aliasStreamReads(context, declarator) {
  const { id } = declarator;
  if (id.type !== 'Identifier' || id.name === 'process') {
    return [];
  }
  return readsOf(context, declarator, id.name)
    .filter((read) => read.parent.type === 'MemberExpression' && read.parent.object === read)
    .map((read) => ({ node: read.parent, stream: streamNamed(propertyText(read.parent)) }))
    .filter(({ stream }) => stream !== undefined);
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
        'Use the application logger instead of console.{{method}}(). Program output goes through a `{ write(text: string): void }` parameter that the composition root fills with process.stdout or process.stderr. An exception fits only when this module is a script that prints the program output.',
      streamOutsideRoot:
        'Reach process.{{stream}} only in the composition root: take a `{ write(text: string): void }` parameter and write through it, and let the composition root pass process.stdout or process.stderr (and any isTTY or columns value) as an argument. An exception fits only when this module is an entry script.',
    },
  },
  create(context) {
    const inRoot = isCompositionRootFile(context);
    const state = { namespaces: new Set() };
    function reportStreams(found) {
      for (const { node, stream } of inRoot ? [] : found) {
        context.report({ node, messageId: 'streamOutsideRoot', data: { stream } });
      }
    }
    return {
      Program(node) {
        state.namespaces = importedNamespaces(node);
      },
      CallExpression(node) {
        const method = consoleCallMethod(node.callee);
        if (method !== undefined) {
          context.report({ node, messageId: 'consoleCall', data: { method } });
        }
      },
      MemberExpression(node) {
        const stream = streamNamed(propertyText(node));
        if (stream !== undefined && isProcessObject(node.object, state.namespaces)) {
          reportStreams([{ node, stream }]);
        }
      },
      ObjectPattern(node) {
        const source = patternSource(node);
        if (source !== undefined && isProcessObject(source, state.namespaces)) {
          reportStreams(destructuredStreams(node));
        }
      },
      ImportDeclaration(node) {
        if (isProcessModule(node.source.value)) {
          reportStreams(importedStreams(node));
        }
      },
      VariableDeclarator(node) {
        if (node.init !== null && isProcessObject(node.init, state.namespaces)) {
          reportStreams(aliasStreamReads(context, node));
        }
      },
    };
  },
};
