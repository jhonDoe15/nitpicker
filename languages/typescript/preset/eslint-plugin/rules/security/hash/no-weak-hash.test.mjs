import { createRuleTester } from '../../guards/test-support/rule-tester.mjs';
import { rule as noWeakHash } from './no-weak-hash.mjs';

const tester = createRuleTester();
const weak = (algorithm) => [{ messageId: 'weakHash', data: { algorithm } }];
const pkg = (name) => [{ messageId: 'weakPackage', data: { name } }];
const CRYPTO = 'import { createHash, createHmac } from "node:crypto";';

tester.run('no-weak-hash', noWeakHash, {
  valid: [
    'import * as CryptoJS from "crypto-js"; export const id = (s, k) => CryptoJS.HmacSHA1(s, k);',
    'const subtle = crypto.subtle; export const key = (raw) => subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);',
    `${CRYPTO} export const sign = (s, k) => createHmac("sha1", k).update(s).digest();`,
    `${CRYPTO} export const id = (s) => createHash("sha256").update(s).digest("hex");`,
    `${CRYPTO} export const id = (s) => createHash("sha512").update(s).digest("hex");`,
    `${CRYPTO} export const id = (s) => createHash("sha3-256").update(s).digest("hex");`,
    `${CRYPTO} export const sign = (s, k) => createHmac("sha256", k).update(s).digest();`,
    'import crypto from "node:crypto"; export const id = (s) => crypto.createHash("sha384").update(s).digest();',
    `${CRYPTO} const ALGORITHM = "sha256"; export const id = (s) => createHash(ALGORITHM).update(s).digest();`,
    `${CRYPTO} export const id = (s, algorithm) => createHash(algorithm).update(s).digest();`,
    `${CRYPTO} export const id = (s, algorithm = "sha256") => createHash(algorithm).update(s).digest();`,
    'import { pbkdf2Sync } from "node:crypto"; export const key = (p, s) => pbkdf2Sync(p, s, 600000, 32, "sha256");',
    'export const names = ["md5", "sha1"]; export const label = (n) => names.includes(n);',
    'export const log = (m) => logger.warn("md5 is not supported");',
    'export async function id(data) { return crypto.subtle.digest("SHA-256", data); }',
    'export async function id(data) { return crypto.subtle.digest({ name: "SHA-512" }, data); }',
    'const rows = { algorithm: "sha256" }; export const config = rows;',
    'import { MD5 } from "other-lib"; export const id = (s) => MD5(s);',
    'import CryptoJS from "crypto-js"; export const id = (s) => CryptoJS.SHA256(s);',
    'export function checksum(text) { return text.length; }',
    'export const a = hashOf("sha256", data);',
  ],
  invalid: [
    {
      code: `${CRYPTO} export const id = (s) => createHash("md5").update(s).digest("hex");`,
      errors: weak('md5'),
    },
    {
      code: `${CRYPTO} export const id = (s) => createHash("sha1").update(s).digest("hex");`,
      errors: weak('sha1'),
    },
    {
      code: `${CRYPTO} export const id = (s) => createHash("SHA-1").update(s).digest("hex");`,
      errors: weak('SHA-1'),
    },
    {
      code: 'import crypto from "node:crypto"; export const id = (s) => crypto.createHash("md5").update(s).digest();',
      errors: weak('md5'),
    },
    {
      code: 'import * as c from "crypto"; export const id = (s) => c.createHash("md5").update(s).digest();',
      errors: weak('md5'),
    },
    {
      code: 'import { createHash as digestOf } from "crypto"; export const id = (s) => digestOf("md5").update(s).digest();',
      errors: weak('md5'),
    },
    {
      code: 'const crypto = require("crypto"); exports.id = (s) => crypto.createHash("md5").update(s).digest();',
      errors: weak('md5'),
    },
    {
      code: 'const { createHash } = require("node:crypto"); exports.id = (s) => createHash("sha1").update(s).digest();',
      errors: weak('sha1'),
    },
    {
      code: 'exports.id = (s) => require("crypto").createHash("md5").update(s).digest();',
      errors: weak('md5'),
    },
    {
      code: 'import crypto from "node:crypto"; const { createHash: make } = crypto; export const id = (s) => make("md5").update(s).digest();',
      errors: weak('md5'),
    },
    {
      code: 'import crypto from "node:crypto"; const make = crypto.createHash; export const id = (s) => make("md5").update(s).digest();',
      errors: weak('md5'),
    },
    {
      code: 'import crypto from "node:crypto"; const make = crypto.createHash.bind(crypto); export const id = (s) => make("sha1").update(s).digest();',
      errors: weak('sha1'),
    },
    {
      code: `${CRYPTO} const ALGORITHM = "md5"; export const id = (s) => createHash(ALGORITHM).update(s).digest();`,
      errors: weak('md5'),
    },
    {
      code: `${CRYPTO} const ALGORITHM = "sha1" as const; export const id = (s) => createHash(ALGORITHM).update(s).digest();`,
      errors: weak('sha1'),
    },
    {
      code: `${CRYPTO} const CONFIG = { hash: "md5" }; export const id = (s) => createHash(CONFIG.hash).update(s).digest();`,
      errors: weak('md5'),
    },
    {
      code: `${CRYPTO} const FIRST = "md5"; const SECOND = FIRST; export const id = (s) => createHash(SECOND).update(s).digest();`,
      errors: weak('md5'),
    },
    {
      code: `${CRYPTO} export const id = (s) => createHash(process.env.HASH ?? "md5").update(s).digest();`,
      errors: weak('md5'),
    },
    {
      code: `${CRYPTO} export const id = (s, fast) => createHash(fast ? "md5" : "sha256").update(s).digest();`,
      errors: weak('md5'),
    },
    {
      code: `${CRYPTO} export const id = (s, algorithm = "md5") => createHash(algorithm).update(s).digest();`,
      errors: weak('md5'),
    },
    {
      code: `${CRYPTO} export const id = (s) => createHash("MD5".toLowerCase()).update(s).digest();`,
      errors: weak('MD5'),
    },
    {
      code: `${CRYPTO} export const id = (s) => createHash(\`sha1\`).update(s).digest();`,
      errors: weak('sha1'),
    },
    {
      code: 'import { pbkdf2Sync } from "node:crypto"; export const key = (p, s) => pbkdf2Sync(p, s, 1000, 32, "sha1");',
      errors: weak('sha1'),
    },
    {
      code: 'import { createSign } from "node:crypto"; export const sig = () => createSign("RSA-SHA1");',
      errors: weak('RSA-SHA1'),
    },
    {
      code: 'import { hash } from "node:crypto"; export const id = (s) => hash("md5", s);',
      errors: weak('md5'),
    },
    {
      code: 'export async function id(data) { return crypto.subtle.digest("SHA-1", data); }',
      errors: weak('SHA-1'),
    },
    {
      code: 'export async function id(data) { return globalThis.crypto.subtle.digest({ name: "SHA-1" }, data); }',
      errors: weak('SHA-1'),
    },
    {
      code: 'import { md5 } from "other"; export const id = (s) => md5(s); export const sums = (s) => hashWith("md5", s);',
      errors: weak('md5'),
    },
    {
      code: 'export const id = (s) => digest(s, { algorithm: "sha1" });',
      errors: weak('sha1'),
    },
    {
      code: 'import hash from "object-hash"; export const id = (o) => hash(o, { algorithm: "md5" });',
      errors: weak('md5'),
    },
    {
      code: 'export const CONFIG = { hashAlgorithm: "md5" };',
      errors: weak('md5'),
    },
    {
      code: 'import md5 from "md5"; export const id = (s) => md5(s);',
      errors: pkg('md5'),
    },
    {
      code: 'import { Md5 } from "ts-md5"; export const id = (s) => Md5.hashStr(s);',
      errors: pkg('ts-md5'),
    },
    {
      code: 'const sha1 = require("sha1"); exports.id = (s) => sha1(s);',
      errors: pkg('sha1'),
    },
    {
      code: 'import CryptoJS from "crypto-js"; export const id = (s) => CryptoJS.MD5(s).toString();',
      errors: weak('MD5'),
    },
    {
      code: 'import { SHA1 } from "crypto-js"; export const id = (s) => SHA1(s).toString();',
      errors: weak('SHA1'),
    },
  ],
});
