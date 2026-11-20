import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-error-response-without-status.mts';

const tester = typescriptRuleTester();
const SUCCESS = [{ messageId: 'successStatus' }];
const NEXT = "import { NextResponse } from 'next/server';";
const route = (answer: string) =>
  `${NEXT} export async function POST(req: Request) { try { await run(); return NextResponse.json({ sent: true }); } catch (error) { ${answer} } }`;
const express = (body: string) =>
  `async function create(req, res) { try { await save(); res.status(201).json({}); } catch (error) { ${body} } }`;

tester.run('no-error-response-without-status', rule, {
  valid: [
    route('return NextResponse.json({ error: "failed" }, { status: 500 });'),
    route('return NextResponse.json({ error: true }, { status: 200 });'),
    route('return NextResponse.json({ error: "failed" }, { status });'),
    route('return NextResponse.json({ error: "failed" }, options);'),
    route('return NextResponse.json({ error: "failed" }, { ...options });'),
    route('return NextResponse.json({ success: false, error: "failed" });'),
    route('return NextResponse.json({ ok: false, error: "failed" });'),
    route('return NextResponse.json({ status: "error", error: "failed" });'),
    route('return NextResponse.json({ code: "E_FAILED", error: "failed" });'),
    route('return NextResponse.json({ data: null, errors: [{ message: "failed" }] });'),
    route('return NextResponse.json({ jsonrpc: "2.0", id: 1, error: { message: "failed" } });'),
    route('return NextResponse.json({ error: null });'),
    route('return NextResponse.json({ errors: [] });'),
    route('return NextResponse.json({ ...body, error: "failed" });'),
    route('return NextResponse.json(failure);'),
    route('return NextResponse.json({ message: "failed" });'),
    route('throw error;'),
    `${NEXT} export function GET() { return NextResponse.json({ error: "gone" }); }`,
    `${NEXT} export function GET() { try { run(); } catch { later(() => NextResponse.json({ error: "x" })); } }`,
    "import { NextResponse } from './responses'; function f() { try { run(); } catch { return NextResponse.json({ error: 'x' }); } }",
    "import { Response } from './http'; function f() { try { run(); } catch { return Response.json({ error: 'x' }); } }",
    'function f() { try { run(); } catch { return Response.json({ error: "x" }, { status: 502 }); } }',
    express('res.status(500).json({ error: error.message });'),
    express('res.status(500); res.json({ error: error.message });'),
    express('res.statusCode = 500; res.send({ error: error.message });'),
    express(
      'if (known(error)) { return res.sendStatus(404); } res.json({ error: error.message });',
    ),
    express('res.set("x", "y").status(500).json({ error: error.message });'),
    express('res.json({ success: false, error: error.message });'),
    express('res.send("failed");'),
    express('next(error);'),
    'async function f(req, res) { res.status(207); try { await save(); } catch (e) { res.json({ error: e.message }); } }',
    'async function f(req) { const res = await fetch(url); try { await save(); } catch (e) { res.json({ error: e.message }); } }',
    'async function f(req, reply) { try { await save(); } catch (e) { reply.code(500).send({ error: e.message }); } }',
    'async function f(req, reply) { try { await save(); } catch (e) { reply.code(500); reply.send({ error: e.message }); } }',
    'async function f(c) { try { await save(); } catch (e) { return c.json({ error: e.message }); } }',
    "import { Hono } from 'hono'; app.get('/', async (c) => { try { await save(); } catch (e) { return c.json({ error: e.message }, 500); } });",
    "import { Hono } from 'hono'; app.get('/', async (c) => { try { await save(); } catch (e) { c.status(500); return c.json({ error: e.message }); } });",
  ],
  invalid: [
    {
      code: route('return NextResponse.json({ error: (error as Error).message });'),
      errors: SUCCESS,
    },
    { code: route('return NextResponse.json({ error: true });'), errors: SUCCESS },
    { code: route('return NextResponse.json({ errors: [String(error)] });'), errors: SUCCESS },
    {
      code: route('return NextResponse.json({ err: error, message: "failed" });'),
      errors: SUCCESS,
    },
    { code: route('return NextResponse.json({ "error": "failed" } as const);'), errors: SUCCESS },
    {
      code: route('return NextResponse.json({ error: "failed" }, { headers: { "x-run": id } });'),
      errors: SUCCESS,
    },
    {
      code: route(
        'if (error instanceof Missing) { return NextResponse.json({ error: "none" }, { status: 404 }); } return NextResponse.json({ error: "failed" });',
      ),
      errors: SUCCESS,
    },
    {
      code: 'export async function GET() { try { return Response.json(await load()); } catch (error) { return Response.json({ error: String(error) }); } }',
      errors: SUCCESS,
    },
    { code: express('res.json({ error: error.message });'), errors: SUCCESS },
    { code: express('return res.send({ error: error.message });'), errors: SUCCESS },
    { code: express('res.set("x-run", id).json({ errors: [error.message] });'), errors: SUCCESS },
    { code: express('if (loud) { res.json({ error: error.message }); }'), errors: SUCCESS },
    {
      code: 'export default async function handler(req, response) { try { await save(); } catch (e) { response.json({ error: "failed" }); } }',
      errors: SUCCESS,
    },
    {
      code: 'async function f(request, reply) { try { await save(); } catch (e) { return reply.send({ error: e.message }); } }',
      errors: SUCCESS,
    },
    {
      code: "import { Hono } from 'hono'; app.get('/', async (c) => { try { await save(); } catch (e) { return c.json({ error: e.message }); } });",
      errors: SUCCESS,
    },
  ],
});
