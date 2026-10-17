import { createRuleTester } from '../../guards/test-support/rule-tester.mjs';
import { rule as noDisabledTlsVerification } from './no-disabled-tls-verification.mjs';

const tester = createRuleTester();
const off = [{ messageId: 'tlsVerificationOff' }];

tester.run('no-disabled-tls-verification', noDisabledTlsVerification, {
  valid: [
    'import https from "node:https"; export const agent = new https.Agent({ ca: readFileSync(caPath) });',
    'export const options = { rejectUnauthorized: true };',
    'export const options = { rejectUnauthorized };',
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
    'import https from "node:https"; export const server = (key, cert, ca) => https.createServer({ key, cert, ca, requestCert: true, rejectUnauthorized: false }, (req, res) => { if (!req.socket.authorized) { res.writeHead(401).end(); return; } res.end("ok"); });',
    'import tls from "node:tls"; export const s = (key, cert) => tls.createServer({ key, cert, requestCert: true, rejectUnauthorized: false }, (socket) => { if (!socket.authorized) socket.end(); });',
    'import { createSecureServer } from "node:http2"; export const s = (key, cert, ca) => createSecureServer({ key, cert, ca, requestCert: true, rejectUnauthorized: false });',
    'export const args = (spki) => [`--ignore-certificate-errors-spki-list=${spki}`];',
    'export const FLAG = "--ignore-certificate-errors-spki-list";',
    'export function checkEnv(env, logger) { if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") { logger.warn("NODE_TLS_REJECT_UNAUTHORIZED=0 is set: certificate checks are off, unset it"); } }',
    'const BLOCKED = new Set(["--ignore-certificate-errors", "--disable-web-security"]); export const safeArgs = (args) => args.filter((a) => !BLOCKED.has(a));',
    'export const safeArgs = (args) => args.filter((a) => a !== "--ignore-certificate-errors");',
    'export const HELP = "Use sslmode=verify-full; never sslmode=no-verify in production.";',
    'export function agentOptions({ rejectUnauthorized = true }) { return { rejectUnauthorized }; }',
    'export const insecure = process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0";',
    'export const serverOptions = (key, cert, ca) => ({ key, cert, ca, requestCert: true, rejectUnauthorized: false });',
    'import { MongoClient } from "mongodb"; export const c = (uri, ca) => new MongoClient(uri, { tls: true, tlsCAFile: ca });',
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
    { code: 'export const options = { rejectUnauthorized: !isLocal };', errors: off },
    {
      code: 'import https from "node:https"; export const agent = new https.Agent({ rejectUnauthorized: process.env.NODE_ENV === "production" });',
      errors: off,
    },
    {
      code: 'const isDev = process.env.NODE_ENV !== "production"; export const agent = new https.Agent({ rejectUnauthorized: !isDev });',
      errors: off,
    },
    {
      code: 'export const ssl = { rejectUnauthorized: process.env.DB_SSL_VERIFY === "true" };',
      errors: off,
    },
    {
      code: 'export const browser = { ignoreHTTPSErrors: process.env.CI === "true" };',
      errors: off,
    },
    {
      code: 'import { MongoClient } from "mongodb"; export const c = (uri) => new MongoClient(uri, { tls: true, tlsAllowInvalidCertificates: true });',
      errors: off,
    },
    {
      code: 'import { MongoClient } from "mongodb"; export const c = (uri) => new MongoClient(uri, { tlsInsecure: true });',
      errors: off,
    },
    {
      code: 'import { MongoClient } from "mongodb"; export const c = (uri) => new MongoClient(uri, { tlsAllowInvalidHostnames: true });',
      errors: off,
    },
    { code: 'export const options = { sslValidate: false };', errors: off },
    {
      code: 'export const uri = "mongodb://h:27017/db?tls=true&tlsAllowInvalidCertificates=true";',
      errors: off,
    },
    {
      code: 'import { app } from "electron"; app.commandLine.appendSwitch("ignore-certificate-errors");',
      errors: off,
    },
    {
      code: 'export const launch = (puppeteer) => puppeteer.launch({ args: ["--ignore-certificate-errors"] });',
      errors: off,
    },
    {
      code: 'import { execSync } from "node:child_process"; export const run = (script) => execSync(`NODE_TLS_REJECT_UNAUTHORIZED=0 node ${script}`);',
      errors: off,
    },
    { code: 'export const ENV = "NODE_TLS_REJECT_UNAUTHORIZED=0";', errors: off },
  ],
});
