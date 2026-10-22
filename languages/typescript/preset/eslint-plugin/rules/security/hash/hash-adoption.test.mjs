import { createRuleTester } from '../../guards/test-support/rule-tester.mjs';
import { rule } from './no-weak-hash.mjs';

const tester = createRuleTester();
const weak = (algorithm) => [{ messageId: 'weakHash', data: { algorithm } }];
const hmac = (algorithm) => [{ messageId: 'weakHmac', data: { algorithm } }];
const pkg = (name) => [{ messageId: 'weakPackage', data: { name } }];

tester.run('no-weak-hash with HMAC, exact names and more sources', rule, {
  valid: [
    'import { authenticator } from "otplib"; authenticator.options = { algorithm: "sha1" as never, digits: 6 };',
    'import * as OTPAuth from "otpauth"; export const totp = (secret: string) => new OTPAuth.TOTP({ issuer: "App", algorithm: "SHA1", digits: 6, period: 30, secret });',
    'import { createHmac } from "node:crypto"; export const hotp = (key: Buffer, counter: Buffer) => createHmac("sha1", key).update(counter).digest();',
    'export const key = (raw: ArrayBuffer) => crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);',
    'import { createHmac, timingSafeEqual } from "node:crypto"; export const valid = (token: string, data: string, sig: string) => timingSafeEqual(Buffer.from(createHmac("sha1", token).update(data).digest("base64")), Buffer.from(sig));',
    'import CryptoJS from "crypto-js"; export const sign = (s: string, k: string) => CryptoJS.HmacSHA1(s, k).toString();',
    'import CryptoJS from "crypto-js"; export const mac = (k: string) => CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA1, k);',
    'import hmacSha1 from "crypto-js/hmac-sha1"; export const sign = (s: string, k: string) => hmacSha1(s, k);',
    'import { hmac } from "@noble/hashes/hmac"; import { sha1 } from "@noble/hashes/legacy"; export const mac = (k: Uint8Array, m: Uint8Array) => hmac(sha1, k, m);',
    'import { createHMAC, createSHA1 } from "hash-wasm"; export const mac = (k: string) => createHMAC(createSHA1(), k);',
    'export const sign = (key: string, data: string) => hmacDigest("sha1", key, data);',
    'declare function setHash(s: string): void; export const tab = () => setHash("md5-calculator");',
    'declare function isWeakHash(a: string): boolean; export const weak = isWeakHash("md5");',
    'declare const router: { hashChange(s: string): void }; export const go = () => router.hashChange("sha1");',
    'export const opts = { authMechanism: "SCRAM-SHA-1" };',
    'export const isSri = (v: string) => v.startsWith("sha384-");',
    'import { createHash } from "node:crypto"; enum Algo { Modern = "sha256" } export const h = (s: string) => createHash(Algo.Modern).update(s).digest("hex");',
    'import { createHash } from "node:crypto"; export class Hasher { private readonly algorithm = "sha256"; run(s: string) { return createHash(this.algorithm).update(s).digest("hex"); } }',
  ],
  invalid: [
    {
      code: 'import { createHmac } from "node:crypto"; export const sign = (s: string, k: string) => createHmac("md5", k).update(s).digest();',
      errors: hmac('md5'),
    },
    {
      code: 'import CryptoJS from "crypto-js"; export const sign = (s: string, k: string) => CryptoJS.HmacMD5(s, k).toString();',
      errors: hmac('HmacMD5'),
    },
    {
      code: 'import hmacMd5 from "crypto-js/hmac-md5"; export const sign = (s: string, k: string) => hmacMd5(s, k);',
      errors: hmac('md5'),
    },
    {
      code: 'import { authenticator } from "otplib"; authenticator.options = { algorithm: "md5", digits: 6 };',
      errors: hmac('md5'),
    },
    {
      code: 'export const k = () => crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-1" }, true, ["encrypt"]);',
      errors: weak('SHA-1'),
    },
    { code: 'export const algos = [{ label: "MD5", algorithm: "md5" }];', errors: weak('md5') },
    {
      code: 'import { createHash } from "node:crypto"; enum Algo { Legacy = "md5" } export const h = (s: string) => createHash(Algo.Legacy).update(s).digest("hex");',
      errors: weak('md5'),
    },
    {
      code: 'import { createHash } from "node:crypto"; const enum Algo { Legacy = "sha1" } export const h = (s: string) => createHash(Algo.Legacy).digest("hex");',
      errors: weak('sha1'),
    },
    {
      code: 'import { createHash } from "node:crypto"; export class Hasher { private readonly algorithm = "sha1"; run(s: string) { return createHash(this.algorithm).update(s).digest("hex"); } }',
      errors: weak('sha1'),
    },
    {
      code: 'import { createHash } from "node:crypto"; export class H2 { constructor(private readonly algorithm = "md5") {} run(s: string) { return createHash(this.algorithm).update(s).digest("hex"); } }',
      errors: weak('md5'),
    },
    {
      code: 'import { createHash } from "node:crypto"; export class Etag { static readonly ALGO = "md5"; static of(s: string) { return createHash(Etag.ALGO).update(s).digest("hex"); } }',
      errors: weak('md5'),
    },
    {
      code: 'import { createHash } from "node:crypto"; const cfg = { algorithm: "md5" }; export const h = (s: string) => createHash(cfg.algorithm).digest("hex");',
      errors: weak('md5'),
    },
    {
      code: 'import { sha1 } from "@noble/hashes/legacy"; export const h = (b: Uint8Array) => sha1(b);',
      errors: pkg('sha1 from @noble/hashes/legacy'),
    },
    {
      code: 'import { sha1 } from "@noble/hashes/sha1"; export const h = (b: Uint8Array) => sha1(b);',
      errors: pkg('sha1 from @noble/hashes/sha1'),
    },
    {
      code: 'import { md5 } from "hash-wasm"; export const h = (s: string) => md5(s);',
      errors: pkg('md5 from hash-wasm'),
    },
    {
      code: 'import CryptoJS from "crypto-js"; export const h = () => CryptoJS.algo.SHA1.create();',
      errors: weak('SHA1'),
    },
    {
      code: 'export const sums = (s: string) => fileChecksum(s, "sha1");',
      errors: weak('sha1'),
    },
    {
      code: 'import { createSign } from "node:crypto"; export const sig = () => createSign("sha1WithRSAEncryption");',
      errors: weak('sha1WithRSAEncryption'),
    },
  ],
});
