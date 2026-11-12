import { ancestorsOf, chainOf } from '../analysis/ancestry.mjs';
import { stringValue } from '../analysis/constant-resolution.mjs';
import {
  compositionRootOptionsSchema,
  isCompositionRootFile,
} from '../boundaries/composition-root-files.mjs';
import { bare, destructuredKey, envSubject, isEnvObject } from './env-reads.mjs';

const EQUALITY = new Set(['===', '!==', '==', '!=']);
const LOGICAL = new Set(['&&', '||']);
const OWN_CHECKS = new Set(['hasOwn', 'hasOwnProperty']);
const TRIMS = new Set(['trim', 'trimStart', 'trimEnd']);

function isAbsent(node) {
  const plain = bare(node);
  return (
    (plain.type === 'Identifier' && plain.name === 'undefined') ||
    (plain.type === 'Literal' && plain.value === null && plain.regex === undefined) ||
    (plain.type === 'UnaryExpression' && plain.operator === 'void')
  );
}

function typeofSubject(context, node) {
  const plain = bare(node);
  return plain.type === 'UnaryExpression' && plain.operator === 'typeof'
    ? envSubject(context, plain.argument)
    : undefined;
}

function comparedSubject(context, node) {
  const sides = [node.left, node.right];
  const absent = sides.find((side) => isAbsent(side));
  const other = sides.find((side) => side !== absent);
  if (absent !== undefined && other !== undefined) {
    return envSubject(context, other);
  }
  const typeofSide = sides.find((side) => typeofSubject(context, side) !== undefined);
  const text = sides.find((side) => side !== typeofSide);
  return typeofSide !== undefined && stringValue(text) === 'undefined'
    ? typeofSubject(context, typeofSide)
    : undefined;
}

function ownCheckSubject(context, node) {
  const { callee } = node;
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    !OWN_CHECKS.has(callee.property.name)
  ) {
    return undefined;
  }
  const [first, second] = node.arguments;
  if (isEnvObject(context, callee.object) && callee.property.name === 'hasOwnProperty') {
    return stringValue(first);
  }
  return first !== undefined && isEnvObject(context, first) ? stringValue(second) : undefined;
}

function joinsConditions(node) {
  return (
    (node.type === 'LogicalExpression' && LOGICAL.has(node.operator)) ||
    (node.type === 'UnaryExpression' && node.operator === '!')
  );
}

function conditionRoot(node) {
  return [node, ...ancestorsOf(node)].find((current) => !joinsConditions(current.parent));
}

function leavesOf(root) {
  const pending = [root];
  const leaves = [];
  for (const current of pending) {
    if (current.type === 'LogicalExpression' && LOGICAL.has(current.operator)) {
      pending.push(current.left, current.right);
    } else if (current.type === 'UnaryExpression' && current.operator === '!') {
      pending.push(current.argument);
    } else {
      leaves.push(current);
    }
  }
  return leaves;
}

function trimmedValue(node) {
  const plain = bare(node);
  const { callee } = plain;
  return plain.type === 'CallExpression' &&
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    TRIMS.has(callee.property.name)
    ? callee.object
    : undefined;
}

function untrimmed(node) {
  return bare(chainOf(node, trimmedValue).at(-1));
}

function measuredSubject(context, node) {
  return envSubject(context, untrimmed(node));
}

function lengthSubject(context, node) {
  const plain = bare(node);
  return plain.type === 'MemberExpression' && !plain.computed && plain.property.name === 'length'
    ? measuredSubject(context, plain.object)
    : undefined;
}

function comparisonSubject(context, node) {
  const sides = [node.left, node.right];
  const empty = sides.find((side) => stringValue(side) === '');
  if (empty !== undefined) {
    return measuredSubject(
      context,
      sides.find((side) => side !== empty),
    );
  }
  return sides.map((side) => lengthSubject(context, side)).find((name) => name !== undefined);
}

function emptinessSubject(context, leaf) {
  const plain = bare(leaf);
  if (plain.type === 'CallExpression' && plain.callee.type === 'Identifier') {
    return plain.callee.name === 'Boolean' ? envSubject(context, plain.arguments[0]) : undefined;
  }
  const receiver =
    plain.type === 'CallExpression' && plain.callee.type === 'MemberExpression'
      ? measuredSubject(context, plain.callee.object)
      : undefined;
  if (receiver !== undefined) {
    return receiver;
  }
  if (plain.type === 'BinaryExpression') {
    return comparisonSubject(context, plain);
  }
  return lengthSubject(context, plain) ?? envSubject(context, plain);
}

function testsEmptiness(context, node, subject) {
  return leavesOf(conditionRoot(node)).some(
    (leaf) => leaf !== node && emptinessSubject(context, leaf) === subject,
  );
}

function isHarmlessFallback(node) {
  return stringValue(node) === '' || isAbsent(node);
}

function defaultedKeys(context, node) {
  if (node.id.type !== 'ObjectPattern' || node.init === null || !isEnvObject(context, node.init)) {
    return [];
  }
  return node.id.properties.filter(
    (property) =>
      property.type === 'Property' &&
      property.value.type === 'AssignmentPattern' &&
      !isHarmlessFallback(property.value.right),
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report environment variables tested only for undefined, which counts an empty value as set',
    },
    schema: compositionRootOptionsSchema,
    messages: {
      undefinedOnly:
        "Test `{{name}}` for a value, not only for `undefined`: `{{name}}=` gives `''`, which passes this check, so the feature turns on with nothing to use. Write `if (!process.env.{{name}})`, add an `=== ''` test to the same condition, or parse the environment with a schema that rejects empty strings (`z.string().min(1)`). An exception fits only when an empty value is a real setting here.",
      nullishFallback:
        "Write `process.env.{{name}} || fallback`: `{{name}}=` gives `''`, which `??` and a destructuring default keep, so the fallback is skipped. A schema that rejects empty strings (`z.string().min(1)`) works too. An exception fits only when an empty value is a real setting here.",
    },
  },
  create(context) {
    function report(node, name, messageId = 'undefinedOnly') {
      if (
        name !== undefined &&
        (messageId !== 'undefinedOnly' || !testsEmptiness(context, node, name))
      ) {
        context.report({ node, messageId, data: { name } });
      }
    }
    return {
      BinaryExpression(node) {
        if (EQUALITY.has(node.operator)) {
          report(node, comparedSubject(context, node));
        } else if (node.operator === 'in' && isEnvObject(context, node.right)) {
          report(node, stringValue(node.left));
        }
      },
      CallExpression(node) {
        report(node, ownCheckSubject(context, node));
      },
      'LogicalExpression[operator="??"], AssignmentExpression[operator="??="]'(node) {
        if (!(isHarmlessFallback(node.right) || isCompositionRootFile(context))) {
          report(node, envSubject(context, node.left), 'nullishFallback');
        }
      },
      VariableDeclarator(node) {
        if (!isCompositionRootFile(context)) {
          for (const property of defaultedKeys(context, node)) {
            report(property, destructuredKey(property), 'nullishFallback');
          }
        }
      },
    };
  },
};
