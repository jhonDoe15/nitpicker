import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../../analysis/constant-resolution.mts';
import { parameterUnits } from './unit-parameters.mts';
import {
  conversionExample,
  eslintUnitMessage,
  unitFactor,
  unitLabel,
  unitOfName,
  type Unit,
} from './unit-views.mts';
import { calleeText, propertyName, unwrap } from './unit-nodes.mts';
import { isNarrowing, mismatch, valueUnit, type UnitValue } from './unit-values.mts';

type MessageId = 'mixedUnits' | 'assignedUnit' | 'argumentUnit' | 'epochNarrowed';
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;
type CallLike = TSESTree.CallExpression | TSESTree.NewExpression;
type Target = {
  readonly node: TSESTree.Node;
  readonly target: string;
  readonly targetUnit: Unit | undefined;
  readonly value: TSESTree.Node;
  readonly messageId: MessageId;
  readonly extra?: Readonly<Record<string, string>>;
};

const MIXING = new Set(['+', '-', '<', '<=', '>', '>=', '==', '!=', '===', '!==']);
const ASSIGNING = new Set(['=', '+=', '-=']);
const MAX_TEXT = 40;
const ELLIPSIS = '...';
const COARSE_UNITS = new Set(['s', 'min']);

function text(context: SourceContext, node: TSESTree.Node): string {
  const raw = context.sourceCode.getText(node).replaceAll(/\s+/gu, ' ');
  return raw.length > MAX_TEXT ? `${raw.slice(0, MAX_TEXT - ELLIPSIS.length)}${ELLIPSIS}` : raw;
}

function unitData(from: Unit, to: Unit, value: string): { factor: string; example: string } {
  return {
    factor: String(unitFactor(from, to)),
    example: conversionExample(value, from, to),
  };
}

function reportTarget(
  context: Context,
  { node, target, targetUnit, value, messageId, extra = {} }: Target,
): void {
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

function targetName(node: TSESTree.Node): string | undefined {
  const target = unwrap(node);
  return target.type === AST_NODE_TYPES.Identifier ? target.name : propertyName(target);
}

function keyName(property: TSESTree.Property | TSESTree.PropertyDefinition): string | undefined {
  if (property.computed) {
    return undefined;
  }
  if (property.key.type === AST_NODE_TYPES.Identifier) {
    return property.key.name;
  }
  return property.key.type === AST_NODE_TYPES.Literal && typeof property.key.value === 'string'
    ? property.key.value
    : undefined;
}

function checkNamed(
  context: Context,
  node: TSESTree.Node,
  { name, value }: { name: string | undefined; value: TSESTree.Node | undefined },
): void {
  if (name !== undefined && value !== undefined) {
    reportTarget(context, {
      node,
      target: name,
      targetUnit: unitOfName(name),
      value,
      messageId: 'assignedUnit',
    });
  }
}

function checkPattern(context: Context, property: TSESTree.Property): void {
  const local =
    property.value.type === AST_NODE_TYPES.AssignmentPattern ? property.value.left : property.value;
  const key = keyName(property);
  const localUnit = local.type === AST_NODE_TYPES.Identifier ? unitOfName(local.name) : undefined;
  const keyUnit = key === undefined ? undefined : unitOfName(key);
  if (
    local.type === AST_NODE_TYPES.Identifier &&
    key !== undefined &&
    localUnit !== undefined &&
    keyUnit !== undefined &&
    localUnit !== keyUnit
  ) {
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

function checkCall(context: Context, node: CallLike): void {
  const callee = calleeText(node.callee) ?? text(context, node.callee);
  for (const { index, unit, name } of parameterUnits(context, node)) {
    const argument = node.arguments[index];
    if (argument !== undefined && argument.type !== AST_NODE_TYPES.SpreadElement) {
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

function fitsUnsigned(found: UnitValue, operator: string): boolean {
  return operator === '>>> 0' && COARSE_UNITS.has(found.unit);
}

function checkNarrowing(
  context: Context,
  node: TSESTree.Node,
  { value, operator }: { value: TSESTree.Node; operator: string },
): void {
  const found = valueUnit(context, value);
  if (found?.epoch === true && !fitsUnsigned(found, operator)) {
    context.report({
      node,
      messageId: 'epochNarrowed',
      data: { value: text(context, value), operator },
    });
  }
}

function checkBinary(context: Context, node: TSESTree.BinaryExpression): void {
  if (isNarrowing(context, node)) {
    checkNarrowing(context, node, { value: node.left, operator: `${node.operator} 0` });
    return;
  }
  if (!MIXING.has(node.operator)) {
    return;
  }
  const left = valueUnit(context, node.left);
  const right = valueUnit(context, node.right);
  if (left !== undefined && right !== undefined && mismatch(left, right)) {
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

function checkUnary(context: Context, node: TSESTree.UnaryExpression): void {
  const inner = unwrap(node.argument);
  if (
    node.operator === '~' &&
    inner.type === AST_NODE_TYPES.UnaryExpression &&
    inner.operator === '~'
  ) {
    checkNarrowing(context, node, { value: inner.argument, operator: '~~' });
  }
}

function checkProperty(context: Context, node: TSESTree.Property): void {
  if (node.parent.type === AST_NODE_TYPES.ObjectPattern) {
    checkPattern(context, node);
  } else if (node.kind === 'init' && !node.shorthand && !node.method) {
    checkNamed(context, node, { name: keyName(node), value: node.value });
  }
}

export const rule: TSESLint.RuleModule<MessageId> = {
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
        if (node.id.type === AST_NODE_TYPES.Identifier) {
          checkNamed(context, node, { name: node.id.name, value: node.init ?? undefined });
        }
      },
      AssignmentPattern(node) {
        if (
          node.left.type === AST_NODE_TYPES.Identifier &&
          node.parent.type !== AST_NODE_TYPES.Property
        ) {
          checkNamed(context, node, { name: node.left.name, value: node.right });
        }
      },
      Property(node) {
        checkProperty(context, node);
      },
      PropertyDefinition(node) {
        checkNamed(context, node, { name: keyName(node), value: node.value ?? undefined });
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
