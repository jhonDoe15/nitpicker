import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-slash-only-redirect-guard.mts';

const tester = typescriptRuleTester();

function flagged(code: string, messageId: 'slashOnly' | 'pathname' = 'slashOnly') {
  return { code, errors: [{ messageId }] };
}

tester.run('no-slash-only-redirect-guard', rule, {
  valid: [
    'function safe(callbackUrl) { if (callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) { ' +
      'return callbackUrl; } return "/"; }',
    'function safe(callbackUrl) { if (callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") && ' +
      '!callbackUrl.includes("\\\\")) { return callbackUrl; } return "/"; }',
    'function safe(callbackUrl) { const r = new URL(callbackUrl, base); if (r.origin !== base) { return ' +
      '"/"; } return r.pathname; }',
    'function safe(callbackUrl) { if (isSafeRedirect(callbackUrl) && callbackUrl.startsWith("/")) { ' +
      'return callbackUrl; } return "/"; }',
    'function f(name) { if (name.startsWith("/")) { return name; } return "/"; }',
    'function f(path) { if (path.startsWith("/")) { return path.slice(1); } return path; }',
    'function f(redirectTo) { if (redirectTo.startsWith("/")) { log(redirectTo); } }',
    'function f(next) { if (/^\\/(?!\\/)/.test(next)) { redirect(next); } }',
    'function f(next) { if (/^\\/[^/\\\\]/.test(next)) { redirect(next); } }',
    'function f(next) { if (next === "/") { redirect(next); } }',
    'function f(next) { if (allowed.includes(next)) { redirect(next); } }',
    'function f(next) { if (next.startsWith("https://")) { redirect(next); } }',
    'function f(next) { if (!next.startsWith("/")) { return "/"; } return next.replace(/\\/+/g, ' +
      '"/").replace(/^\\/\\//, "/"); }',
    'function f(returnTo) { if (!sanitizeRedirect(returnTo).startsWith("/")) { return; } redirect(returnTo); }',
    'function f(url) { const parsed = new URL(url, origin); router.push(parsed.pathname); }',
    'function f(raw) { const t = new URL(raw, origin); if (t.origin !== origin || ' +
      't.pathname.startsWith("//")) { return; } router.push(t.pathname + t.search); }',
    'function f(url) { router.push(url.pathname); }',
    'function f(target) { const u = new URL(target, origin); if (u.pathname.startsWith("//")) { return; ' +
      '} router.push(u.pathname + u.search); }',
  ],
  invalid: [
    flagged(
      'function pick(callbackUrl) { if (callbackUrl.startsWith("/")) { return callbackUrl; } return "/"; }',
    ),
    flagged(
      'function pick(callbackURL) { return callbackURL.startsWith("/") ? callbackURL : "/"; }',
    ),
    flagged(
      'function go(redirectTo, res) { if (redirectTo.startsWith("/")) { res.redirect(redirectTo); } }',
    ),
    flagged(
      'function go(req, res) { const next = req.query.next; if (next && next.startsWith("/")) { ' +
        'res.redirect(next); } }',
    ),
    flagged(
      'function go(returnTo) { if (!returnTo.startsWith("/")) { return "/"; } return returnTo; }',
    ),
    flagged('function go(next) { if (next[0] === "/") { redirect(next); } }'),
    flagged('if (callbackUrl.startsWith("/")) { redirect(callbackUrl); }'),
    flagged('if (!next.startsWith("/")) { throw new Error("x"); } redirect(next);'),
    flagged('function go(next) { if (next.charAt(0) === "/") { router.push(next); } }'),
    flagged('function go(next) { if (/^\\/.*$/.test(next)) { router.replace(next); } }'),
    flagged(
      'function go(searchParams) { const callbackUrl = searchParams.get("callbackUrl"); if ' +
        '(callbackUrl?.startsWith("/")) { return Response.redirect(callbackUrl); } }',
    ),
    flagged('function go(next) { if (next.startsWith("/")) { window.location.assign(next); } }'),
    flagged(
      'function go(raw) { const target = new URL(raw, origin); if (target.origin !== origin) { return; } ' +
        'router.push(target.pathname + target.search + target.hash); }',
      'pathname',
    ),
  ],
});
