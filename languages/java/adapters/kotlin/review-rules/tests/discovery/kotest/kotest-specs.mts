import { slotOf } from '../../typed/indexing.mts';
import type {
  ClassInfo,
  KotestView,
  RawNode,
  Registration,
  Span,
  SpecNode,
  TestScanned,
  VisitItem,
} from '../../typed/discovery-types.mts';
import { closeOf, marksFrom } from '../text-scan.mts';
import { linkedRanges } from './kotest-links.mts';
import { levelsOf, registrationsIn, viewOf } from './kotest-registrations.mts';
import { appendAll } from '../../../../../../../../shared/lists/lists.mts';

export { hasNestedRegistration } from './kotest-registrations.mts';

const INIT_BLOCK = /(?<![\w.`])init\s*(?=\{)/gu;
const MAX_RANGES = 100_000;

export function isSpecType(name: string): boolean {
  return name.endsWith('Spec') && name !== 'AnnotationSpec';
}

function nodeOf(view: KotestView, found: Registration, parent: RawNode | undefined): RawNode {
  const name = view.literalTexts.get(found.literal) ?? found.callee;
  return {
    callee: found.callee,
    prefix: found.prefix,
    name,
    configs: found.configs,
    offset: found.offset,
    body: found.body,
    dynamic: found.dynamic,
    parent,
    ancestors: parent === undefined ? [] : [...parent.ancestors, parent.offset],
    path: [...(parent?.path ?? []), name],
  };
}

function visit(view: KotestView, item: VisitItem): { nodes: RawNode[]; next: VisitItem[] } {
  const found = registrationsIn(view, item);
  const { accepts } = levelsOf(view, item);
  const nodes = found.map((entry) => nodeOf(view, entry, item.parent));
  const linked = linkedRanges(view, item, accepts)
    .filter(({ start }) => !item.chain.includes(start))
    .map(({ start, end }) => ({
      start,
      end,
      parent: item.parent,
      chain: [...item.chain, start],
    }));
  const children = nodes.map((node) => ({
    start: node.body.start,
    end: node.body.end,
    parent: node,
    chain: item.chain,
  }));
  return { nodes, next: [...linked, ...children] };
}

export function specNodes(scanned: TestScanned, ranges: Span[]): SpecNode[] {
  const view = viewOf(scanned);
  const nodes: RawNode[] = [];
  const pending: VisitItem[] = ranges.map(({ start, end }) => ({
    start,
    end,
    parent: undefined,
    chain: [start],
  }));
  for (const item of pending) {
    if (pending.length > MAX_RANGES) {
      break;
    }
    const visited = visit(view, item);
    appendAll(nodes, visited.nodes);
    appendAll(pending, visited.next);
  }
  const parents = new Set(nodes.map(({ parent }) => parent));
  return nodes
    .toSorted((left, right) => left.offset - right.offset)
    .map((node) => ({ ...node, leaf: !parents.has(node) }));
}

function constructorLambda({ scanned, braces, parens }: KotestView, call: number): Span[] {
  const { code } = scanned;
  const close = closeOf(scanned, call);
  const open = [...code.slice(call + 1, close).matchAll(/\{/gu)]
    .map((match) => call + 1 + match.index)
    .find((index) => braces[index] === braces[call + 1] && parens[index] === parens[call + 1]);
  return open === undefined ? [] : [{ start: open + 1, end: closeOf(scanned, open) }];
}

export function specBodies(scanned: TestScanned, klass: ClassInfo): Span[] {
  const { code } = scanned;
  const view = viewOf(scanned);
  const lambdas = klass.supers
    .filter(({ name, callOpen }) => isSpecType(name) && callOpen >= 0)
    .flatMap(({ callOpen }) => constructorLambda(view, callOpen));
  const inits =
    klass.bodyOpen < 0
      ? []
      : [...marksFrom(code, INIT_BLOCK, klass.bodyOpen)]
          .filter(({ index }) => index < klass.bodyClose)
          .map((match) => match.index + match[0].length)
          .filter((open) => slotOf(view.braces, open) === slotOf(view.braces, klass.bodyOpen) + 1)
          .map((open) => ({ start: open + 1, end: closeOf(scanned, open) }));
  return [...lambdas, ...inits];
}
