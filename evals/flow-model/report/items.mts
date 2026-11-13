import { render } from '../extract/render.mts';
import { functionNamed } from '../model/functions.mts';
import type { FlowModel, Loc, ModelNode } from '../model/syntax-types.mts';
import { nodesOf } from './canonical.mts';

export type SemanticItem = {
  readonly fn: string;
  readonly kind: string;
  readonly text: string;
  readonly loc: Loc | undefined;
};

type Classified = Omit<SemanticItem, 'fn'>;

const COUNTED_KINDS = new Set(['bind', 'set', 'eval', 'if', 'return', 'throw', 'try']);

function classify(node: ModelNode): Classified | undefined {
  switch (node.kind) {
    case 'if':
    case 'cond':
      return { kind: 'guard', text: render(node.test), loc: locOf(node.test) ?? node.loc };
    case 'call':
    case 'new':
      return { kind: 'effect', text: render(node), loc: node.loc };
    case 'set':
      return {
        kind: 'state',
        text: `${render(node.object)}.${node.field} = ${render(node.value)}`,
        loc: node.loc,
      };
    case 'return':
    case 'throw':
      return { kind: node.kind, text: render(node.value), loc: node.loc };
    case 'unsupported':
      return { kind: 'unsupported', text: node.syntax, loc: node.loc };
    default:
      return undefined;
  }
}

function locOf(node: ModelNode): Loc | undefined {
  return 'loc' in node ? node.loc : undefined;
}

export function semanticItems(model: FlowModel): SemanticItem[] {
  return Object.keys(model.functions)
    .sort()
    .flatMap((name) =>
      nodesOf(functionNamed(model, name).body).flatMap((node) => {
        const item = classify(node);
        return item === undefined ? [] : [{ fn: name, ...item }];
      }),
    );
}

export function statementCounts(model: FlowModel): { modeled: number; unsupported: number } {
  const statements = Object.values(model.functions).flatMap((fn) => nodesOf(fn.body));
  const modeled = statements.filter(
    (node) => COUNTED_KINDS.has(node.kind) && locOf(node) !== undefined,
  ).length;
  const unsupported = statements.filter((node) => node.kind === 'unsupported').length;
  return { modeled, unsupported };
}
