export const HEAD = [
  "import { compareImported } from './compare.ts';",
  'export {};',
  'interface Row { t: number; at: string; id: string; d: Date; tag?: string }',
  'declare let calls: number;',
  'declare function log(): void;',
  'function byTime(a: Row, b: Row) { return a.t - b.t; }',
  'function noisy(a: Row, b: Row) { log(); return a.t - b.t; }',
  '',
].join('\n');

export type Kind = 'rows' | 'names' | 'numbers';
export type FixCase = { code: string; output: string; kind: Kind };

type Pick = {
  readonly a?: string;
  readonly b?: string;
  readonly less: string;
  readonly end?: 'first' | 'last';
  readonly type?: string;
};

export function reduced(source: string, pick: Pick): string {
  const { a = 'a', b = 'b', less, end = 'first', type = 'Row' } = pick;
  const choice =
    end === 'last'
      ? `${b} !== undefined && ${less} ? ${b} : ${a}`
      : `${b} === undefined || ${less} ? ${a} : ${b}`;
  return `${source}.reduce<${type} | undefined>((${b}, ${a}) => (${choice}), undefined)`;
}

export function fixed(kind: Kind, params: string, text: Omit<FixCase, 'kind'>): FixCase {
  return { code: wrapped(params, text.code), output: wrapped(params, text.output), kind };
}

export function rowsFix(body: string, output: string): FixCase {
  return fixed('rows', 'rows: Row[]', { code: body, output });
}

export function wrapped(params: string, body: string): string {
  return `${HEAD}export function f(${params}) { return ${body}; }`;
}
