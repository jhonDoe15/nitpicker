import { createRuleTester } from '../guards/test-support/rule-tester.mjs';
import { rule as noDisabledTlsVerification } from './no-disabled-tls-verification.mjs';

const tester = createRuleTester();
const off = [{ messageId: 'tlsVerificationOff' }];

tester.run('no-disabled-tls-verification', noDisabledTlsVerification, {
  valid: [
    'import https from "node:https"; export const agent = new https.Agent({ ca: readFileSync(caPath) });',
    'export const options = { rejectUnauthorized: true };',
    'export const options = { rejectUnauthorized };',
    'export const options = { rejectUnauthorized: !isLocal };',
    'import { Pool } from "pg"; export const pool = new Pool({ ssl: { ca, rejectUnauthorized: true } });',
    'export const x = { strictSSL: true };',
    'process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";',
    'delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;',
    'export const names = ["NODE_TLS_REJECT_UNAUTHORIZED"];',
    'export const options = { checkServerIdentity: (host, cert) => verify(host, cert) };',
    'export const options = { checkServerIdentity: tls.checkServerIdentity };',
    'export const browser = { ignoreHTTPSErrors: false };',
    'export const url = "postgres://db/app?sslmode=verify-full";',
    'export const options = { other: false };',
  ],
  invalid: [
    { code: 'export const options = { rejectUnauthorized: false };', errors: off },
    {
      code: 'import https from "node:https"; export const agent = new https.Agent({ rejectUnauthorized: false });',
      errors: off,
    },
    {
      code: 'import { Pool } from "pg"; export const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });',
      errors: off,
    },
    {
      code: 'const INSECURE = false; export const options = { rejectUnauthorized: INSECURE };',
      errors: off,
    },
    {
      code: 'export const options = { "rejectUnauthorized": false };',
      errors: off,
    },
    {
      code: 'export const options = { ["rejectUnauthorized"]: false };',
      errors: off,
    },
    {
      code: 'const rejectUnauthorized = false; export const options = { rejectUnauthorized };',
      errors: off,
    },
    {
      code: 'export const options = { rejectUnauthorized: isProduction ? true : false };',
      errors: off,
    },
    {
      code: 'const BASE = { rejectUnauthorized: false }; export const options = { ...BASE, ca };',
      errors: off,
    },
    { code: 'process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";', errors: off },
    { code: 'process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;', errors: off },
    {
      code: 'const { env } = process; env.NODE_TLS_REJECT_UNAUTHORIZED = "0";',
      errors: off,
    },
    {
      code: 'Object.assign(process.env, { NODE_TLS_REJECT_UNAUTHORIZED: "0" });',
      errors: off,
    },
    {
      code: 'import { spawn } from "node:child_process"; spawn(cmd, args, { env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0" } });',
      errors: off,
    },
    {
      code: 'import { exec } from "node:child_process"; exec("NODE_TLS_REJECT_UNAUTHORIZED=0 node app.js");',
      errors: off,
    },
    {
      code: 'export const url = `postgres://db/app?sslmode=no-verify`;',
      errors: off,
    },
    { code: 'https.globalAgent.options.rejectUnauthorized = false;', errors: off },
    { code: 'tls.checkServerIdentity = () => undefined;', errors: off },
    { code: 'export const options = { checkServerIdentity: () => {} };', errors: off },
    {
      code: 'export const options = { checkServerIdentity() { return undefined; } };',
      errors: off,
    },
    {
      code: 'import got from "got"; export const get = (u) => got(u, { https: { rejectUnauthorized: false } });',
      errors: off,
    },
    { code: 'export const client = { strictSSL: false };', errors: off },
    { code: 'export const browser = { ignoreHTTPSErrors: true };', errors: off },
    { code: 'export const browser = { acceptInsecureCerts: true };', errors: off },
    {
      code: 'export const args = ["--no-sandbox", "--ignore-certificate-errors"];',
      errors: off,
    },
  ],
});
