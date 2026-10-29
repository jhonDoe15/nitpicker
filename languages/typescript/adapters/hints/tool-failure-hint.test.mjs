import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  explainedError,
  troubleshootingUrl,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';
import { PEER_TOOLS, typescriptFailureText } from './tool-failure-hint.mjs';

const manifest = JSON.parse(
  readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'),
);

describe('typescriptFailureText', () => {
  it('knows every peer dependency of the package', () => {
    expect(PEER_TOOLS).toEqual(Object.keys(manifest.peerDependencies).toSorted());
  });

  it('links a tool that exits with an error to the TypeScript tool entry', () => {
    expect(typescriptFailureText(new Error('prettier exited with 2: boom'))).toBe(
      `prettier exited with 2: boom. See ${troubleshootingUrl('a-typescript-or-javascript-tool-fails')}`,
    );
  });

  it.each([
    "Cannot find package 'vitest' imported from /p/vitest.config.ts",
    "Cannot find package '@vitest/coverage-v8' imported from /p/node_modules/vitest/dist/x.js",
    "Cannot find module 'typescript/lib/tsserverlibrary.js' imported from /p/a.mjs",
  ])('links a peer that node_modules lacks to the missing-peer entry: %s', (message) => {
    expect(typescriptFailureText(new Error(message))).toBe(
      `${message}. See ${troubleshootingUrl('a-peer-tool-is-missing')}`,
    );
  });

  it('treats a package that is not a peer as a failure of the tool', () => {
    const message = "Cannot find package 'left-pad' imported from /p/src/a.ts";

    expect(typescriptFailureText(new Error(message))).toBe(
      `${message}. See ${troubleshootingUrl('a-typescript-or-javascript-tool-fails')}`,
    );
  });

  it('keeps a message that explains itself or already has a link', () => {
    const linked = withTroubleshooting('Base install failed', 'unsupported-yarn-setup');

    expect(typescriptFailureText(explainedError('Run `npm install` first.'))).toBe(
      'Run `npm install` first.',
    );
    expect(typescriptFailureText(new Error(linked))).toBe(linked);
  });
});
