import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { ancestorsOf } from '../../rules/typed/node-views.mts';
import { freeName } from '../edits/names.mts';
import { allOf, type FixPlans } from '../edits/plans.mts';
import { hasCommentIn, replacing } from '../support/ranges.mts';
import { insertingAtModuleTop } from './hoist-point.mts';
import { literalValue } from './literal-values.mts';
import { intlOnlyConstructed, usesOf } from './hoist-uses.mts';

type Call = TSESTree.NewExpression | TSESTree.CallExpression;

export type Hoist = { readonly name: string; readonly plan: FixPlans };

const NAMES: Readonly<Record<string, string>> = {
  Collator: 'COLLATOR',
  DisplayNames: 'DISPLAY_NAMES',
  ListFormat: 'LIST_FORMAT',
  NumberFormat: 'NUMBER_FORMAT',
  PluralRules: 'PLURAL_RULES',
  RelativeTimeFormat: 'RELATIVE_TIME_FORMAT',
  Segmenter: 'SEGMENTER',
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLocale(value: unknown): boolean {
  const text = (item: unknown) => typeof item === 'string' && item !== '';
  return text(value) || (Array.isArray(value) && value.length > 0 && value.every(text));
}

function constructs(type: string, call: Call, values: readonly unknown[]): boolean {
  const target: unknown = Reflect.get(Intl, type);
  if (typeof target !== 'function') {
    return false;
  }
  try {
    if (call.type === AST_NODE_TYPES.NewExpression) {
      Reflect.construct(target, values);
    } else {
      Reflect.apply(target, undefined, values);
    }
    return true;
  } catch {
    return false;
  }
}

function validArguments(type: string, call: Call): boolean {
  const { arguments: nodes } = call;
  if (nodes.length === 0 || nodes.length > 2) {
    return false;
  }
  const found = nodes.map((node) => literalValue(node));
  const values = found.map((item) => item?.value);
  const [locale, options] = values;
  return (
    found.every((item) => item !== undefined) &&
    isLocale(locale) &&
    (options === undefined || isObject(options)) &&
    constructs(type, call, values)
  );
}

function insideTry(call: Call): boolean {
  const path = ancestorsOf(call);
  const boundary = path.findIndex(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.FunctionDeclaration ||
      ancestor.type === AST_NODE_TYPES.FunctionExpression ||
      ancestor.type === AST_NODE_TYPES.ArrowFunctionExpression,
  );
  return path
    .slice(0, boundary === -1 ? path.length : boundary)
    .some((ancestor) => ancestor.type === AST_NODE_TYPES.TryStatement);
}

function formatterType(call: Call): string | undefined {
  const { callee } = call;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    Object.hasOwn(NAMES, callee.property.name)
    ? callee.property.name
    : undefined;
}

const MODULE_MARKERS = new Set<string>([
  AST_NODE_TYPES.ImportDeclaration,
  AST_NODE_TYPES.ExportNamedDeclaration,
  AST_NODE_TYPES.ExportDefaultDeclaration,
  AST_NODE_TYPES.ExportAllDeclaration,
  AST_NODE_TYPES.TSExportAssignment,
]);

function isModuleFile(program: TSESTree.Program): boolean {
  return (
    program.sourceType === 'module' &&
    program.body.some((statement) => MODULE_MARKERS.has(statement.type))
  );
}

export function hoistFormatterFix(sourceCode: SourceCode, call: Call): Hoist | undefined {
  const type = formatterType(call);
  const base = type === undefined ? undefined : NAMES[type];
  const program = sourceCode.ast;
  if (
    type === undefined ||
    base === undefined ||
    !isModuleFile(program) ||
    hasCommentIn(sourceCode, call.range) ||
    insideTry(call) ||
    !validArguments(type, call) ||
    !intlOnlyConstructed(sourceCode)
  ) {
    return undefined;
  }
  const uses = usesOf(sourceCode, call);
  const name =
    uses === undefined
      ? undefined
      : freeName(sourceCode, { sites: [call, ...uses.sites], within: program, base });
  if (uses === undefined || name === undefined) {
    return undefined;
  }
  const top = insertingAtModuleTop(
    sourceCode,
    program,
    `const ${name} = ${sourceCode.getText(call)};`,
  );
  const plan = allOf([
    top,
    ...uses.sites.map((site) => replacing(site.range, name)),
    ...(uses.removal === undefined ? [] : [uses.removal]),
  ]);
  return plan === undefined ? undefined : { name, plan };
}
