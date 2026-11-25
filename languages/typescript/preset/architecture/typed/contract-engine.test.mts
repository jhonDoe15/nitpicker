import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { nativeCompilerPath } from '../../../adapters/typed-engine/compiler-binary.mts';
import { analyzePublicContractUsage } from '../public-contract-usage.mts';
import { engineUnusedMethods } from './contract-engine.mts';

const PROJECT = path.resolve(
  import.meta.dirname,
  '../../../../../engine/tests/fixtures/typescript-typed/contracts/tsconfig.json',
);
const NODE_ONLY = { ...process.env, NITPICKER_TYPED_ENGINE: 'off' };
const ENGINE = { ...process.env, NITPICKER_TYPED_ENGINE: 'required' };
const hasEngine = findEngine(process.env) !== undefined && nativeCompilerPath() !== undefined;

function writeWorkspace(files: Readonly<Record<string, string>>): {
  readonly root: string;
  readonly tsconfig: string;
} {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-contract-engine-'));
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return { root, tsconfig: path.join(root, 'tsconfig.json') };
}

const WORKSPACE_FILES = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'es2022',
      module: 'esnext',
      moduleResolution: 'bundler',
      strict: true,
      noEmit: true,
    },
    include: ['packages'],
  }),
  'packages/alpha/port.ts':
    'export interface AlphaPort { usedByBeta(): void; unused(): void; }\n' +
    'export class AlphaImpl implements AlphaPort { usedByBeta() {} unused() {} }\n',
  'packages/alpha/cross.ts':
    "import type { BetaPort } from '../beta/port';\n" +
    'export class AlphaImplementsBeta implements BetaPort { alsoUnused() {} }\n',
  'packages/beta/port.ts':
    'export interface BetaPort { alsoUnused(): void; }\n' +
    'export class BetaImpl implements BetaPort { alsoUnused() {} }\n',
  'packages/beta/consumer.ts':
    "import { AlphaImpl } from '../alpha/port';\nnew AlphaImpl().usedByBeta();\n",
  'packages/gamma/plain.ts': 'export function helper(): number { return 1; }\n',
};

it('leaves the check to the compiler in this process when the engine is switched off', () => {
  expect(engineUnusedMethods(PROJECT, NODE_ONLY)).toBeUndefined();
});

it('leaves the check to the compiler in this process when the project cannot be read', () => {
  const missing = path.join(path.dirname(PROJECT), 'missing', 'tsconfig.json');

  expect(engineUnusedMethods(missing, process.env)).toBeUndefined();
});

it('skips the engine when no file under the own root has an implements clause', () => {
  const { root, tsconfig } = writeWorkspace(WORKSPACE_FILES);
  try {
    const findings = analyzePublicContractUsage(tsconfig, {
      displayRoot: path.join(root, 'packages', 'gamma'),
      environment: { NITPICKER_ENGINE: 'off', NITPICKER_TYPED_ENGINE: 'required' },
    });

    expect(findings).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it.runIf(hasEngine)('reports through the engine what the compiler in this process reports', () => {
  const viaEngine = engineUnusedMethods(PROJECT, ENGINE);

  expect(viaEngine?.findings).toEqual(
    analyzePublicContractUsage(PROJECT, { environment: NODE_ONLY }),
  );
  expect(viaEngine?.findings.map(({ contract, method }) => `${contract}.${method}`)).toEqual([
    'Clock.sleep',
    'Store.__reset',
    'Store.onChange',
    'Store.remove',
    'Ticker.stop',
  ]);
  expect(
    analyzePublicContractUsage(PROJECT, {
      displayRoot: path.dirname(PROJECT),
      environment: ENGINE,
    }),
  ).toEqual(
    analyzePublicContractUsage(PROJECT, {
      displayRoot: path.dirname(PROJECT),
      environment: NODE_ONLY,
    }),
  );
});

it.runIf(hasEngine)(
  'matches the Node check on a workspace package whose own root is narrower than the source root',
  () => {
    const { root, tsconfig } = writeWorkspace(WORKSPACE_FILES);
    try {
      const alpha = path.join(root, 'packages', 'alpha');
      const viaEngine = analyzePublicContractUsage(tsconfig, {
        displayRoot: alpha,
        environment: ENGINE,
      });
      const viaNode = analyzePublicContractUsage(tsconfig, {
        displayRoot: alpha,
        environment: NODE_ONLY,
      });

      expect(viaEngine).toEqual(viaNode);
      expect(viaEngine).toEqual([{ file: 'port.ts', contract: 'AlphaPort', method: 'unused' }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
