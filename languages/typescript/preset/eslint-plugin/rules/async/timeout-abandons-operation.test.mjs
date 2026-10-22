import { createRuleTester } from '../guards/test-support/rule-tester.mjs';
import { rule } from './timeout-abandons-operation.mjs';

const tester = createRuleTester();
const abandoned = (timeout, operation) => [
  { messageId: 'noSignal', data: { timeout, operation, parameter: '' } },
];
const ignored = (timeout, operation, parameter) => [
  { messageId: 'ignoredSignal', data: { timeout, operation, parameter } },
];

const REJECT_AFTER =
  'const rejectAfter = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));\n';
const PROMISE = 'a `new Promise` around `setTimeout`';
const REJECT_AFTER_CALL = '`rejectAfter(...)`';

tester.run('timeout-abandons-operation', rule, {
  valid: [
    'export const run = (ms, signal) => Promise.race([sendPayment({ signal }), new Promise((_, reject) => setTimeout(reject, ms))]);',
    `${REJECT_AFTER}export const run = (controller) => Promise.race([sendPayment({ signal: controller.signal }), rejectAfter(10)]);`,
    `${REJECT_AFTER}export const run = (ms) => Promise.race([sendPayment({ signal: AbortSignal.timeout(ms) }), rejectAfter(ms)]);`,
    `${REJECT_AFTER}export const run = (ms) => Promise.race([sendPayment(AbortSignal.timeout(ms)), rejectAfter(ms)]);`,
    `${REJECT_AFTER}export const run = (signal) => Promise.race([sendPayment(1, signal), rejectAfter(10)]);`,
    `${REJECT_AFTER}export const run = (abortSignal) => Promise.race([readFile("a", { abortSignal }), rejectAfter(10)]);`,
    `${REJECT_AFTER}export const run = (options) => Promise.race([sendPayment(options), rejectAfter(10)]);`,
    `${REJECT_AFTER}export const run = (extra) => Promise.race([sendPayment({ ...extra }), rejectAfter(10)]);`,
    `${REJECT_AFTER}const OPTIONS = { signal: AbortSignal.timeout(5) }; export const run = () => Promise.race([sendPayment(OPTIONS), rejectAfter(10)]);`,
    `${REJECT_AFTER}export const run = () => Promise.race([sendPayment({ timeout: 5 }), rejectAfter(10)]);`,
    `${REJECT_AFTER}export async function run() { const controller = new AbortController(); try { return await Promise.race([sendPayment(), rejectAfter(10)]); } catch (error) { controller.abort(); throw error; } }`,
    `${REJECT_AFTER}export async function run(client) { try { return await Promise.race([client.send(), rejectAfter(10)]); } catch (error) { client.destroy(); throw error; } }`,
    `${REJECT_AFTER}export const run = (signal) => { const send = () => fetchPayment({ signal }); return Promise.race([send(), rejectAfter(10)]); };`,
    `${REJECT_AFTER}export const run = (fn) => Promise.race([Promise.resolve(1), rejectAfter(10)]);`,
    `${REJECT_AFTER}export const run = (items) => Promise.race([...items, rejectAfter(10)]);`,
    'export const run = (a, b) => Promise.race([a(), b()]);',
    'export const run = (a, b) => Promise.all([sendPayment(), sleep(b)]);',
    'export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); export const run = () => Promise.race([sleep(1), sleep(2)]);',
    'export const run = () => Promise.race([sendPayment(), pause(10)]);',
    'import { rejectAfter } from "./timers.js"; export const run = (signal) => Promise.race([sendPayment(signal), rejectAfter(10)]);',
    'const Promise = { race: () => 1 }; export const run = () => Promise.race([sendPayment(), setTimeout(() => 1, 10)]);',
    'export const get = (url) => Promise.race([fetch(url, { signal: AbortSignal.timeout(10) }), new Promise((_, reject) => setTimeout(reject, 10))]);',
    'import { setTimeout as delay } from "node:timers/promises"; export const run = (signal) => Promise.race([sendPayment({ signal }), delay(10)]);',
    'export const run = (pending) => Promise.race([pending, new Promise((_, reject) => setTimeout(reject, 10))]);',
    'export const run = () => Promise.race([(async () => 1)(), new Promise((_, reject) => setTimeout(reject, 10))]);',
  ],
  invalid: [
    {
      code: `${REJECT_AFTER}export const run = () => Promise.race([sendPayment(), rejectAfter(10)]);`,
      errors: abandoned(REJECT_AFTER_CALL, 'sendPayment'),
    },
    {
      code: 'export const run = (ms) => Promise.race([sendPayment(), new Promise((_, reject) => setTimeout(reject, ms))]);',
      errors: abandoned(PROMISE, 'sendPayment'),
    },
    {
      code: 'export const run = (order) => Promise.race([paymentGateway.charge(order), new Promise((_, reject) => setTimeout(() => reject(new Error("t")), 5))]);',
      errors: abandoned(PROMISE, 'paymentGateway.charge'),
    },
    {
      code: `${REJECT_AFTER}export const run = async () => { const result = await Promise.race([rejectAfter(10), sendPayment()]); return result; };`,
      errors: abandoned(REJECT_AFTER_CALL, 'sendPayment'),
    },
    {
      code: `${REJECT_AFTER}export const run = () => { const pending = sendPayment(); return Promise.race([pending, rejectAfter(10)]); };`,
      errors: abandoned(REJECT_AFTER_CALL, 'sendPayment'),
    },
    {
      code: `${REJECT_AFTER}export const run = () => Promise.race([sendPayment().then((r) => r.id), rejectAfter(10)]);`,
      errors: abandoned(REJECT_AFTER_CALL, 'sendPayment'),
    },
    {
      code: `${REJECT_AFTER}export const run = () => Promise.race([Promise.all([charge(), notify()]), rejectAfter(10)]);`,
      errors: [
        ...abandoned(REJECT_AFTER_CALL, 'charge'),
        ...abandoned(REJECT_AFTER_CALL, 'notify'),
      ],
    },
    {
      code: `${REJECT_AFTER}export const run = (a, b) => Promise.race([charge(a), charge(b), rejectAfter(10)]);`,
      errors: [
        ...abandoned(REJECT_AFTER_CALL, 'charge'),
        ...abandoned(REJECT_AFTER_CALL, 'charge'),
      ],
    },
    {
      code: `${REJECT_AFTER}const timeout = rejectAfter(10); export const run = () => Promise.race([sendPayment(), timeout]);`,
      errors: abandoned(REJECT_AFTER_CALL, 'sendPayment'),
    },
    {
      code: `${REJECT_AFTER}export const run = () => Promise.race([sendPayment(), rejectAfter(10).catch(() => undefined)]);`,
      errors: abandoned(REJECT_AFTER_CALL, 'sendPayment'),
    },
    {
      code: 'import { setTimeout as delay } from "node:timers/promises"; export const run = () => Promise.race([sendPayment(), delay(10)]);',
      errors: abandoned('`setTimeout` from `node:timers/promises`', 'sendPayment'),
    },
    {
      code: 'import * as timers from "timers/promises"; export const run = () => Promise.race([sendPayment(), timers.setTimeout(10)]);',
      errors: abandoned('`setTimeout` from `node:timers/promises`', 'sendPayment'),
    },
    {
      code: 'import { once } from "node:events"; export const run = (ms) => Promise.race([sendPayment(), once(AbortSignal.timeout(ms), "abort")]);',
      errors: abandoned('`once(AbortSignal.timeout(...), "abort")`', 'sendPayment'),
    },
    {
      code: 'import { rejectAfter } from "./timers.js"; export const run = () => Promise.race([sendPayment(), rejectAfter(10)]);',
      errors: abandoned(REJECT_AFTER_CALL, 'sendPayment'),
    },
    {
      code: `${REJECT_AFTER}async function charge(order, signal) { return order; }\nexport const run = (order) => Promise.race([charge(order), rejectAfter(10)]);`,
      errors: ignored(REJECT_AFTER_CALL, 'charge', 'signal'),
    },
    {
      code: `${REJECT_AFTER}async function charge(order, abort?: AbortSignal) { return order; }\nexport const run = (order) => Promise.race([charge(order), rejectAfter(10)]);`,
      errors: ignored(REJECT_AFTER_CALL, 'charge', 'abort'),
    },
    {
      code: `${REJECT_AFTER}export const run = () => Promise.race([sendPayment({ signal: undefined }), rejectAfter(10)]);`,
      errors: abandoned(REJECT_AFTER_CALL, 'sendPayment'),
    },
    {
      code: `${REJECT_AFTER}export const run = () => Promise.race([sendPayment("order"), rejectAfter(10)]);`,
      errors: abandoned(REJECT_AFTER_CALL, 'sendPayment'),
    },
  ],
});
