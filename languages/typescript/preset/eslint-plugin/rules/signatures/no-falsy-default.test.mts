import { namedErrorProject } from '../../test-support/projects/typed-ts-project.mts';
import { ruleModule } from '../../test-support/rule-tester.mts';
import { rule } from './no-falsy-default.mts';
import { withoutFixes } from '../../../eslint-config/rule-hints.mts';

const { tester, typed } = namedErrorProject('nitpicker-falsy-default-', 'falsyDefault');

tester.run('no-falsy-default', withoutFixes(ruleModule(rule)), {
  valid: [
    'export function pick(limit?: number) { return limit ?? 10; }',
    'export function pick(limit = 10) { return limit || 20; }',
    'export function pick(limit: number) { return limit || 20; }',
    "export function pick(name?: string) { return name || ''; }",
    'export function pick(count?: number) { return count || 0; }',
    'export function pick(flag?: boolean) { return flag || false; }',
    "export function pick(kind?: 'a' | 'b') { return kind || 'a'; }",
    'export function pick(user?: { id: string }) { return user || { id: "none" }; }',
    'export function pick(items?: string[]) { return items || []; }',
    'export function pick(limit?: number) { if (limit || fallback()) { return 1; } return 2; }\ndeclare function ' +
      'fallback(): boolean;',
    'export function pick(limit?: number) { return !limit; }',
    'export function pick(limit?: number) { return Boolean(limit || 0); }',
    'export function pick(limit?: number) { return limit !== undefined ? limit : 10; }',
    'export function pick(limit?: number) { if (limit === undefined) { return 1; } return limit || 5; }',
    'export function run(input: string | undefined) { const value = input || undefined; return value; }',
    'export function pick(limit?: number, other?: number) { return limit && other ? limit : 10; }',
    'export function pick() { const limit: number | undefined = Math.random() > 1 ? 1 : undefined; return limit ' +
      '|| 10; }',
    typed(
      '/** @param {number} [limit] */\nexport function pick(limit) { return limit ?? 10; }',
      undefined,
      'js',
    ),
    typed('export function pick(limit) { return limit || 10; }', undefined, 'js'),
    'type O = { limit?: number }; export function pick(o: O) { return o.limit ?? 10; }',
    'type O = { limit: number }; export function pick(o: O) { return o.limit || 10; }',
    'type O = { limit?: number }; export function pick(o: O) { return o.limit || 0; }',
    'type O = { name?: string }; export function pick(o: O) { return o.name || ""; }',
    "type O = { kind?: 'a' | 'b' }; export function pick(o: O) { return o.kind || 'a'; }",
    'type O = { a?: boolean; b?: boolean }; export function pick(o: O) { if (o.a || o.b) { return 1; } return 2; }',
    'type O = { limit?: number }; export function pick(o: O) { return o.limit !== undefined ? o.limit : 10; }',
    'type O = { limit?: number }; export function pick(o: O) { return o.limit ? 1 : 10; }',
    'type O = { items?: string[] }; export function pick(o: O) { return o.items || []; }',
    'type O = { unique?: number }; export function pick(o: O) { return { unique: o.unique || undefined }; }',
    'type O = { name?: string }; export function pick(o: O) { return o.name || undefined; }',
    'type O = { name?: string }; export function pick(o: O) { return o.name || "none"; }',
    'export function pick(o: any) { return o.limit || 10; }',
    'type O = { limit?: number }; export function pick(o: O) { return !o.limit; }',
    'type T = { displayName?: string; name: string }; export const a = (t: T) => t.displayName || t.name;',
    'type S = { scope?: string }; export const a = (n: S, t: S) => n.scope || t.scope;',
    'type P = { network?: boolean }; export const a = (o: P, p: P) => o.network || p.network || undefined;',
    'type L = { plural?: string }; export const a = (l: L, slug: string) => l.plural || slug;',
    'declare function randomUUID(): string; export const a = (m: { id?: string }) => m.id || randomUUID();',
    'type P = { network?: boolean; networkAccess?: boolean }; export const a = (o: P, y: boolean) => o.network ' +
      '|| o.networkAccess || y;',
    'export const a = (alias: Record<string, string | undefined>, type: string) => alias[type] || type;',
  ].map((code) => (typeof code === 'string' ? typed(code) : code)),
  invalid: [
    typed(
      'type O = { forceObject?: boolean }; declare const config: { forceObject: boolean };\nexport function ' +
        'pick(options: O) { return options.forceObject || config.forceObject; }',
      'options.forceObject',
    ),
    typed(
      'type O = { unique?: boolean }; export function pick(options?: O) { return { unique: options?.unique || ' +
        'undefined }; }',
      'options?.unique',
    ),
    typed(
      'type O = { ipv6Subnet?: number }; export function pick(options: O) { const prefix = options.ipv6Subnet || ' +
        '64; return prefix; }',
      'options.ipv6Subnet',
    ),
    typed(
      'type U = { referrer?: string }; export class A { referrer = "x"; run(update: U) { return update.referrer ' +
        '|| this.referrer; } }',
      'update.referrer',
    ),
    typed(
      'type Q = { expression: string | undefined }; export function pick(query: Q) { return query.expression ? ' +
        'query.expression : initial; }\ndeclare const initial: string;',
      'query.expression',
    ),
    typed(
      'type O = { limit?: number }; export const pick = (o: O) => (o.limit as number | undefined) || 3;',
      'o.limit as number | undefined',
    ),
    typed('type O = { limit?: number }; export const pick = (o: O) => o.limit || 20;', 'o.limit'),
    typed(
      'type O = { referrer?: string }; export const pick = (o: O, other: { referrer?: string }) => o.referrer || ' +
        'other.referrer;',
      'o.referrer',
    ),
    typed('export function pick(limit?: number) { return limit || 10; }', 'limit'),
    typed('export function pick(name: string | undefined) { return name || "none"; }', 'name'),
    typed('export function pick(limit: number | null) { return limit || 10; }', 'limit'),
    typed('export function pick(flag?: boolean) { return flag || true; }', 'flag'),
    typed('export function pick(count?: number) { return count || ""; }', 'count'),
    typed('export function pick(limit?: number) { return limit ? limit : 10; }', 'limit'),
    typed('export const pick = (limit?: number) => limit || 10;', 'limit'),
    typed(
      'export function pick(limit?: number) { const value = limit || 10; return value; }',
      'limit',
    ),
    typed(
      'export function pick(limit?: number) { return fetchLimit(limit || 10); }\ndeclare function ' +
        'fetchLimit(value: number): number;',
      'limit',
    ),
    typed(
      '/** @param {number} [limit] */\nexport function pick(limit) { return limit || 10; }',
      'limit',
      'js',
    ),
    typed(
      '/** @param {string|undefined} name */\nexport function pick(name) { return name || "none"; }',
      'name',
      'js',
    ),
  ],
});
