import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { resolveHeadPolicy, withHeadPolicyFile } from '../../typescript/preset/head-policy.mjs';

const rulesModule = new URL(
  '../../typescript/preset/architecture/strict-boundary-rules.mjs',
  import.meta.url,
).href;
const PRINT_COMMENTS = `const { strictBoundaryRules } = await import(${JSON.stringify(rulesModule)});
console.log(JSON.stringify(strictBoundaryRules.filter(({ name }) => name.includes('index') || name.includes('internals')).map(({ comment }) => comment)));`;

function boundaryComments(config) {
  return withHeadPolicyFile(resolveHeadPolicy(config), (policyFile) =>
    JSON.parse(
      execFileSync(process.execPath, ['--input-type=module', '-e', PRINT_COMMENTS], {
        encoding: 'utf8',
        env: { ...process.env, NITPICKER_POLICY: policyFile },
      }),
    ),
  );
}

describe('the public index named in the boundary messages', () => {
  it('is index.js for a JavaScript project', () => {
    const comments = boundaryComments({ preset: 'javascript' });

    expect(comments).toHaveLength(2);
    for (const comment of comments) {
      expect(comment).toContain('public index.js or index.mjs (src/main/features/<name>/index.js)');
      expect(comment).not.toContain('index.ts');
    }
  });

  it('is index.ts for a TypeScript project', () => {
    for (const comment of boundaryComments({})) {
      expect(comment).toContain('public index.ts (src/main/features/<name>/index.ts)');
    }
  });
});
