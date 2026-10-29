import { builtinRules } from 'eslint/use-at-your-own-risk';
import { variableNamed } from '../analysis/ancestry.mjs';
import { withReportFilter } from './report-filter.mjs';

const baseRule = builtinRules.get('require-atomic-updates');

const ANY_KEY = '*';
const TRANSPARENT = new Set([
  'TSNonNullExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'ChainExpression',
]);
const SKIPPED_KEYS = new Set(['parent', 'typeAnnotation', 'typeArguments', 'typeParameters']);

function unwrapped(node) {
  return TRANSPARENT.has(node.type) ? unwrapped(node.expression) : node;
}

function propertyKey(member) {
  if (!member.computed && member.property.type === 'Identifier') {
    return member.property.name;
  }
  return member.property.type === 'Literal' ? String(member.property.value) : ANY_KEY;
}

function chainOf(expression) {
  const keys = [];
  let node = unwrapped(expression);
  while (node.type === 'MemberExpression') {
    keys.unshift(propertyKey(node));
    node = unwrapped(node.object);
  }
  return node.type === 'Identifier' ? { root: node, keys } : undefined;
}

function overlaps(read, written) {
  const shared = Math.min(read.length, written.length);
  return read
    .slice(0, shared)
    .every((key, index) => key === written[index] || key === ANY_KEY || written[index] === ANY_KEY);
}

function patternKeys(identifier) {
  const keys = [];
  let node = identifier;
  while (node.parent !== undefined && node.parent.type !== 'VariableDeclarator') {
    const { parent } = node;
    if (parent.type === 'RestElement') {
      keys.length = 0;
    } else if (parent.type === 'Property' && parent.value === node) {
      keys.unshift(parent.computed ? ANY_KEY : (parent.key.name ?? String(parent.key.value)));
    } else if (parent.type === 'ArrayPattern') {
      keys.unshift(ANY_KEY);
    } else if (parent.type !== 'AssignmentPattern' && parent.type !== 'ObjectPattern') {
      return [];
    }
    node = parent;
  }
  return keys;
}

class ReadPaths {
  constructor(sourceCode, functionScope) {
    this.sourceCode = sourceCode;
    this.functionScope = functionScope;
    this.expanding = new Set();
  }

  localVariable(identifier) {
    const variable = variableNamed(this.sourceCode, identifier);
    const local =
      variable?.scope.variableScope === this.functionScope &&
      variable.defs.every(({ type }) => type === 'Variable');
    return local ? variable : undefined;
  }

  ofChain({ root, keys }) {
    const own = [root.name, ...keys];
    const variable = this.localVariable(root);
    if (variable === undefined || this.expanding.has(variable)) {
      return [own];
    }
    this.expanding.add(variable);
    const paths = variable.references
      .filter((reference) => reference.isWrite() && reference.writeExpr)
      .flatMap((reference) => this.ofWrite(reference, keys));
    this.expanding.delete(variable);
    return [own, ...paths];
  }

  ofWrite(reference, keys) {
    const source = chainOf(reference.writeExpr);
    const pattern = patternKeys(reference.identifier);
    if (source === undefined) {
      return this.of(reference.writeExpr);
    }
    return this.ofChain({ root: source.root, keys: [...source.keys, ...pattern, ...keys] });
  }

  of(node) {
    if (node === null || typeof node !== 'object') {
      return [];
    }
    if (Array.isArray(node)) {
      return node.flatMap((item) => this.of(item));
    }
    if (node.type === 'Property' && !node.computed) {
      return this.of(node.value);
    }
    const chain =
      node.type === 'Identifier' || node.type === 'MemberExpression' ? chainOf(node) : undefined;
    if (chain !== undefined) {
      return [...this.ofChain(chain), ...this.computedKeys(node)];
    }
    return Object.entries(node)
      .filter(
        ([key, value]) => !SKIPPED_KEYS.has(key) && value !== null && typeof value === 'object',
      )
      .flatMap(([, value]) => this.of(value));
  }

  computedKeys(node) {
    const target = unwrapped(node);
    if (target.type !== 'MemberExpression') {
      return [];
    }
    return [
      ...(target.computed ? this.of(target.property) : []),
      ...this.computedKeys(target.object),
    ];
  }
}

function readsWrittenLocation(assignment, sourceCode) {
  const written = chainOf(assignment.left);
  if (written === undefined) {
    return true;
  }
  const functionScope = sourceCode.getScope(assignment).variableScope;
  const target = [written.root.name, ...written.keys];
  return new ReadPaths(sourceCode, functionScope)
    .of(assignment.right)
    .some((path) => overlaps(path, target));
}

function keepsReport({ node }, context) {
  return (
    node?.type !== 'AssignmentExpression' ||
    node.operator !== '=' ||
    readsWrittenLocation(node, context.sourceCode)
  );
}

export const rule = withReportFilter(baseRule, keepsReport);
