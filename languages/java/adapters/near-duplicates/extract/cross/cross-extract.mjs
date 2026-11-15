import { withLineEndingOf } from '../../../../../../shared/fix/recipes/extract/text.mjs';
import { nameHoles } from '../../../../../../shared/fix/recipes/extract/names.mjs';
import { analysedPair, indentUnit, movedComments, shapedPlan } from '../java-extract.mjs';
import { nameCollisions } from '../syntax.mjs';
import { NO_SHAPE, bodyEdit, extrasFor, helperText } from '../render.mjs';
import { fieldInfo } from './fields.mjs';
import { nestedTypes } from './names/imports.mjs';
import { lockNodes, lockProblem, stateProblem, topLevelProblem } from './state.mjs';

const NESTED = 'a copy uses a type nested in its class, which the shared class cannot name';

function holeNodes(plan, side) {
  const key = side === 0 ? 'a' : 'b';
  return [...plan.holes, ...plan.typeHoles].flatMap(({ occurrences }) =>
    occurrences.map((occurrence) => occurrence[key]),
  );
}

function withLock(shape, { methods, plan }) {
  const nodes = lockNodes(methods[0]);
  if (nodes.length === 0) {
    return { shape, nodes: [[], []] };
  }
  const [{ name }] = nameHoles([{ stem: 'lock' }], plan.taken, ({ stem }) => stem);
  const base = shape === NO_SHAPE ? NO_SHAPE : shape;
  return {
    nodes: methods.map(lockNodes),
    shape: {
      ...base,
      rules: new Map([...base.rules, ...nodes.map((node) => [node.id, () => name])]),
      lead: [{ declaration: `Object ${name}`, argument: () => 'this' }, ...base.lead],
    },
  };
}

function problemOf(methods, plan, locks) {
  const own = methods.map((method, side) =>
    stateProblem(method, [...holeNodes(plan, side), ...locks[side]]),
  );
  const clash = methods.some((method) => {
    const words = nameCollisions(method);
    return [...nestedTypes(method.tree.rootNode)].some((type) => words.has(type));
  });
  return (
    methods.map(lockProblem).find(Boolean) ?? own.find(Boolean) ?? (clash ? NESTED : undefined)
  );
}

function bodyEdits({ request, plan, shape, names }) {
  const { methods, sources } = request;
  const extras = extrasFor({ holes: plan.holes, typeHoles: plan.typeHoles, shape });
  const moved = movedComments(methods);
  return methods.map((method, side) => {
    const { file, text } = sources[side];
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

function planned(request) {
  const { methods, sources } = request;
  const pair = {
    ...request,
    roots: sources.map(({ rootNode }) => rootNode),
    text: sources[0].text,
    cross: { fields: methods.map(fieldInfo) },
    methodsCheck: topLevelProblem,
  };
  const analysis = analysedPair(pair);
  return analysis.declined === undefined ? shapedPlan(pair, analysis.plan, '') : analysis;
}

export function crossExtraction(request) {
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
  request.claimed.add(name);
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
