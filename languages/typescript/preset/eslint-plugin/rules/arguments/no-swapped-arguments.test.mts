import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { typedTsProject } from '../../test-support/projects/typed-ts-project.mts';
import { ruleModule } from '../../test-support/rule-tester.mts';
import { rule } from './no-swapped-arguments.mts';

const { root, tester, write } = typedTsProject('nitpicker-swapped-arguments-', {
  prepare: (projectRoot) => {
    writeFileSync(
      path.join(projectRoot, 'src/tools.ts'),
      'export function merge(base: object, extra: object) { return { ...base, ...extra }; }\n',
    );
  },
});

type Extension = 'ts' | 'js';
type Slots = readonly [passed: string, slot: string, other: string, otherSlot: string];

function source(code: string, extension: Extension = 'ts') {
  return { filename: write(code, extension), code };
}

function reported(code: string, [passed, slot, other, otherSlot]: Slots, extension?: Extension) {
  return {
    ...source(code, extension),
    errors: [{ messageId: 'swappedArguments', data: { passed, slot, other, otherSlot } }],
  };
}

const PIPE =
  'function pipe_(docs: string[], proc: (docs: string[]) => string[], kwargs: object) {\n' +
  '  return proc(docs);\n}\n';

tester.run('no-swapped-arguments', ruleModule(rule), {
  valid: [
    `${PIPE}export function run(docs: string[], pipe: (docs: string[]) => string[]) { return pipe_(docs, pipe, {}); }`,
    'function swap(a: number, b: number) { return [b, a]; }\nexport function run(a: number, b: number) { return swap(b, a); }',
    'function span(x1: number, x2: number) { return x2 - x1; }\nexport function run(x1: number, x2: number) { return span(x2, x1); }',
    'function join(left: string, right: string) { return left + right; }\nexport function run(left: string, right: string) { return join(right, left); }',
    'function span(start_a: number, start_b: number) { return start_b - start_a; }\nexport function run(start_a: number, start_b: number) { return span(start_b, start_a); }',
    'function rename(name: string, id: number) { return [name, id]; }\nexport function run(id: number, other: string) { return rename(other, id); }',
    'function copy(source: string, target: string) { return [source, target]; }\nexport function run(source: string, target: string) { return copy(source, target); }',
    'function copy(source: string, target: string) { return [source, target]; }\nexport function run(source: string) { return copy(source); }',
    'function copy(source: string, target: string, mode?: string) { return [source, target, mode]; }\nexport function run(target: string) { return copy(target); }',
    'function copy(source: string, ...rest: string[]) { return [source, rest]; }\nexport function run(source: string, rest: string) { return copy(rest, source); }',
    'function copy(source: string, target: string) { return [source, target]; }\nexport function run(target: string, source: string[]) { return copy(...source, target); }',
    'function copy({ source }: { source: string }, target: string) { return [source, target]; }\nexport function run(source: string, target: string) { return copy({ source }, source); }',
    'function copy(source: string, target = "x") { return [source, target]; }\nexport function run(source: string, target: string) { return copy(source, target); }',
    'export function run(source: string, target: string) { return [source, target].join(","); }\nexport const join = (separator: string, items: string[]) => items.join(separator);',
    'export function run(path: string, start: string) { return [path, start].indexOf(path, 0); }',
    'function copy(source: string, target: string) { return [source, target]; }\nexport function run(source: string, target: string) { return copy(target.length ? "a" : source, source); }',
    'function copy(source: string, target: string): string;\nfunction copy(source: number, target: number): number;\nfunction copy(source: unknown, target: unknown) { return [source, target]; }\nexport function run(source: string, target: string) { return copy(source, target); }',
    'export function run(source: string, target: string, f: any) { return f(target, source); }',
    'type Node = { children: Node[] };\nexport function walk(node: Node, parent: Node | undefined): void { for (const child of node.children) walk(child, node); }',
    'export class Visitor {\n  visit(node: object, parent: object | undefined): void { for (const child of [node]) this.visit(child, node); }\n}',
    'function step(prev: number, cur: number) { return [prev, cur]; }\nexport function run(prev: number, cur: number, next: number) { return step(cur, next); }',
    'function link(parent: string, child: string) { return [parent, child]; }\nexport function run(child: string, grandchild: string) { return link(child, grandchild); }',
    'function addEdge(from: string, to: string) { return [from, to]; }\nexport function run(to: string, next: string) { return addEdge(to, next); }',
    source(
      '/** @param {function(string, string): void} cb */\nexport function run(cb) { const a = "1"; const b = "2"; cb(a, b); }',
      'js',
    ),
    source(
      '/** @type {function(string, string): void} */\nlet cb = () => {};\nexport function run() { const a = "1"; const b = "2"; cb(a, b); cb = () => {}; }',
      'js',
    ),
    source(
      'function copy(source, target) { return [source, target]; }\nexport function run(source, target) { return copy(source, target); }',
      'js',
    ),
    source('export function run(a, b) { return JSON.stringify(b, a); }', 'js'),
  ].map((code) => (typeof code === 'string' ? source(code) : code)),
  invalid: [
    reported(
      `${PIPE}export function run(docs: string[], pipe: (docs: string[]) => string[]) { return pipe_(pipe, docs, {}); }`,
      ['docs', 'proc', 'pipe', 'docs'],
    ),
    reported(
      'function copy(source: string, target: string) { return [source, target]; }\nexport function run(source: string, target: string) { return copy(target, source); }',
      ['target', 'source', 'source', 'target'],
    ),
    reported(
      'export function copy(_source: string, target: string) { return [_source, target]; }\nexport function run(source: string, target: string) { return copy(target, source); }',
      ['target', '_source', 'source', 'target'],
    ),
    reported(
      'function copy(Source: string, Target: string) { return [Source, Target]; }\nexport function run(source: string, target: string) { return copy(target, source); }',
      ['target', 'Source', 'source', 'Target'],
    ),
    reported(
      'class Mailer {\n  body = "";\n  send(subject: string, body: string) { return [subject, body]; }\n  run(subject: string) { return this.send(this.body, subject); }\n}\nexport { Mailer };',
      ['body', 'subject', 'subject', 'body'],
    ),
    reported(
      'class Copier {\n  constructor(readonly source: string, readonly target: string) {}\n}\nexport function run(source: string, target: string) { return new Copier(target, source); }',
      ['target', 'source', 'source', 'target'],
    ),
    reported(
      'import { merge } from "./tools";\nexport function run(base: object, extra: object) { return merge(extra, base); }',
      ['extra', 'base', 'base', 'extra'],
    ),
    reported(
      'function clamp(value: number, min: number, max: number) { return [value, min, max]; }\nexport function run(value: number, min: number, max: number) { return clamp(value, max, min); }',
      ['max', 'min', 'min', 'max'],
    ),
    {
      ...source(
        'function two(source: string, target: string, input: string, output: string) { return [source, target, input, output]; }\nexport function run(source: string, target: string, input: string, output: string) { return two(target, source, output, input); }',
      ),
      errors: [
        {
          messageId: 'swappedArguments',
          data: { passed: 'target', slot: 'source', other: 'source', otherSlot: 'target' },
        },
        {
          messageId: 'swappedArguments',
          data: { passed: 'output', slot: 'input', other: 'input', otherSlot: 'output' },
        },
      ],
    },
    reported(
      'function copy(source: string, target: string, mode?: string) { return [source, target, mode]; }\nexport function run(source: string, target: string) { return copy(target, source); }',
      ['target', 'source', 'source', 'target'],
    ),
    reported(
      'function copy(source: string, target: string): string;\nfunction copy(source: number, target: number): number;\nfunction copy(source: unknown, target: unknown) { return [source, target]; }\nexport function run(source: number, target: number) { return copy(target, source); }',
      ['target', 'source', 'source', 'target'],
      'ts',
    ),
    reported(
      'function copy(source, target) { return [source, target]; }\nexport function run(source, target) { return copy(target, source); }',
      ['target', 'source', 'source', 'target'],
      'js',
    ),
  ],
});

export { root };
