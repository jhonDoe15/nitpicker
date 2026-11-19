import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-send-without-return.mts';

const tester = typescriptRuleTester();
const FALLS = [{ messageId: 'fallsThrough' }];
const handler = (body: string) =>
  `async function create(req, res, next) { ${body} await save(); res.status(201).json({}); }`;

tester.run('no-send-without-return', rule, {
  valid: [
    handler('if (!ok) { res.status(400).json({}); return; }'),
    handler('if (!ok) { return res.status(400).json({}); }'),
    handler('if (!ok) return res.sendStatus(400);'),
    handler('if (!ok) { return next(); }'),
    handler('if (!ok) { res.status(400).json({}); } else { await other(); }'),
    handler('if (!ok) { res.status(400).json({}); throw new Error("x"); }'),
    'function f(req, res) { if (!ok) { res.status(400).json({}); } }',
    'function f(req, res) { if (!ok) { res.status(400).json({}); } return; }',
    'function f(req, res) { if (!ok) { res.status(400).json({}); } console.log("done"); }',
    'function f(req, res) { if (!ok) { res.status(400).json({}); } logger.info("done"); return; }',
    'function f(req, res) { if (!ok) { res.write("x"); } save(); }',
    'function f(req, res) { if (!ok) { res.status(400); } save(); }',
    'function f(req, res) { if (!ok) { res.set("a", "b").json({}); } else { save(); } }',
    'function f(req, other) { if (!ok) { res.status(400).json({}); } save(); }',
    'function f(req) { const res = make(); if (!ok) { res.json({}); } save(); }',
    'function f(req, res, next) { if (!ok) { next(); } }',
    'function f(next, res) { if (!ok) { next(); } save(); }',
    'function f(x) { if (!ok) { cb(); } save(); }',
    'function f(x, done) { if (!ok) { other(done); } save(); }',
    'function f(x, done) { if (!ok) { done.call(1); } save(); }',
    'function f(req, res) { switch (a) { case 1: if (!ok) { res.send("x"); } break; } }',
    'function f(req, res) { if (a) { res.send(1); } else if (b) { res.send(2); } else { save(); } }',
    'function f(req, res) { if (a) { save(); res.send(1); } return; }',
    'function f(req, res) { if (!res.writableEnded) { res.end(); } report(); }',
    'function f(x, callback) { if (callback) { callback(); } return true; }',
    'function f(x, callback) { if (callback) callback(); work(); }',
    'function f(x, callback) { if (done) { callback(1); } return () => {}; }',
    'function f(x, callback) { if (done) { callback(1); } return unsubscribe; }',
  ],
  invalid: [
    {
      code: 'const casTicket = function (req, token, callback) { if (!enabled) { logger.error("off"); callback(); } const ticket = parse(req); validate(ticket); };',
      errors: FALLS,
    },
    {
      code: 'async function h(req, res) { const result = check(); if (!result.valid) { audit(); res.status(400).json({ errors: result.errors }); } await catalog.addEntity(entity); res.status(201).json(entity); }',
      errors: FALLS,
    },
    {
      code: 'function f(x, callback) { if (done) { callback(1); } return unsubscribe(); }',
      errors: FALLS,
    },
    {
      code: 'function f(req, res) { if (!req.body) { res.status(400).send("Invalid body"); } res.send("OK"); }',
      errors: FALLS,
    },
    { code: handler('if (!ok) { res.status(400).json({ errors }); }'), errors: FALLS },
    { code: handler('if (!ok) { res.send("bad"); }'), errors: FALLS },
    { code: handler('if (!ok) res.sendStatus(400);'), errors: FALLS },
    { code: handler('if (!ok) { res.redirect("/login"); }'), errors: FALLS },
    { code: handler('if (!ok) { res.end(); }'), errors: FALLS },
    { code: handler('if (!ok) { log(1); res.status(400).json({}); }'), errors: FALLS },
    { code: handler('if (!ok) { await res.status(400).send("x"); }'), errors: FALLS },
    { code: handler('if (!ok) { next(); }'), errors: FALLS },
    { code: handler('if (!ok) { next(new Error("x")); }'), errors: FALLS },
    {
      code: 'function mw(req, reply) { if (!ok) { reply.code(401).send({}); } work(); }',
      errors: FALLS,
    },
    {
      code: 'function login(method, callback) { if (disabled) { callback(); } validate(); }',
      errors: FALLS,
    },
    {
      code: 'function run(input, cb) { if (!input) { cb(new Error("x")); } parse(input); }',
      errors: FALLS,
    },
    {
      code: 'const h = (req, res) => { if (a) { res.send(1); } else if (b) { res.send(2); } save(); };',
      errors: FALLS,
    },
    {
      code: 'function f(req, res) { try { if (!ok) { res.json({}); } save(); } catch (e) { next(e); } }',
      errors: FALLS,
    },
    {
      code: 'function f(req, response) { if (!ok) { response.json({}); } return save(); }',
      errors: FALLS,
    },
  ],
});
