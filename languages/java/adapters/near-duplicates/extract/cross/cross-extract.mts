import type { Node } from 'web-tree-sitter';
import type {
  Attempt,
  CrossRequest,
  Extracted,
  Pair,
  PairRequest,
  Plan,
  Renderer,
  ReplaceEdit,
  Shape,
  ShapedPlan,
} from '../../extract-types.mts';
import { nameHoles, withLineEndingOf } from '../../jvm-views.mts';
import { analysedPair, indentUnit, movedComments, shapedPlan } from '../java-extract.mts';
import { nameCollisions, present } from '../syntax.mts';
import { NO_SHAPE, bodyEdit, extrasFor, helperText } from '../render.mts';
import { fieldInfo } from './fields.mts';
import { nestedTypes } from './names/imports.mts';
import { lockNodes, lockProblem, stateProblem, topLevelProblem } from './state.mts';

const NESTED = 'a copy uses a type nested in its class, which the shared class cannot name';

function holeNodes(plan: Plan, side: number): Node[] {
  const key = side === 0 ? 'a' : 'b';
  return [...plan.holes, ...plan.typeHoles].flatMap(({ occurrences }) =>
    occurrences.map((occurrence) => occurrence[key]),
  );
}

function withLock(
  shape: Shape,
  { methods, plan }: { methods: Pair; plan: Plan },
): { shape: Shape; nodes: Node[][] } {
  const nodes = lockNodes(methods[0]);
  if (nodes.length === 0) {
    return { shape, nodes: [[], []] };
  }
  const { name } = present(
    present(nameHoles([{ stem: 'lock' }], plan.taken, ({ stem }) => stem))[0],
  );
  const base = shape === NO_SHAPE ? NO_SHAPE : shape;
  return {
    nodes: methods.map(lockNodes),
    shape: {
      ...base,
      rules: new Map([
        ...base.rules,
        ...nodes.map((node): [number, Renderer] => [node.id, () => name]),
      ]),
      lead: [{ declaration: `Object ${name}`, argument: () => 'this' }, ...base.lead],
    },
  };
}

function problemOf(
  methods: readonly Node[],
  plan: Plan,
  locks: readonly (readonly Node[])[],
): string | undefined {
  const own = methods.map((method, side) =>
    stateProblem(method, [...holeNodes(plan, side), ...present(locks[side])]),
  );
  const clash = methods.some((method) => {
    const words = nameCollisions(method);
    return [...nestedTypes(method.tree.rootNode)].some((type) => words.has(type));
  });
  return (
    methods.map(lockProblem).find(Boolean) ?? own.find(Boolean) ?? (clash ? NESTED : undefined)
  );
}

function bodyEdits({
  request,
  plan,
  shape,
  names,
}: {
  request: CrossRequest;
  plan: Plan;
  shape: Shape;
  names: { className: string };
}): ReplaceEdit[] {
  const { methods, sources } = request;
  const extras = extrasFor({ holes: plan.holes, typeHoles: plan.typeHoles, shape });
  const moved = movedComments(methods);
  return methods.map((method, side) => {
    const { file, text } = present(sources[side]);
    const edit = bodyEdit({
      method,
      side,
      name: plan.name,
      text,
      extras,
      qualifier: `${names.className}.`,
      moved: side === 1 ? moved : [],
    });
    return { type: 'replace', path: file, ...edit, text: withLineEndingOf(text, edit.text) };
  });
}

function planned(request: CrossRequest): Attempt<{ plan: ShapedPlan }> {
  const { methods, sources } = request;
  const pair: PairRequest = {
    ...request,
    roots: sources.map(({ rootNode }) => rootNode),
    text: sources[0].text,
    cross: { fields: methods.map(fieldInfo) },
    methodsCheck: topLevelProblem,
  };
  const analysis = analysedPair(pair);
  return analysis.declined === undefined ? shapedPlan(pair, analysis.plan, '') : analysis;
}

function claim(claimed: Set<string>, name: string): void {
  claimed.add(name);
}

export function crossExtraction(request: CrossRequest): Attempt<Extracted> {
  const { methods, names } = request;
  const shaped = planned(request);
  if (shaped.declined !== undefined) {
    return shaped;
  }
  const { plan } = shaped;
  const { shape, nodes } = withLock(plan.shape, { methods, plan });
  const problem = problemOf(methods, plan, nodes);
  if (problem !== undefined) {
    return { declined: problem };
  }
  const { holes, typeHoles, name } = plan;
  claim(request.claimed, name);
  return {
    edits: bodyEdits({ request, plan, shape, names }),
    member: helperText({
      method: methods[0],
      holes,
      typeHoles,
      name,
      isStatic: true,
      visibility: '',
      shape,
      indent: indentUnit(methods[0], request.sources[0].text),
    }),
    interfaces: shape.interfaces,
  };
}
