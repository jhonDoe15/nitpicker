import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-pipe-dropping-errors.mts';

const tester = typescriptRuleTester();
const FS =
  "import fs from 'node:fs'; import { Transform, PassThrough, Readable, pipeline } from 'node:stream';";
const ZLIB = "import { createGzip } from 'node:zlib';";

function invalid(code: string) {
  return { code, errors: [{ messageId: 'dropsErrors' as const }] };
}

tester.run('no-pipe-dropping-errors', rule, {
  valid: [
    `${FS} export function run(a, b) { fs.createReadStream(a).pipe(fs.createWriteStream(b)); }`,
    `${FS} export function run(a, b) { pipeline(fs.createReadStream(a), fs.createWriteStream(b), done); }`,
    `${FS} export function run(a, b) { const out = fs.createWriteStream(b); return out; }`,
    `${FS} export function run(a, res) { const input = fs.createReadStream(a); input.on('error', fail); input.pipe(res).on('finish', done); }`,
    `${FS} export function run(a, res) { return fs.createReadStream(a).on('error', fail).pipe(res); }`,
    `${FS} export function run(a, res) { const input = fs.createReadStream(a); const gzip = createGzip(); input.on('error', fail); gzip.on('error', fail); return input.pipe(gzip).pipe(res); }`,
    "import { map } from 'rxjs'; export const run = (source) => source.pipe(map((x) => x)).pipe(take(1));",
    'export const run = () => process.stdin.pipe(transform).pipe(process.stdout);',
    `${FS} export function run(a) { const input = fs.createReadStream(a); pipeline(input, sink, done); return input.pipe(sink).on('finish', done); }`,
    "export const run = (source, sink) => source.pipe(sink).on('finish', done);",
    "import { pipeline } from 'node:stream/promises'; import fs from 'node:fs'; export async function run(a, b) { await pipeline(fs.createReadStream(a), fs.createWriteStream(b)); }",
    `${FS} export function run(a, res) { fs.createReadStream(a).pipe(res); }`,
    'export function run(db) { const rows = db.query(); return rows.pipe(sink).pipe(other); }',
    `${FS} ${ZLIB} export function run(a, res) { const gzip = createGzip(); gzip.on('error', fail); a.pipe(gzip).pipe(res); }`,
  ],
  invalid: [
    invalid(
      `${FS} ${ZLIB} export function run(input, res) { input.pipe(createGzip()).pipe(res); }`,
    ),
    invalid(
      `${FS} export async function run(web, p) { const out = fs.createWriteStream(p); Readable.fromWeb(web).pipe(out); return new Promise((ok, no) => { out.on('finish', ok); out.on('error', no); }); }`,
    ),
    invalid(
      `${FS} export function run(query) { const stream = query.stream().pipe(new Transform()).pipe(new PassThrough()); stream.on('end', done); return stream; }`,
    ),
    invalid(
      `${FS} export function run(a, b) { return fs.createReadStream(a).pipe(fs.createWriteStream(b)); }`,
    ),
    invalid(
      `${FS} export function run(a, b) { return new Promise((resolve, reject) => { const out = fs.createWriteStream(b); out.on('error', reject); fs.createReadStream(a).pipe(out).on('finish', resolve); }); }`,
    ),
    invalid(
      `${FS} export function run(a, res) { fs.createReadStream(a).pipe(createGzip()).pipe(res); }`,
    ),
    invalid(
      `${FS} ${ZLIB} export function run(a, b) { const input = fs.createReadStream(a); input.pipe(createGzip()).pipe(fs.createWriteStream(b)); }`,
    ),
    invalid(
      `${FS} export async function run(web, path) { const out = fs.createWriteStream(path); Readable.fromWeb(web).pipe(out).on('close', done); }`,
    ),
    invalid(
      `${FS} export function run(a, res) { const input = fs.createReadStream(a); input.pipe(res).on('error', fail); }`,
    ),
    invalid(
      "import { createReadStream } from 'fs'; export const run = (a, b) => createReadStream(a).pipe(b).on('end', done);",
    ),
    invalid(
      "import * as fs from 'fs'; export const run = (bucket, sink) => bucket.file('x').createReadStream().pipe(sink).on('finish', done);",
    ),
  ],
});
