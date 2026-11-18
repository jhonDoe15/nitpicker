import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-host-port-colon-split.mts';

const tester = typescriptRuleTester();

function flagged(code: string) {
  return { code, errors: [{ messageId: 'hostSplit' }] };
}

tester.run('no-host-port-colon-split', rule, {
  valid: [
    'export const url = new URL(`http://${req.get("host")}`);',
    'export const parts = value.split(":");',
    'export const [h, m] = time.split(":");',
    'export const parts = address.split(":");',
    'export const parts = req.get("accept").split(":");',
    'export const parts = req.get("host").split(",");',
    'export const first = hostname.split("/");',
    'export const i = host.lastIndexOf(":");',
    'export const [a] = headers.get("content-type").split(":");',
    'export const h = new URL(`http://${host}`).hostname;',
    'export const p = host.slice(0, host.lastIndexOf(":"));',
    'export function split(host: string) { if (host.startsWith("[")) { return host; } return host.split(":"); }',
    'export function split(host: string) { return isIPv6(host) ? host : host.split(":")[0]; }',
    'export const parts = "localhost:3000".split(":");',
    'export function f(host: string) { const i = host.indexOf("/"); return host.slice(0, i); }',
    'export const parts = other.host.hostName.split(":");',
  ],
  invalid: [
    flagged('export const [hostname, portStr] = req.get("host")?.split(":") ?? [];'),
    flagged('export const [name] = host.split(":");'),
    flagged('export const name = hostname.split(":")[0];'),
    flagged('export const parts = authority.split(":", 2);'),
    flagged('export const name = proxyHost.split(":")[0];'),
    flagged('export const name = url.origin.split(":")[2];'),
    flagged('export const name = req.headers.host!.split(":")[0];'),
    flagged('export const name = (req.headers["x-forwarded-host"] ?? "").split(":")[0];'),
    flagged('export const name = headers.get("host")!.split(":")[0];'),
    flagged('export const name = request.headers.get("X-Forwarded-Host")?.split(":")[0];'),
    flagged('export const name = ctx.getHeader(":authority").split(":")[0];'),
    flagged('export const name = host.slice(0, host.indexOf(":"));'),
    flagged(
      'export function f(host: string) { const i = host.indexOf(":"); return host.slice(0, i); }',
    ),
    flagged('export const name = req.headers.host.substring(0, req.headers.host.indexOf(":"));'),
  ],
});
