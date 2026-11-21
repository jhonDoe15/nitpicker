import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-subtree-search-per-ancestor.mts';

const tester = typescriptRuleTester();

const PER_LEVEL = (name: string, search: string) => ({
  messageId: 'searchPerLevel',
  data: { name, search },
});

tester.run('no-subtree-search-per-ancestor', rule, {
  valid: [
    'export function f(start: N | undefined, name: string) { for (let at = start; at; at = at.parent) { switch (at.kind) { case "block": for (const child of at.children) { if (child.name === name) return child; } break; } } return undefined; }\ntype N = { kind: string; name: string; parent?: N; children: N[] };',
    'export function f(start: N | undefined, name: string) { for (let at = start; at && at.kind !== "root"; at = at.parent) { for (const child of at.children) { if (child.name === name) return child; } } return undefined; }\ntype N = { kind: string; name: string; parent?: N; children: N[] };',
    'export function f(start: Element) { return start.closest("[data-scope]"); }',
    'export function f(start: Element | null) { for (let el = start; el; el = el.parentElement) { if (el.hasAttribute("data-scope")) return el; } return null; }',
    'export function f(start: Element | null) { for (let el = start; el; el = el.parentElement) { if (el.tagName !== "SECTION") continue; if (el.querySelector("h2")) return el; } return null; }',
    'export function f(start: Element | null, cache: Map<Element, boolean>) { for (let el = start; el; el = el.parentElement) { if (cache.get(el) ?? el.querySelector("[data-scope]") !== null) return el; } return null; }',
    'export function f(start: Element | null, other: Element) { for (let el = start; el; el = el.parentElement) { if (other.querySelector("[data-scope]")) return el; } return null; }',
    'export function f(items: Element[]) { for (let i = 0; i < items.length; i += 1) { items[i]?.querySelector("a"); } }',
    'export function f(start: Element | null) { for (let el = start; el; el = el.nextElementSibling) { if (el.querySelector("a")) return el; } return null; }',
    'export function f(start: N | undefined, name: string) { for (let at = start; at; at = at.parent) { if (at.kind === "block") { for (const child of at.children) { if (child.name === name) return child; } } } return undefined; }\ntype N = { kind: string; name: string; parent?: N; children: N[] };',
    'export function f(start: N | undefined) { for (let at = start; at; at = at.parent) { register(function visit() { return at?.children.find((child) => child.name === "x"); }); } }\ndeclare function register(fn: () => unknown): void;\ntype N = { name: string; parent?: N; children: N[] };',
  ],
  invalid: [
    {
      code: 'export function f(start: Element | null) { for (let el = start; el; el = el.parentElement) { if (el.querySelector("[data-scope]")) return el; } return null; }',
      errors: [PER_LEVEL('el', 'el.querySelector("[data-scope]")')],
    },
    {
      code: 'export function f(usage: N, name: string) { for (let at: N | undefined = usage; at !== undefined; at = at.getParent()) { for (const child of at.getChildren()) { if (child.name === name) return child; } } return undefined; }\ntype N = { name: string; getParent(): N | undefined; getChildren(): N[] };',
      errors: [PER_LEVEL('at', 'at.getChildren()')],
    },
    {
      code: 'export function f(start: Node | null) { let node = start; while (node) { const hit = Array.from(node.childNodes).find((child) => child.nodeName === "A"); if (hit) return hit; node = node.parentNode; } return null; }',
      errors: [PER_LEVEL('node', 'Array.from(node.childNodes)')],
    },
    {
      code: 'export function f(start: N | undefined, name: string) { let at = start; do { if (at?.children.some((child) => child.name === name)) return at; at = at?.parent; } while (at); return undefined; }\ntype N = { name: string; parent?: N; children: N[] };',
      errors: [PER_LEVEL('at', 'at?.children.some((child) => child.name === name)')],
    },
    {
      code: 'import ts from "typescript";\nexport function f(node: ts.Node) { for (let at: ts.Node | undefined = node; at; at = at.parent) { ts.forEachChild(at, (child) => { console.log(child.kind); }); } }',
      errors: [PER_LEVEL('at', 'ts.forEachChild(at, (child) => { console.log(child.kind); })')],
    },
  ],
});
