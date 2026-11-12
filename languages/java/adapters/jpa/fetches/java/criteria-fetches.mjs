import { closingParen } from '../graph-texts.mjs';

const FROM_ROOT = /([\w$]+)\s*=\s*[\w$.]+\s*\.\s*from\s*\(\s*([\w$.]+)\s*\.\s*class\s*\)/gu;
const ROOT_DECLARED = /\bRoot\s*<\s*([\w$.]+)\s*>\s+([\w$]+)/gu;
const SPECIFICATION = /\bSpecification\s*<\s*([\w$.]+)\s*>/u;
const LAMBDA_ROOT = /\(\s*([\w$]+)\s*,\s*[\w$]+\s*,\s*[\w$]+\s*\)\s*->/gu;
const CHAIN_START = /(?:([\w$]+)\s*=\s*)?(?<![\w$.)\]])([\w$]+)(?=\s*\.\s*fetch\s*\()/gu;
const FETCH_STEP = /^\s*\.\s*fetch\s*\(\s*(?:"([\w$]+)"|[\w$.]+_\s*\.\s*([\w$]+))/u;

function simple(name) {
  return name.split('.').at(-1);
}

function criteriaRoots(body) {
  const roots = new Map([
    ...[...body.matchAll(ROOT_DECLARED)].map(([, entity, name]) => [name, simple(entity)]),
    ...[...body.matchAll(FROM_ROOT)].map(([, name, entity]) => [name, simple(entity)]),
  ]);
  const specified = SPECIFICATION.exec(body)?.[1];
  for (const [, root] of specified === undefined ? [] : body.matchAll(LAMBDA_ROOT)) {
    roots.set(root, simple(specified));
  }
  return roots;
}

function chainSteps(body, from) {
  const steps = [];
  const cursors = [from];
  for (const cursor of cursors) {
    const step = FETCH_STEP.exec(body.slice(cursor));
    if (step !== null) {
      steps.push(step[1] ?? step[2]);
      cursors.push(closingParen(body, body.indexOf('(', cursor + step.index)) + 1);
    }
  }
  return steps;
}

function stepInto(joined, relationOf) {
  return (owner, field) => {
    const relation = owner === undefined ? undefined : relationOf(owner.entity, field);
    if (relation === undefined) {
      return undefined;
    }
    const key = `${owner.key}.${field}`;
    joined.set(key, relation.many);
    return { entity: relation.target, key };
  };
}

export function criteriaFetches(body, relationOf) {
  const aliases = new Map(
    [...criteriaRoots(body)].map(([name, entity]) => [name, { entity, key: name }]),
  );
  const joined = new Map();
  const step = stepInto(joined, relationOf);
  for (const match of body.matchAll(CHAIN_START)) {
    const [, assigned, receiver] = match;
    const end = chainSteps(body, match.index + match[0].length).reduce(step, aliases.get(receiver));
    if (assigned !== undefined && end !== undefined) {
      aliases.set(assigned, end);
    }
  }
  const byRoot = Map.groupBy(joined, ([key]) => key.split('.')[0]);
  return [...byRoot.values()].map((entries) => new Map(entries));
}
