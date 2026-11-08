import {
  conversionExample,
  unitFactor,
  unitLabel,
  unitOfName,
} from '../../../../../../../shared/naming/time-units/unit-names.mjs';
import { eslintUnitMessage } from '../../../../../../../shared/naming/time-units/unit-messages.mjs';
import { parameterUnits } from './unit-parameters.mjs';
import {
  calleeText,
  isNarrowing,
  mismatch,
  propertyName,
  unwrap,
  valueUnit,
} from './unit-values.mjs';

const MIXING = new Set(['+', '-', '<', '<=', '>', '>=', '==', '!=', '===', '!==']);
const ASSIGNING = new Set(['=', '+=', '-=']);
const MAX_TEXT = 40;
const ELLIPSIS = '...';
const COARSE_UNITS = new Set(['s', 'min']);

function text(context, node) {
  const raw = context.sourceCode.getText(node).replaceAll(/\s+/gu, ' ');
  return raw.length > MAX_TEXT ? `${raw.slice(0, MAX_TEXT - ELLIPSIS.length)}${ELLIPSIS}` : raw;
}

function unitData(from, to, value) {
  return {
    factor: String(unitFactor(from, to)),
    example: conversionExample(value, from, to),
  };
}

function reportTarget(context, { node, target, targetUnit, value, messageId, extra = {} }) {
  const found = valueUnit(context, value);
  if (targetUnit === undefined || found === undefined || found.unit === targetUnit) {
    return;
  }
  const valueText = text(context, value);
  context.report({
    node,
    messageId,
    data: {
      target,
      targetUnit: unitLabel(targetUnit),
      value: valueText,
      valueUnit: unitLabel(found.unit),
      ...unitData(found.unit, targetUnit, valueText),
      ...extra,
    },
  });
}

function targetName(node) {
  const target = unwrap(node);
  return target?.type === 'Identifier' ? target.name : propertyName(target);
}

function keyName(property) {
  if (property.computed) {
    return undefined;
  }
  if (property.key.type === 'Identifier') {
    return property.key.name;
  }
  return typeof property.key.value === 'string' ? property.key.value : undefined;
}

function checkNamed(context, node, { name, value }) {
  if (name !== undefined && value !== null && value !== undefined) {
    reportTarget(context, {
      node,
      target: name,
      targetUnit: unitOfName(name),
      value,
      messageId: 'assignedUnit',
    });
  }
}

function checkPattern(context, property) {
  const local = property.value.type === 'AssignmentPattern' ? property.value.left : property.value;
  const key = keyName(property);
  const localUnit = local.type === 'Identifier' ? unitOfName(local.name) : undefined;
  const keyUnit = key === undefined ? undefined : unitOfName(key);
  if (localUnit !== undefined && keyUnit !== undefined && localUnit !== keyUnit) {
    context.report({
      node: property,
      messageId: 'assignedUnit',
      data: {
        target: local.name,
        targetUnit: unitLabel(localUnit),
        value: key,
        valueUnit: unitLabel(keyUnit),
        ...unitData(keyUnit, localUnit, key),
      },
    });
  }
}

function checkCall(context, node) {
  const callee = calleeText(node.callee) ?? text(context, node.callee);
  for (const { index, unit, name } of parameterUnits(context, node)) {
    const argument = node.arguments[index];
    if (argument !== undefined && argument.type !== 'SpreadElement') {
      reportTarget(context, {
        node: argument,
        target: '',
        targetUnit: unit,
        value: argument,
        messageId: 'argumentUnit',
        extra: { callee, parameter: name },
      });
    }
  }
}

function fitsUnsigned(found, operator) {
  return operator === '>>> 0' && COARSE_UNITS.has(found.unit);
}

function checkNarrowing(context, node, { value, operator }) {
  const found = valueUnit(context, value);
  if (found?.epoch === true && !fitsUnsigned(found, operator)) {
    context.report({
      node,
      messageId: 'epochNarrowed',
      data: { value: text(context, value), operator },
    });
  }
}

function checkBinary(context, node) {
  if (isNarrowing(context, node)) {
    checkNarrowing(context, node, { value: node.left, operator: `${node.operator} 0` });
    return;
  }
  if (!MIXING.has(node.operator)) {
    return;
  }
  const left = valueUnit(context, node.left);
  const right = valueUnit(context, node.right);
  if (mismatch(left, right)) {
    const rightText = text(context, node.right);
    context.report({
      node,
      messageId: 'mixedUnits',
      data: {
        left: text(context, node.left),
        leftUnit: unitLabel(left.unit),
        right: rightText,
        rightUnit: unitLabel(right.unit),
        ...unitData(right.unit, left.unit, rightText),
      },
    });
  }
}

function checkUnary(context, node) {
  const inner = unwrap(node.argument);
  if (node.operator === '~' && inner.type === 'UnaryExpression' && inner.operator === '~') {
    checkNarrowing(context, node, { value: inner.argument, operator: '~~' });
  }
}

function checkProperty(context, node) {
  if (node.parent.type === 'ObjectPattern') {
    checkPattern(context, node);
  } else if (node.kind === 'init' && !node.shorthand && !node.method) {
    checkNamed(context, node, { name: keyName(node), value: node.value });
  }
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow time values in different units mixed without a conversion, and epoch times cut to 32 bits',
    },
    schema: [],
    messages: {
      mixedUnits: eslintUnitMessage('mixed'),
      assignedUnit: eslintUnitMessage('assigned'),
      argumentUnit: eslintUnitMessage('argument'),
      epochNarrowed: eslintUnitMessage('narrowed', {
        keep: 'Keep the full number: `Math.trunc({{ value }})`.',
      }),
    },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        checkBinary(context, node);
      },
      UnaryExpression(node) {
        checkUnary(context, node);
      },
      AssignmentExpression(node) {
        if (ASSIGNING.has(node.operator)) {
          checkNamed(context, node, { name: targetName(node.left), value: node.right });
        }
      },
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier') {
          checkNamed(context, node, { name: node.id.name, value: node.init });
        }
      },
      AssignmentPattern(node) {
        if (node.left.type === 'Identifier' && node.parent.type !== 'Property') {
          checkNamed(context, node, { name: node.left.name, value: node.right });
        }
      },
      Property(node) {
        checkProperty(context, node);
      },
      PropertyDefinition(node) {
        checkNamed(context, node, { name: keyName(node), value: node.value });
      },
      CallExpression(node) {
        checkCall(context, node);
      },
      NewExpression(node) {
        checkCall(context, node);
      },
    };
  },
};
