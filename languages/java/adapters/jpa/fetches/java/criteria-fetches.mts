import type { FetchOwner, Joined, RelationOf } from '../fetch-types.mts';
import { stepInto } from '../fetch-paths.mts';
import { closingParen } from '../graph-texts.mts';

const FROM_ROOT = /([\w$]+)\s*=\s*[\w$.]+\s*\.\s*from\s*\(\s*([\w$.]+)\s*\.\s*class\s*\)/gu;
const ROOT_DECLARED = /\bRoot\s*<\s*([\w$.]+)\s*>\s+([\w$]+)/gu;
const SPECIFICATION = /\bSpecification\s*<\s*([\w$.]+)\s*>/u;
const LAMBDA_ROOT = /\(\s*([\w$]+)\s*,\s*[\w$]+\s*,\s*[\w$]+\s*\)\s*->/gu;
const CHAIN_START = /(?:([\w$]+)\s*=\s*)?(?<![\w$.)\]])([\w$]+)(?=\s*\.\s*fetch\s*\()/gu;
const FETCH_STEP = /^\s*\.\s*fetch\s*\(\s*(?:"([\w$]+)"|[\w$.]+_\s*\.\s*([\w$]+))/u;

function simple(name: string): string {
  return name.split('.').at(-1) ?? '';
}

function criteriaRoots(body: string): Map<string, string> {
  const roots = new Map<string, string>([
    ...[...body.matchAll(ROOT_DECLARED)].map(([, entity = '', name = '']): [string, string] => [
      name,
      simple(entity),
    ]),
    ...[...body.matchAll(FROM_ROOT)].map(([, name = '', entity = '']): [string, string] => [
      name,
      simple(entity),
    ]),
  ]);
  const specified = SPECIFICATION.exec(body)?.[1];
  for (const [, root = ''] of specified === undefined ? [] : body.matchAll(LAMBDA_ROOT)) {
    roots.set(root, simple(specified ?? ''));
  }
  return roots;
}

function chainSteps(body: string, from: number): string[] {
  const steps: string[] = [];
  const cursors = [from];
  for (const cursor of cursors) {
    const step = FETCH_STEP.exec(body.slice(cursor));
    if (step !== null) {
      steps.push(step[1] ?? step[2] ?? '');
      cursors.push(closingParen(body, body.indexOf('(', cursor + step.index)) + 1);
    }
  }
  return steps;
}

export function criteriaFetches(body: string, relationOf: RelationOf): Joined[] {
  const aliases = new Map<string | undefined, FetchOwner>(
    [...criteriaRoots(body)].map(([name, entity]) => [name, { entity, key: name }]),
  );
  const joined: Joined = new Map();
  const step = stepInto(relationOf, (key, many) => {
    joined.set(key, many);
  });
  for (const match of body.matchAll(CHAIN_START)) {
    const [, assigned, receiver] = match;
    const end = chainSteps(body, match.index + match[0].length).reduce<FetchOwner | undefined>(
      step,
      aliases.get(receiver),
    );
    if (assigned !== undefined && end !== undefined) {
      aliases.set(assigned, end);
    }
  }
  const byRoot = Map.groupBy(joined, ([key]) => key.split('.')[0] ?? '');
  return [...byRoot.values()].map((entries) => new Map(entries));
}
