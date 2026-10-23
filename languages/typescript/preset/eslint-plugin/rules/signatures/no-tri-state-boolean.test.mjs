import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-tri-state-boolean.mjs';

const tester = typescriptRuleTester();

function flagged(code, name, options) {
  return {
    code,
    ...(options === undefined ? {} : { options }),
    errors: [{ messageId: 'triStateBoolean', data: { name } }],
  };
}

tester.run('no-tri-state-boolean', rule, {
  valid: [
    'export function run(force: boolean) { return force; }',
    'export function run(force = false) { return force; }',
    'export function run(force: boolean, name?: string) { return [force, name]; }',
    'export function run(value: string | undefined) { return value; }',
    'export function run(value: boolean | string) { return value; }',
    'export function run(value: boolean | string | undefined) { return value; }',
    'export function run(): boolean { return true; }',
    'export function run(): Promise<boolean> { return Promise.resolve(true); }',
    'export type Options = { force?: boolean };',
    'export type Options = { force: boolean };',
    'export function run() { const found: boolean | undefined = undefined; return found; }',
    'export class Check { override isOn(): boolean | undefined { return undefined; } }',
    'export type Mode = "on" | "off" | "auto";',
    'export function run(options: { force?: boolean }) { return options; }',
    {
      code: '/** @param {boolean} force */\nexport function run(force) { return force; }',
      options: [{ jsdoc: true }],
    },
    {
      code: '/** @param {boolean|undefined} force */\nexport function run(force) { return force; }',
    },
  ],
  invalid: [
    flagged('export function run(force: boolean | undefined) { return force; }', '`force`'),
    flagged('export function run(force: undefined | boolean) { return force; }', '`force`'),
    flagged('export function run(force: boolean | null) { return force; }', '`force`'),
    flagged('export function run(force: true | false | undefined) { return force; }', '`force`'),
    flagged('export function run(force?: boolean) { return force; }', '`force`'),
    flagged(
      'export function run(force: boolean | undefined = undefined) { return force; }',
      '`force`',
    ),
    flagged('export const run = (force?: boolean) => force;', '`force`'),
    flagged('export function run(): boolean | undefined { return undefined; }', 'The return value'),
    flagged(
      'export async function run(): Promise<boolean | undefined> { return undefined; }',
      'The return value',
    ),
    flagged('export type Options = { force: boolean | undefined };', '`force`'),
    flagged('export type Options = { force?: boolean | undefined };', '`force`'),
    flagged('export class Check { enabled: boolean | undefined = undefined; }', '`enabled`'),
    flagged(
      'export class Check { isOn(): boolean | undefined { return undefined; } }',
      'The return value',
    ),
    flagged('export type Handler = (force?: boolean) => void;', '`force`'),
    flagged('export declare function run(force?: boolean): void;', '`force`'),
    flagged(
      '/** @param {boolean|undefined} force */\nexport function run(force) { return force; }',
      'This JSDoc type',
      [{ jsdoc: true }],
    ),
    flagged(
      '/** @param {boolean=} force */\nexport function run(force) { return force; }',
      'This JSDoc type',
      [{ jsdoc: true }],
    ),
    flagged(
      '/** @param {boolean} [force] */\nexport function run(force) { return force; }',
      'This JSDoc type',
      [{ jsdoc: true }],
    ),
    flagged(
      '/** @returns {Promise<boolean|undefined>} */\nexport async function run() { return undefined; }',
      'This JSDoc type',
      [{ jsdoc: true }],
    ),
  ],
});
