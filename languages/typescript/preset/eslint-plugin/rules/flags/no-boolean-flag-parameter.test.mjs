import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-boolean-flag-parameter.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/features/orders/send-order.ts';

const flagged = (name, owner) => ({
  messageId: 'booleanFlag',
  data: { name: `\`${name}\``, owner },
});

tester.run('no-boolean-flag-parameter', rule, {
  valid: [
    'export class Mailer implements Sender { send(urgent: boolean) { if (urgent) { run(); } } }',
    'export class Mailer extends Base { send(urgent: boolean) { if (urgent) { run(); } } }',
    'export class Mailer { static create(urgent: boolean) { if (urgent) { run(); } } }',
    'export const api = { get urgent() { return 1; }, send(order: Order) { run(order); } };',
    'const api = { send(urgent: boolean) { if (urgent) { run(); } } };',
    'export function send(urgent: boolean) { run() && urgent; }',
    'export function send(order: Order, options: { urgent: boolean }) { if (options.urgent) { run(); } }',
    'export function send(order: Order, urgent: boolean) { return queue(order, urgent); }',
    'export function send(order: Order, urgent: boolean) { this.urgent = urgent; }',
    'export function send(order: Order, urgent: "yes" | "no") { if (urgent === "yes") { run(); } }',
    'function send(order: Order, urgent: boolean) { if (urgent) { run(); } }',
    'export function send(order: Order, urgent?: boolean) { if (urgent) { run(); } }',
    'export function send(order: Order, urgent: boolean) { urgent = check(); if (urgent) { run(); } }',
    'export function setUrgent(urgent: boolean) { if (urgent) { run(); } }',
    'export function withRetry(retry: boolean) { if (retry) { run(); } }',
    'export function fromFlag(flag: boolean) { return flag ? a : b; }',
    'export function send(order: Order, urgent: boolean) { if (check() === urgent) { run(); } }',
    'export function send(urgent: boolean) { const inner = (flag: boolean) => { if (flag) { run(); } }; return inner; }',
    'export class Mailer { private send(urgent: boolean) { if (urgent) { run(); } } }',
    'export class Mailer { #send(urgent: boolean) { if (urgent) { run(); } } }',
    'export class Mailer { protected send(urgent: boolean) { if (urgent) { run(); } } }',
    'export class Mailer { constructor(urgent: boolean) { if (urgent) { run(); } } }',
    'export class Mailer { set urgent(value: boolean) { if (value) { run(); } } }',
    'export class Mailer extends Base { override send(urgent: boolean) { if (urgent) { run(); } } }',
    'class Mailer { send(urgent: boolean) { if (urgent) { run(); } } }',
    'export interface Mailer { send(urgent: boolean): void; }',
    'export declare function send(urgent: boolean): void;',
    'export abstract class Mailer { abstract send(urgent: boolean): void; }',
    'export const send = (order: Order, options: Options) => { if (options.urgent) { run(); } };',
    'export function send(order: Order, count: number) { if (count) { run(); } }',
    'export function send(order: Order, ...flags: boolean[]) { if (flags[0]) { run(); } }',
  ].map((code) => ({ filename, code })),
  invalid: [
    {
      code: 'export const api = { send(urgent: boolean) { if (urgent) { run(); } } };',
      errors: [flagged('urgent', 'send')],
    },
    {
      code: 'export const api = { send: (urgent: boolean) => { if (urgent) { run(); } } };',
      errors: [flagged('urgent', 'send')],
    },
    {
      code: 'export function send(urgent: boolean) { urgent && run(); }',
      errors: [flagged('urgent', 'send')],
    },
    {
      code: 'export function send(urgent: boolean) { urgent || run(); }',
      errors: [flagged('urgent', 'send')],
    },
    {
      code: 'export function send(urgent: boolean) { switch (urgent) { case true: run(); } }',
      errors: [flagged('urgent', 'send')],
    },
    {
      code: 'export function send(order: Order, urgent: boolean) { if (urgent) { run(); } }',
      errors: [flagged('urgent', 'send')],
    },
    {
      code: 'export function label(loud: boolean) { return loud ? "A" : "a"; }',
      errors: [flagged('loud', 'label')],
    },
    {
      code: 'export function send(urgent = false) { if (!urgent) { run(); } }',
      errors: [flagged('urgent', 'send')],
    },
    {
      code: 'export const send = (order: Order, urgent: boolean) => { while (urgent && more()) { run(); } };',
      errors: [flagged('urgent', 'send')],
    },
    {
      code: 'export const send = function (urgent: boolean) { if (urgent === true) { run(); } };',
      errors: [flagged('urgent', 'send')],
    },
    {
      code: 'export default function (urgent: boolean) { if (urgent) { run(); } }',
      errors: [flagged('urgent', 'default')],
    },
    {
      code: 'function send(urgent: boolean) { if (urgent) { run(); } }\nexport { send };',
      errors: [flagged('urgent', 'send')],
    },
    {
      code: 'export class Mailer { send(urgent: boolean) { if (urgent) { run(); } } }',
      errors: [flagged('urgent', 'send')],
    },
    {
      code: 'export class Mailer { send = (urgent: boolean) => { if (urgent) { run(); } }; }',
      errors: [flagged('urgent', 'send')],
    },
    {
      code: 'export function send(a: boolean, b: boolean) { if (a && !b) { run(); } }',
      errors: [flagged('a', 'send'), flagged('b', 'send')],
    },
    {
      code: 'export function send(order: Order, urgent: boolean) { order.items.forEach(() => { if (urgent) { run(); } }); }',
      errors: [flagged('urgent', 'send')],
    },
    {
      code: '/** @param {boolean} urgent */\nexport function send(urgent) { if (urgent) { run(); } }',
      options: [{ jsdoc: true }],
      errors: [flagged('urgent', 'send')],
    },
  ].map((test) => ({ filename, ...test })),
});
