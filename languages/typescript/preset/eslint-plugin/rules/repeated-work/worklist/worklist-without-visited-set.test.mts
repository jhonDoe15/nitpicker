import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './worklist-without-visited-set.mts';

const tester = typescriptRuleTester();
const filename = '/repo/src/graph/traverse.ts';
const ERROR = { messageId: 'worklistWithoutVisitedSet' };

tester.run('worklist-without-visited-set', rule, {
  valid: [
    {
      filename,
      code: `
        const visited = new Set<string>();
        const queue = [start];
        while (queue.length > 0) {
          const item = queue.shift()!;
          if (visited.has(item)) continue;
          visited.add(item);
          queue.push(...getDeps(item));
        }
      `,
    },
    {
      filename,
      code: `
        const seen = new WeakSet<object>();
        const pending = [root];
        for (const item of pending) {
          for (const next of getNeighbors(item)) {
            if (!seen.has(next)) {
              seen.add(next);
              pending.push(next);
            }
          }
        }
      `,
    },
    {
      filename,
      code: `
        const visited: Record<string, boolean> = {};
        const queue = [start];
        while (queue.length > 0) {
          const id = queue.shift()!;
          if (visited[id]) continue;
          visited[id] = true;
          queue.push(...edges[id]);
        }
      `,
    },
    {
      filename,
      code: `
        const queue = [root];
        while (queue.length > 0) {
          const node = queue.shift()!;
          if (node.visited) continue;
          node.visited = true;
          queue.push(...node.neighbors);
        }
      `,
    },
    {
      filename,
      code: `
        const visited: Record<string, boolean> = {};
        const queue = [start];
        while (queue.length > 0) {
          const id = queue.shift()!;
          if (id in visited) continue;
          visited[id] = true;
          queue.push(...edges[id]);
        }
      `,
    },
    {
      filename,
      code: `
        const queue = [head];
        while (queue.length > 0) {
          const cur = queue.shift()!;
          if (cur.next) {
            queue.push(cur.next);
          }
        }
      `,
    },
    {
      filename,
      code: `
        const queue = [root];
        while (queue.length > 0) {
          const cur = queue.pop()!;
          if (cur.preferLeft) {
            queue.push(cur.left);
          } else {
            queue.push(cur.right);
          }
        }
      `,
    },
    {
      filename,
      code: `
        const queue = [root];
        while (queue.length > 0) {
          const node = queue.shift()!;
          queue.push(...node.getChildren());
        }
      `,
    },
    {
      filename,
      code: `
        const pending = [root];
        for (const node of pending) {
          pending.push(...node.children);
        }
      `,
    },
    {
      filename,
      code: `
        const stack = [root];
        while (stack.length > 0) {
          const node = stack.pop()!;
          ts.forEachChild(node, (child) => {
            stack.push(child);
          });
        }
      `,
    },
    {
      filename,
      code: `
        const pending = [root];
        for (const node of pending) {
          for (const key of visitorKeys[node.type] ?? []) {
            pending.push(node[key]);
          }
        }
      `,
    },
    {
      filename,
      code: `
        const queue: ts.Node[] = [root];
        while (queue.length > 0) {
          const node = queue.shift()!;
          for (const next of extractNodes(node)) {
            queue.push(next);
          }
        }
      `,
    },
    {
      filename,
      code: `
        const result: string[] = [];
        for (const item of items) {
          result.push(...expand(item));
        }
      `,
    },
    {
      filename,
      code: `
        const queue = [start];
        while (queue.length > 0) {
          if (done()) break;
          queue.push(...extra);
        }
      `,
    },
    {
      filename: '/repo/src/graph/traverse.test.ts',
      code: `
        const pending = [start];
        for (const item of pending) {
          pending.push(...getDeps(item));
        }
      `,
    },
  ],
  invalid: [
    {
      filename,
      code: `
        const pending = [start];
        for (const item of pending) {
          pending.push(...getDeps(item));
        }
      `,
      errors: [ERROR],
    },
    {
      filename,
      code: `
        const pending = [start];
        for (const item of pending) {
          pending.unshift(...getDeps(item));
        }
      `,
      errors: [ERROR],
    },
    {
      filename,
      code: `
        const pending = [start];
        for (const item of pending) {
          for (const dep of getDeps(item)) {
            pending.push(dep);
          }
        }
      `,
      errors: [ERROR],
    },
    {
      filename,
      code: `
        const pending = [start];
        for (const item of pending) {
          getDeps(item).forEach((dep) => {
            pending.push(dep);
          });
        }
      `,
      errors: [ERROR],
    },
    {
      filename,
      code: `
        const queue = [start];
        while (queue.length > 0) {
          const cur = queue.shift()!;
          queue.push(...neighbors(cur));
        }
      `,
      errors: [ERROR],
    },
    {
      filename,
      code: `
        const queue = [{ node: root, depth: 0 }];
        while (queue.length) {
          const cur = queue.pop()!;
          if (cur.depth >= 5) continue;
          for (const next of cur.node.edges) {
            queue.push({ node: next, depth: cur.depth + 1 });
          }
        }
      `,
      errors: [ERROR],
    },
    {
      filename,
      code: `
        const queue = [root];
        while (queue.length > 0) {
          const cur = queue.shift()!;
          if (cur.left) queue.push(cur.left);
          if (cur.right) queue.push(cur.right);
        }
      `,
      errors: [ERROR],
    },
    {
      filename,
      code: `
        const queue = [start];
        let steps = 0;
        while (queue.length > 0 && steps < 100) {
          const cur = queue.shift()!;
          steps += 1;
          queue.push(cur.first, cur.second);
        }
      `,
      errors: [ERROR],
    },
    {
      filename,
      code: `
        const queue = [root];
        while (queue.length > 0) {
          const node = queue.shift()!;
          node.visited = true;
          queue.push(...node.neighbors);
        }
      `,
      errors: [ERROR],
    },
  ],
});
