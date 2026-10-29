import { findVariable } from '../analysis/constant-resolution.mjs';
import {
  isGlobalObject,
  isProcessModule,
  isProcessValue,
  propertyName,
  staticName,
  wrapperTop,
} from '../analysis/process-values.mjs';
import { isCompositionRootFile } from '../boundaries/composition-root-files.mjs';

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

const STANDARD_STREAMS = new Set(['stdout', 'stderr']);
const ALL_STREAMS = 'stdout and process.stderr';

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

function isTypeOnly(node) {
  return node.importKind === 'type' || node.exportKind === 'type';
}

function namedStreams(specifiers, nameOf) {
  return specifiers
    .filter((node) => node.type !== 'ExportNamespaceSpecifier' && !isTypeOnly(node))
    .map((node) => ({ node, stream: streamNamed(nameOf(node)) }))
    .filter(({ stream }) => stream !== undefined);
}

function nameText(node) {
  return node.name ?? node.value;
}

function restStreamReads(context, pattern) {
  return pattern.properties
    .filter(
      (property) => property.type === 'RestElement' && property.argument.type === 'Identifier',
    )
    .flatMap(({ argument }) => findVariable(context, argument, argument.name)?.references ?? [])
    .map(({ identifier }) => identifier.parent)
    .filter((parent) => parent.type === 'MemberExpression')
    .map((node) => ({ node, stream: streamNamed(staticName(node)) }))
    .filter(({ stream }) => stream !== undefined);
}

function consoleReference(sourceCode, use) {
  const top = wrapperTop(use);
  const { parent } = top;
  if (parent.type !== 'MemberExpression' || parent.object !== top) {
    return { node: top, reference: 'console' };
  }
  const name = staticName(parent);
  const access = name === undefined ? `[${sourceCode.getText(parent.property)}]` : `.${name}`;
  const callee = wrapperTop(parent);
  const isCall = callee.parent.type === 'CallExpression' && callee.parent.callee === callee;
  return { node: parent, reference: `console${access}${isCall ? '()' : ''}` };
}

function isTypeContext(use) {
  const { parent } = wrapperTop(use);
  return (
    parent.type === 'TSTypeQuery' ||
    (parent.type === 'UnaryExpression' && parent.operator === 'typeof')
  );
}

function globalConsoleUses(sourceCode) {
  const globalScope = sourceCode.scopeManager.globalScope;
  const declared = globalScope.set.get('console');
  const resolved = declared?.defs.length === 0 ? declared.references : [];
  return [
    ...resolved,
    ...globalScope.through.filter(({ identifier }) => identifier.name === 'console'),
  ]
    .map(({ identifier }) => identifier)
    .filter((identifier) => !isTypeContext(identifier));
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Keep production logging on the application logger path',
    },
    schema: [
      {
        type: 'object',
        properties: {
          compositionRootPattern: { type: 'string' },
          allowStandardStreams: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      consoleCall:
        'Use the application logger instead of {{reference}}. Program output goes through a `{ write(text: string): void }` parameter that the composition root fills with process.stdout or process.stderr. An exception fits only when this module is a script that prints the program output.',
      streamOutsideRoot:
        'Reach process.{{stream}} only in the composition root or an entry point: take a `{ write(text: string): void }` parameter and write through it, and let the entry pass process.stdout or process.stderr (and any isTTY or columns value) as an argument. An exception fits only when this module is a script that prints the program output.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const streamsAllowed =
      context.options[0]?.allowStandardStreams === true || isCompositionRootFile(context);
    function reportStreams(found) {
      for (const { node, stream } of streamsAllowed ? [] : found) {
        context.report({ node, messageId: 'streamOutsideRoot', data: { stream } });
      }
    }
    function reportConsole(node, reference) {
      context.report({ node, messageId: 'consoleCall', data: { reference } });
    }
    return {
      Program() {
        for (const use of globalConsoleUses(sourceCode)) {
          const { node, reference } = consoleReference(sourceCode, use);
          reportConsole(node, reference);
        }
      },
      MemberExpression(node) {
        const name = staticName(node);
        if (name === 'console' && isGlobalObject(context, node.object)) {
          const { node: reported, reference } = consoleReference(sourceCode, node);
          reportConsole(reported, reference);
        }
        const stream = streamNamed(name);
        if (stream !== undefined && isProcessValue(context, node.object)) {
          reportStreams([{ node, stream }]);
        }
      },
      ObjectPattern(node) {
        const source = patternSource(node);
        if (source === undefined) {
          return;
        }
        const properties = node.properties.filter(({ type }) => type === 'Property');
        if (isGlobalObject(context, source)) {
          for (const property of properties.filter((entry) => propertyName(entry) === 'console')) {
            reportConsole(property, 'console');
          }
        }
        if (isProcessValue(context, source)) {
          reportStreams(
            properties
              .map((property) => ({ node: property, stream: streamNamed(propertyName(property)) }))
              .filter(({ stream }) => stream !== undefined),
          );
          reportStreams(restStreamReads(context, node));
        }
      },
      ImportDeclaration(node) {
        if (isProcessModule(node.source.value) && !isTypeOnly(node)) {
          reportStreams(
            namedStreams(
              node.specifiers,
              (specifier) => specifier.imported && nameText(specifier.imported),
            ),
          );
        }
      },
      ExportNamedDeclaration(node) {
        if (node.source && isProcessModule(node.source.value) && !isTypeOnly(node)) {
          reportStreams(namedStreams(node.specifiers, (specifier) => nameText(specifier.local)));
        }
      },
      ExportAllDeclaration(node) {
        if (isProcessModule(node.source.value) && !isTypeOnly(node)) {
          reportStreams([{ node, stream: ALL_STREAMS }]);
        }
      },
    };
  },
};
