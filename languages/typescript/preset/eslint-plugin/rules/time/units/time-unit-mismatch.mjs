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
    const { sourceCode } = context;

    function text(node) {
      const raw = sourceCode.getText(node).replaceAll(/\s+/gu, ' ');
      return raw.length > MAX_TEXT ? `${raw.slice(0, MAX_TEXT - 3)}...` : raw;
    }

    function unitData(from, to, value) {
      return {
        factor: String(unitFactor(from, to)),
        example: conversionExample(value, from, to),
      };
    }

    function reportTarget(node, target, targetUnit, value, messageId, extra = {}) {
      const found = valueUnit(context, value);
      if (targetUnit === undefined || found === undefined || found.unit === targetUnit) {
        return;
      }
      context.report({
        node,
        messageId,
        data: {
          target,
          targetUnit: unitLabel(targetUnit),
          value: text(value),
          valueUnit: unitLabel(found.unit),
          ...unitData(found.unit, targetUnit, text(value)),
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

    function checkNamed(node, name, value) {
      if (name !== undefined && value !== null && value !== undefined) {
        reportTarget(node, name, unitOfName(name), value, 'assignedUnit');
      }
    }

    function checkPattern(property) {
      const local =
        property.value.type === 'AssignmentPattern' ? property.value.left : property.value;
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

    function checkCall(node) {
      const callee = calleeText(node.callee) ?? text(node.callee);
      for (const { index, unit, name } of parameterUnits(context, node)) {
        const argument = node.arguments[index];
        if (argument !== undefined && argument.type !== 'SpreadElement') {
          reportTarget(argument, '', unit, argument, 'argumentUnit', { callee, parameter: name });
        }
      }
    }

    function checkNarrowing(node, value, operator) {
      if (valueUnit(context, value)?.epoch === true) {
        context.report({
          node,
          messageId: 'epochNarrowed',
          data: { value: text(value), operator },
        });
      }
    }

    return {
      BinaryExpression(node) {
        if (isNarrowing(context, node)) {
          checkNarrowing(node, node.left, `${node.operator} 0`);
          return;
        }
        if (!MIXING.has(node.operator)) {
          return;
        }
        const left = valueUnit(context, node.left);
        const right = valueUnit(context, node.right);
        if (mismatch(left, right)) {
          context.report({
            node,
            messageId: 'mixedUnits',
            data: {
              left: text(node.left),
              leftUnit: unitLabel(left.unit),
              right: text(node.right),
              rightUnit: unitLabel(right.unit),
              ...unitData(right.unit, left.unit, text(node.right)),
            },
          });
        }
      },
      UnaryExpression(node) {
        const inner = unwrap(node.argument);
        if (node.operator === '~' && inner.type === 'UnaryExpression' && inner.operator === '~') {
          checkNarrowing(node, inner.argument, '~~');
        }
      },
      AssignmentExpression(node) {
        if (ASSIGNING.has(node.operator)) {
          checkNamed(node, targetName(node.left), node.right);
        }
      },
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier') {
          checkNamed(node, node.id.name, node.init);
        }
      },
      AssignmentPattern(node) {
        if (node.left.type === 'Identifier' && node.parent.type !== 'Property') {
          checkNamed(node, node.left.name, node.right);
        }
      },
      Property(node) {
        if (node.parent.type === 'ObjectPattern') {
          checkPattern(node);
        } else if (node.kind === 'init' && !node.shorthand && !node.method) {
          checkNamed(node, keyName(node), node.value);
        }
      },
      PropertyDefinition(node) {
        checkNamed(node, keyName(node), node.value);
      },
      CallExpression: checkCall,
      NewExpression: checkCall,
    };
  },
};
