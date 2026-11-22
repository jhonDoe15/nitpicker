import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './unbounded-loop-cache.mts';

const tester = typescriptRuleTester();

const UNBOUNDED = { messageId: 'unboundedLoopCache' };

tester.run('unbounded-loop-cache', rule, {
  valid: [
    {
      filename: 'src/worker.mts',
      code: `
        export function process(items: { id: string }[]) {
          for (const item of items) {
            const scratch = new Map<string, string>();
            scratch.set(item.id, item.id.toUpperCase());
            console.log(scratch.get(item.id));
          }
        }
      `,
    },
    {
      filename: 'src/worker.mts',
      code: `
        export function indexItems(items: { id: string }[]) {
          const index = new Map<string, { id: string }>();
          for (const item of items) {
            index.set(item.id, item);
          }
          return index;
        }
      `,
    },
    {
      filename: 'src/worker.mts',
      code: `
        declare function send(values: string[]): void;
        export function collect(items: { id: string }[]) {
          const out: string[] = [];
          for (const item of items) {
            out.push(item.id);
          }
          send(out);
        }
      `,
    },
    {
      filename: 'src/worker.mts',
      code: `
        const registry = new Map<string, number>();
        export function load(items: { id: string; score: number }[]) {
          for (const item of items) {
            registry.set(item.id, item.score);
          }
        }
        export function lookup(id: string) {
          return registry.get(id);
        }
      `,
    },
    {
      filename: 'src/worker.mts',
      code: `
        export const sharedCache = new Map<string, string>();
        export function fill(items: { id: string }[]) {
          for (const item of items) {
            sharedCache.set(item.id, item.id);
          }
        }
      `,
    },
    {
      filename: 'src/worker.mts',
      code: `
        const cache = new Map<string, string>();
        export function process(items: { id: string }[]) {
          for (const item of items) {
            cache.set(item.id, item.id);
            console.log(cache.get(item.id));
            cache.delete(item.id);
          }
        }
      `,
    },
    {
      filename: 'src/worker.mts',
      code: `
        const cache = new Map<string, string>();
        export function process(items: { id: string }[]) {
          for (const item of items) {
            cache.set(item.id, item.id);
            console.log(cache.get(item.id));
          }
        }
        export function reset() {
          cache.clear();
        }
      `,
    },
    {
      filename: 'src/worker.mts',
      code: `
        const MAX_CACHE = 500;
        const cache = new Map<string, string>();
        export function process(items: { id: string }[]) {
          for (const item of items) {
            if (cache.size >= MAX_CACHE) {
              return;
            }
            cache.set(item.id, item.id);
          }
        }
      `,
    },
    {
      filename: 'src/worker.mts',
      code: `
        const buffer: string[] = [];
        export function process(items: string[]) {
          for (const item of items) {
            buffer.push(item);
            if (buffer.length > 50) {
              buffer.shift();
            }
          }
        }
      `,
    },
    {
      filename: 'src/worker.mts',
      code: `
        const scratch: Record<string, string> = {};
        export function process(items: { id: string }[]) {
          for (const item of items) {
            scratch[item.id] = item.id;
            delete scratch[item.id];
          }
        }
      `,
    },
    {
      filename: 'src/worker.mts',
      code: `
        let scratch: Record<string, string> = {};
        export function process(items: { id: string }[]) {
          for (const item of items) {
            scratch[item.id] = item.id;
          }
        }
        export function clearScratch() {
          scratch = {};
        }
      `,
    },
    {
      filename: 'src/worker.mts',
      code: `
        const cache = new Map<string, number>();
        export function initFixed() {
          for (const key of ['a', 'b', 'c']) {
            cache.set(key, key.length);
          }
        }
      `,
    },
    {
      filename: 'src/worker.mts',
      code: `
        const FIXED_KEYS = ['x', 'y', 'z'];
        const cache = new Map<string, number>();
        export function initFixed() {
          FIXED_KEYS.forEach((key) => {
            cache.set(key, key.length);
          });
        }
      `,
    },
    {
      filename: 'src/worker.mts',
      code: `
        const cache = new Map<number, number>();
        export function initSmallRange() {
          for (let i = 0; i < 10; i++) {
            cache.set(i, i * 2);
          }
        }
      `,
    },
    {
      filename: 'src/worker.mts',
      code: `
        const flags = new Map<string, boolean>();
        export function mark(items: string[]) {
          for (const _item of items) {
            flags.set('seen', true);
          }
        }
      `,
    },
    {
      filename: 'src/worker.mts',
      code: `
        export class Processor {
          private cache = new Map<string, string>();
          run(items: { id: string }[]) {
            for (const item of items) {
              this.cache.set(item.id, item.id);
              console.log(this.cache.get(item.id));
            }
          }
          dispose() {
            this.cache.clear();
          }
        }
      `,
    },
    {
      filename: 'src/worker.test.mts',
      code: `
        const cache = new Map<string, string>();
        export function process(items: { id: string }[]) {
          for (const item of items) {
            cache.set(item.id, item.id);
            console.log(cache.get(item.id));
          }
        }
      `,
    },
  ],
  invalid: [
    {
      filename: 'src/worker.mts',
      code: `
        declare function parse(item: string): string;
        declare function use(value: string | undefined): void;
        const parsedCache = new Map<string, string>();
        export function analyze(files: string[]) {
          for (const file of files) {
            parsedCache.set(file, parse(file));
            use(parsedCache.get(file));
          }
        }
      `,
      errors: [UNBOUNDED],
    },
    {
      filename: 'src/worker.mts',
      code: `
        declare function compute(item: object): number;
        declare function use(value: number | undefined): void;
        const meta = new WeakMap<object, number>();
        export function analyze(items: object[]) {
          for (const item of items) {
            meta.set(item, compute(item));
            use(meta.get(item));
          }
        }
      `,
      errors: [UNBOUNDED],
    },
    {
      filename: 'src/worker.mts',
      code: `
        const seen = new Set<string>();
        export function process(items: string[]) {
          for (let i = 0; i < items.length; i++) {
            seen.add(items[i]);
          }
        }
      `,
      errors: [UNBOUNDED],
    },
    {
      filename: 'src/worker.mts',
      code: `
        declare function render(value: string): void;
        const cache: Record<string, string> = {};
        export function process(items: { id: string; text: string }[]) {
          items.forEach((item) => {
            cache[item.id] = item.text;
            render(cache[item.id]);
          });
        }
      `,
      errors: [UNBOUNDED],
    },
    {
      filename: 'src/worker.mts',
      code: `
        declare function compute(item: string): number;
        const scratch: number[] = [];
        export function process(items: string[]) {
          return items.map((item) => {
            scratch.push(compute(item));
            return scratch[0];
          });
        }
      `,
      errors: [UNBOUNDED],
    },
    {
      filename: 'src/worker.mts',
      code: `
        declare function parse(item: string): string;
        declare function check(value: string | undefined): void;
        export class Analyzer {
          private cache = new Map<string, string>();
          run(files: string[]) {
            for (const file of files) {
              this.cache.set(file, parse(file));
              check(this.cache.get(file));
            }
          }
        }
      `,
      errors: [UNBOUNDED],
    },
    {
      filename: 'src/worker.mts',
      code: `
        declare function nextItem(): string | undefined;
        export class QueueWorker {
          private seen: Set<string>;
          constructor() {
            this.seen = new Set<string>();
          }
          drain() {
            let item: string | undefined;
            while ((item = nextItem()) !== undefined) {
              this.seen.add(item);
            }
          }
        }
      `,
      errors: [UNBOUNDED],
    },
    {
      filename: 'src/worker.mts',
      code: `
        declare function compute(item: string): string;
        declare function emit(value: string | undefined): void;
        export function createProcessor() {
          const cache = new Map<string, string>();
          return (items: string[]) => {
            for (const item of items) {
              cache.set(item, compute(item));
              emit(cache.get(item));
            }
          };
        }
      `,
      errors: [UNBOUNDED],
    },
    {
      filename: 'src/worker.mts',
      code: `
        declare function parse(item: string): string;
        declare function use(value: string | undefined): void;
        export function processItems(items: string[]) {
          const scratch = new Map<string, string>();
          for (const item of items) {
            scratch.set(item, parse(item));
            use(scratch.get(item));
          }
        }
      `,
      errors: [UNBOUNDED],
    },
    {
      filename: 'src/worker.mts',
      code: `
        const visited = new Set<string>();
        export function scan(record: Record<string, string>) {
          for (const key in record) {
            visited.add(key);
          }
        }
      `,
      errors: [UNBOUNDED],
    },
  ],
});
