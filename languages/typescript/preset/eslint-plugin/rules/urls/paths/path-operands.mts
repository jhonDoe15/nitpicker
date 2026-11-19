import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../../typed/node-views.mts';
import { ASSERTION_FORMS, unwrapOf } from '../../typed/syntax-views.mts';
import { CONSTANT_NAME } from '../construction/url-values.mts';
import { PATH_CALLS, PATH_OBJECTS } from './path-names.mts';

export type Operand = {
  readonly kind: 'path' | 'authority';
  readonly strong: boolean;
  readonly folded: boolean;
  readonly foreign: boolean;
  readonly name: string;
  readonly owner: TSESTree.Node | undefined;
};

type Kind = Operand['kind'];

const PATH_METHODS = new Set(['resolve', 'join', 'normalize', 'dirname']);
const FOLDING_METHODS = new Set(['toLowerCase', 'toLocaleLowerCase', 'toUpperCase']);
const FOLDING_NAME = /normali[sz]|canonical|fold|lower|equal|same/iu;
const STRONG_PATH_NAME =
  /(?:Dir|Directory|Root|Cwd|Folder|FilePath|Filepath|Filename)$|^(?:cwd|dir|dirname)$/u;
const WEAK_PATH_NAME = /path$/iu;
const AUTHORITY_NAME = /(?:authority|host|hostname)$/iu;
const STRONG_AUTHORITY_NAME = /authority$/iu;
const NOT_A_PATH_NAME = /^(?:rank|apps|libs|config)Dir$/u;
const NATIVE_OWNERS = new Set(['path', 'process', 'os', 'fs', 'posix', 'win32', 'URL']);

function operand(kind: Kind, strong: boolean, name = ''): Operand {
  return { kind, strong, folded: false, foreign: false, name, owner: undefined };
}

function pathCall(callee: TSESTree.Node): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return PATH_CALLS.has(callee.name);
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }
  const method = nameOf(callee.property) ?? '';
  const owner = nameOf(callee.object) ?? '';
  return (
    (PATH_METHODS.has(method) && PATH_OBJECTS.has(owner)) ||
    PATH_CALLS.has(method) ||
    (method === 'cwd' && owner === 'process')
  );
}

function foldingCall(callee: TSESTree.Node): boolean {
  if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed) {
    const method = nameOf(callee.property) ?? '';
    return (
      FOLDING_METHODS.has(method) ||
      (FOLDING_NAME.test(method) && !PATH_OBJECTS.has(nameOf(callee.object) ?? ''))
    );
  }
  return callee.type === AST_NODE_TYPES.Identifier && FOLDING_NAME.test(callee.name);
}

function byName(name: string): Operand | undefined {
  if (CONSTANT_NAME.test(name) || NOT_A_PATH_NAME.test(name)) {
    return undefined;
  }
  if (name === '__dirname' || name === '__filename' || STRONG_PATH_NAME.test(name)) {
    return operand('path', true, name);
  }
  if (AUTHORITY_NAME.test(name)) {
    return operand('authority', STRONG_AUTHORITY_NAME.test(name), name);
  }
  return WEAK_PATH_NAME.test(name) ? operand('path', false, name) : undefined;
}

function isForeignOwner(owner: TSESTree.Node): boolean {
  return (
    owner.type !== AST_NODE_TYPES.ThisExpression &&
    owner.type !== AST_NODE_TYPES.MetaProperty &&
    !(owner.type === AST_NODE_TYPES.Identifier && NATIVE_OWNERS.has(owner.name))
  );
}

function byMember(node: TSESTree.MemberExpression): Operand | undefined {
  const found = byProperty(node);
  return found === undefined
    ? undefined
    : { ...found, foreign: isForeignOwner(node.object), owner: node.object };
}

function byProperty(node: TSESTree.MemberExpression): Operand | undefined {
  const name = node.computed ? '' : (nameOf(node.property) ?? '');
  if (node.object.type === AST_NODE_TYPES.MetaProperty) {
    return ['dirname', 'filename'].includes(name) ? operand('path', true, name) : undefined;
  }
  return name === 'fsPath' ? operand('path', true, name) : byName(name);
}

type Step = { readonly operand: Operand | undefined } | { readonly next: TSESTree.Node };

function templateStep(value: TSESTree.TemplateLiteral): Step {
  const [first] = value.expressions;
  return value.quasis[0]?.value.raw === '' && first !== undefined
    ? { next: first }
    : { operand: undefined };
}

function callStep(value: TSESTree.CallExpression): Step {
  if (foldingCall(value.callee)) {
    return { operand: { ...operand('path', false), folded: true } };
  }
  return { operand: pathCall(value.callee) ? operand('path', true) : undefined };
}

function operandStep(value: TSESTree.Node): Step {
  if (value.type === AST_NODE_TYPES.ChainExpression) {
    return { next: value.expression };
  }
  if (value.type === AST_NODE_TYPES.Identifier) {
    return { operand: byName(value.name) };
  }
  if (value.type === AST_NODE_TYPES.MemberExpression) {
    return { operand: byMember(value) };
  }
  if (value.type === AST_NODE_TYPES.BinaryExpression) {
    return value.operator === '+' ? { next: value.left } : { operand: undefined };
  }
  if (value.type === AST_NODE_TYPES.TemplateLiteral) {
    return templateStep(value);
  }
  return value.type === AST_NODE_TYPES.CallExpression ? callStep(value) : { operand: undefined };
}

export function operandOf(node: TSESTree.Node): Operand | undefined {
  const pending: TSESTree.Node[] = [node];
  for (const current of pending) {
    const step = operandStep(unwrapOf(current, ASSERTION_FORMS));
    if ('next' in step) {
      pending.push(step.next);
    } else {
      return step.operand;
    }
  }
  return undefined;
}
