import v8Coverage from '@vitest/coverage-v8';
import type { CoverageProviderModule } from 'vitest/node';
import { fieldOf } from '../../shared/values/readers.mts';

type Range = { readonly startOffset: number; readonly endOffset: number };

export type ScriptCoverage = {
  readonly url: string;
  readonly startOffset: number;
  readonly functions: readonly { readonly ranges: readonly Range[] }[];
};

type TakenCoverage = { readonly result: readonly ScriptCoverage[] };

type V8Coverage = Omit<CoverageProviderModule, 'getProvider'> & {
  readonly getProvider: () => object | Promise<object>;
};

type RuntimeOptions = Parameters<NonNullable<CoverageProviderModule['takeCoverage']>>[0];

export function ranInsideVitest({ startOffset, functions }: ScriptCoverage): boolean {
  const [script, ...bodies] = functions.flatMap(({ ranges }) => ranges.slice(0, 1));
  return bodies.some(
    (body) => body.startOffset < startOffset && body.endOffset === script?.endOffset,
  );
}

function scriptLength({ functions }: ScriptCoverage): number | undefined {
  return functions[0]?.ranges[0]?.endOffset;
}

export function oneVersionEach(scripts: readonly ScriptCoverage[]): ScriptCoverage[] {
  const byUrl = Map.groupBy(scripts, (script) => script.url);
  return scripts.filter((script) => new Set(byUrl.get(script.url)?.map(scriptLength)).size === 1);
}

function isTakenCoverage(taken: unknown): taken is TakenCoverage {
  return Array.isArray(fieldOf(taken, 'result'));
}

export function vitestScriptsOnly(taken: unknown): unknown {
  return isTakenCoverage(taken)
    ? { ...taken, result: oneVersionEach(taken.result.filter((script) => ranInsideVitest(script))) }
    : taken;
}

export function vitestScriptsProvider(v8: V8Coverage): V8Coverage {
  return {
    ...v8,
    async getProvider(): Promise<object> {
      return Object.assign(await v8.getProvider(), { name: 'custom' });
    },
    async takeCoverage(options: RuntimeOptions): Promise<unknown> {
      return vitestScriptsOnly(await v8.takeCoverage?.(options));
    },
  };
}

export default vitestScriptsProvider(v8Coverage);
