import { createRuleTester } from '../../rules/guards/test-support/rule-tester.mjs';
import { rule as requireHttpTimeout } from '../../rules/security/http/require-http-timeout.mjs';
import { rule as noDisabledTlsVerification } from '../../rules/security/tls/no-disabled-tls-verification.mjs';

const tester = createRuleTester();
const timeoutOf = (call, output) => [
  {
    messageId: 'noTimeout',
    data: { call },
    suggestions: [{ messageId: 'addTimeout', data: { ms: '10000' }, output }],
  },
];
const noTimeout = (call) => [{ messageId: 'noTimeout', data: { call } }];
const axios = 'import axios from "axios"; ';

tester.run('require-http-timeout suggestions', requireHttpTimeout, {
  valid: [],
  invalid: [
    {
      code: 'export const get = (url) => fetch(url);',
      errors: timeoutOf(
        'fetch()',
        'export const get = (url) => fetch(url, { signal: AbortSignal.timeout(10000) });',
      ),
    },
    {
      code: 'export const get = (url) => fetch(url, { method: "POST" });',
      errors: timeoutOf(
        'fetch()',
        'export const get = (url) => fetch(url, { method: "POST", signal: AbortSignal.timeout(10000) });',
      ),
    },
    {
      code: `${axios}export const get = (url) => axios.get(url);`,
      errors: timeoutOf(
        'axios.get()',
        `${axios}export const get = (url) => axios.get(url, { timeout: 10000 });`,
      ),
    },
    {
      code: `${axios}export const post = (url, body) => axios.post(url, body, { headers });`,
      errors: timeoutOf(
        'axios.post()',
        `${axios}export const post = (url, body) => axios.post(url, body, { headers, timeout: 10000 });`,
      ),
    },
    {
      code: `${axios}export const post = (url) => axios.post(url);`,
      errors: noTimeout('axios.post()'),
    },
    {
      code: `${axios}export const get = (url) => axios.get(url, { timeout: 0 });`,
      errors: noTimeout('axios.get()'),
    },
    {
      code: 'import got from "got"; export const get = (url) => got(url);',
      errors: noTimeout('got()'),
    },
  ],
});

const off = [{ messageId: 'tlsVerificationOff' }];
const dropped = (output) => [
  { messageId: 'tlsVerificationOff', suggestions: [{ messageId: 'dropOption', output }] },
];

tester.run('no-disabled-tls-verification suggestions', noDisabledTlsVerification, {
  valid: [],
  invalid: [
    {
      code: 'export const options = { rejectUnauthorized: false };',
      errors: dropped('export const options = {};'),
    },
    {
      code: 'export const options = { ca, rejectUnauthorized: false, host };',
      errors: dropped('export const options = { ca, host };'),
    },
    {
      code: 'export const options = { ca, rejectUnauthorized: false };',
      errors: dropped('export const options = { ca };'),
    },
    {
      code: 'const rejectUnauthorized = false; export const options = { rejectUnauthorized };',
      errors: dropped('const rejectUnauthorized = false; export const options = {};'),
    },
    {
      code: 'process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";\nrun();',
      errors: dropped('run();'),
    },
    {
      code: 'export const options = { ["rejectUnauthorized"]: false };',
      errors: off,
    },
    {
      code: 'export const value = (process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0");',
      errors: off,
    },
    {
      code: 'export const options = { rejectUnauthorized: /* local */ false };',
      errors: off,
    },
  ],
});
