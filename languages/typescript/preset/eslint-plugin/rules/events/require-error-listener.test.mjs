import { createRuleTester } from '../guards/test-support/rule-tester.mjs';
import { rule } from './require-error-listener.mjs';

const tester = createRuleTester();
const missing = (name) => [{ messageId: 'missingListener', data: { name } }];

tester.run('require-error-listener', rule, {
  valid: [
    'import { createReadStream } from "node:fs"; export function read(path) { const stream = createReadStream(path); stream.on("error", (error) => log(error)); return 1; }',
    'import fs from "fs"; export function read(path) { const stream = fs.createReadStream(path); stream.once("error", fail); }',
    'import * as net from "node:net"; export function open(port) { const socket = net.connect(port); socket.setTimeout(10).on("data", read).on("error", fail); }',
    'const ERROR = "error"; import { spawn } from "node:child_process"; export function run() { const child = spawn("ls"); child.addListener(ERROR, fail); }',
    'import { spawn } from "node:child_process"; export function run() { const child = spawn("ls"); child?.prependListener("error", fail); }',
    'import { createReadStream, createWriteStream } from "node:fs"; import { pipeline } from "node:stream/promises"; export async function copy(a, b) { const input = createReadStream(a); const output = createWriteStream(b); await pipeline(input, output); }',
    'import { createReadStream } from "node:fs"; import stream from "node:stream"; export function read(path, done) { const input = createReadStream(path); stream.finished(input, done); }',
    'import { createReadStream } from "node:fs"; import stream from "node:stream"; export async function read(path) { const input = createReadStream(path); await stream.promises.finished(input); }',
    'import { connect } from "node:net"; import { once } from "node:events"; export async function open(port) { const socket = connect(port); await once(socket, "connect"); }',
    'import { connect } from "node:net"; import { EventEmitter } from "node:events"; export async function open(port) { const socket = connect(port); await EventEmitter.once(socket, "connect"); }',
    'import { createReadStream } from "node:fs"; export async function read(path) { const input = createReadStream(path); for await (const chunk of input) { use(chunk); } }',
    'import { createReadStream } from "node:fs"; export async function read(path) { const input = createReadStream(path); return input.toArray(); }',
    'import { createReadStream } from "node:fs"; import { text } from "node:stream/consumers"; export async function read(path) { const input = createReadStream(path); return text(input); }',
    'import { createReadStream } from "node:fs"; import readline from "node:readline"; export async function lines(path) { const input = createReadStream(path); const rl = readline.createInterface({ input, crlfDelay: Infinity }); for await (const line of rl) { use(line); } }',
    'import { createReadStream } from "node:fs"; import { StreamableFile } from "@nestjs/common"; export function download(path) { const file = createReadStream(path); return new StreamableFile(file); }',
    'import { createReadStream } from "node:fs"; export function open(path) { const stream = createReadStream(path); stream.on("open", ready); return stream; }',
    'import { createReadStream } from "node:fs"; export const stream = createReadStream("a.txt");',
    'import { createReadStream } from "node:fs"; const stream = createReadStream("a.txt"); export { stream };',
    'import { createReadStream } from "node:fs"; export function open(path) { const stream = createReadStream(path); this.stream = stream; }',
    'import { createReadStream } from "node:fs"; export const open = (path) => createReadStream(path).on("error", fail);',
    'import { createReadStream } from "node:fs"; export function open(path) { use(createReadStream(path)); }',
    'import { createReadStream } from "./fs.js"; export function open(path) { const stream = createReadStream(path); stream.resume(); }',
    'export function open(path) { const stream = createReadStream(path); stream.resume(); }',
    'import Redis from "ioredis"; export function cache() { const redis = new Redis(); redis.set("a", "b"); }',
    'import { exec } from "node:child_process"; export function run(done) { const child = exec("ls", done); child.unref(); }',
    'import { createClient } from "redis"; export class Cache { constructor() { this.client = createClient(); this.client.on("error", (error) => this.log(error)); } }',
    'import { createClient } from "redis"; export class Cache { #client = createClient(); start() { this.#client.on("error", fail); } }',
    'import { createServer } from "node:net"; export function serve() { return createServer((socket) => { socket.on("error", fail); socket.pipe(socket); }); }',
    'import net from "node:net"; export function serve() { const server = net.createServer(); server.on("connection", (socket) => { socket.on("error", fail); }); return server; }',
    'import http from "node:http"; export function serve(app) { const server = http.createServer(app); server.listen(3000); }',
    'import { PassThrough } from "node:stream"; export function tee(out) { const copy = new PassThrough(); copy.pipe(out); copy.end("x"); }',
    'import { connect } from "node:net"; export function open(port) { const socket = connect(port).setTimeout(5).on("error", fail); socket.write("x"); }',
    'import { createClient } from "redis"; export class Cache { client = createClient(); start() { const { client } = this; client.on("error", fail); } }',
    'import { createClient } from "redis"; export class Cache { 1 = createClient(); }',
    'import { createReadStream } from "node:fs"; import { Readable } from "node:stream"; export function web(path) { const file = createReadStream(path); return new Response(Readable.toWeb(file)); }',
    'import { createReadStream } from "node:fs"; export function open(path) { const stream = createReadStream(path); return { stream, path }; }',
    'import { createReadStream } from "node:fs"; function watch(stream) { stream.on("error", fail); } export function open(path) { const stream = createReadStream(path); watch(stream); stream.resume(); }',
    'import { spawn } from "node:child_process"; import { supervise } from "./supervise.js"; export function run() { const child = spawn("ls"); supervise(child); }',
    'import { WebSocketServer } from "ws"; export function serve() { const server = new WebSocketServer({ port: 1 }); server.on("connection", (socket) => socket.send("hi")); }',
  ],
  invalid: [
    {
      code: 'import { createReadStream } from "node:fs"; export function read(path, res) { const stream = createReadStream(path); stream.pipe(res); }',
      errors: missing('stream'),
    },
    {
      code: 'const fs = require("fs"); exports.read = function read(path, res) { const stream = fs.createReadStream(path); stream.pipe(res); };',
      errors: missing('stream'),
    },
    {
      code: 'const { spawn } = require("node:child_process"); exports.run = function run() { const child = spawn("ls"); child.on("exit", done); };',
      errors: missing('child'),
    },
    {
      code: 'import { fork } from "child_process"; export function run() { const worker = fork("job.js"); worker.on("message", use); }',
      errors: missing('worker'),
    },
    {
      code: 'import { Socket } from "node:net"; export function open(port) { const socket = new Socket(); socket.connect(port); }',
      errors: missing('socket'),
    },
    {
      code: 'import tls from "node:tls"; export function open(port) { const socket = tls.connect(port); socket.write("x"); }',
      errors: missing('socket'),
    },
    {
      code: 'import https from "node:https"; export function send(options, body) { const request = https.request(options, read); request.end(body); }',
      errors: missing('request'),
    },
    {
      code: 'import { createGzip } from "node:zlib"; import { createReadStream } from "node:fs"; export function zip(path, out) { const gzip = createGzip(); createReadStream(path).on("error", fail).pipe(gzip).pipe(out); }',
      errors: missing('gzip'),
    },
    {
      code: 'import { connect } from "node:net"; export function open(port) { const socket = connect(port).setTimeout(5); socket.write("x"); }',
      errors: missing('socket'),
    },
    {
      code: 'import { connect } from "node:net"; export function open(port, tls) { const socket = tls ? connect(port) : connect(port + 1); socket.write("x"); }',
      errors: missing('socket'),
    },
    {
      code: 'import { createClient } from "redis"; export class Cache { "client" = createClient(); start() { this.client.connect(); } }',
      errors: missing('this.client'),
    },
    {
      code: 'import { createClient } from "redis"; export class Cache { start() { this.client ??= createClient(); this["client"].connect(); } }',
      errors: missing('this.client'),
    },
    {
      code: 'import { connect } from "node:net"; export class Link { socket = connect(1); start() { function later() { this.socket.on("error", fail); } return later; } }',
      errors: missing('this.socket'),
    },
    {
      code: 'import { connect } from "node:net"; import { once } from "node:events"; export async function open(port, other) { const socket = connect(port); await once(other, "ready", { signal: socket }); }',
      errors: missing('socket'),
    },
    {
      code: 'import { createWriteStream } from "node:fs"; import readline from "node:readline"; export function ask(input, path) { const output = createWriteStream(path); return readline.createInterface({ input, output }); }',
      errors: missing('output'),
    },
    {
      code: 'import net from "node:net"; function handle(socket) { socket.write("hi"); } export function serve() { return net.createServer(handle); }',
      errors: missing('socket'),
    },
    {
      code: 'import net from "node:net"; const CONNECTION = "connection"; export function serve() { const server = net.createServer(); server.on(CONNECTION, (socket) => socket.write("hi")); return server; }',
      errors: missing('socket'),
    },
    {
      code: 'import { Worker } from "node:worker_threads"; export function start() { const worker = new Worker("./job.js"); worker.postMessage(1); }',
      errors: missing('worker'),
    },
    {
      code: 'import dgram from "node:dgram"; export function bind() { const socket = dgram.createSocket("udp4"); socket.bind(1); }',
      errors: missing('socket'),
    },
    {
      code: 'import { createClient } from "redis"; import RedisStore from "connect-redis"; export function store(url) { const redisClient = createClient({ url }); redisClient.connect(); return new RedisStore({ client: redisClient }); }',
      errors: missing('redisClient'),
    },
    {
      code: 'import { createClient } from "redis"; export class Cache { constructor() { this.client = createClient(); this.client.connect(); } }',
      errors: missing('this.client'),
    },
    {
      code: 'import { ImapFlow } from "imapflow"; export class Mail { client = new ImapFlow({ host: "h" }); async open() { await this.client.connect(); } }',
      errors: missing('this.client'),
    },
    {
      code: 'import pg from "pg"; export function connect() { const pool = new pg.Pool(); pool.query("select 1"); }',
      errors: missing('pool'),
    },
    {
      code: 'const { Client } = require("pg"); exports.connect = async function connect() { const client = new Client(); await client.connect(); };',
      errors: missing('client'),
    },
    {
      code: 'import WebSocket from "ws"; export function open(url) { const socket = new WebSocket(url); socket.on("message", use); }',
      errors: missing('socket'),
    },
    {
      code: 'const WebSocket = require("ws"); exports.open = function open(url) { const socket = new WebSocket(url); socket.send("x"); };',
      errors: missing('socket'),
    },
    {
      code: 'import { createReadStream } from "node:fs"; export function open(paths) { let stream; for (const path of paths) { stream = createReadStream(path); stream.resume(); } }',
      errors: missing('stream'),
    },
    {
      code: 'import { createServer } from "node:net"; export function serve() { return createServer((socket) => { socket.pipe(socket); }); }',
      errors: missing('socket'),
    },
    {
      code: 'import net from "node:net"; export function serve() { const server = net.createServer(); server.on("connection", (socket) => socket.write("hi")); return server; }',
      errors: missing('socket'),
    },
    {
      code: 'import tls from "node:tls"; export function serve(options) { return tls.createServer(options, (socket) => { socket.end("bye"); }); }',
      errors: missing('socket'),
    },
  ],
});
