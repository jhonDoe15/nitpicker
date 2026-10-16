import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lintWithOxlint } from '../oxlint-runner.mjs';

export function lintProject({ policy, sources, patterns = ['src/**/*.ts'] }) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-test-')));
  writeFileSync(path.join(root, 'policy.mjs'), policy);
  for (const [relativePath, text] of Object.entries(sources)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), text);
  }
  const results = lintWithOxlint({
    options: { projectRoot: root, patterns },
    environment: {
      ...process.env,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
    },
    runEslintCli: () => {
      throw new Error('no rule needs ESLint here');
    },
  });
  return { root, results };
}

export function removeProject({ root }) {
  rmSync(root, { recursive: true, force: true });
}

export function messagesOf({ root, results }, relativePath, fields) {
  const result = results.find((entry) => entry.filePath === path.join(root, relativePath));
  return (result?.messages ?? []).map((message) =>
    Object.fromEntries(fields.map((field) => [field, message[field]])),
  );
}
