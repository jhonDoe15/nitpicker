import { describe, expect, it } from 'vitest';
import { memoryScaleOf, withSizeScales } from './memory-scales.mts';

describe('TypeScript analyzer memory scales', () => {
  it('counts native tsgo server base memory and per-file growth for program-holding analyzers', () => {
    expect(memoryScaleOf('typescript-typecheck')).toMatchObject({
      baseMegabytes: 1600,
      perThousandFilesMegabytes: 1280,
    });
    expect(memoryScaleOf('structure')).toMatchObject({
      baseMegabytes: 1600,
      perThousandFilesMegabytes: 1000,
    });
    expect(memoryScaleOf('eslint-lint')).toMatchObject({
      baseMegabytes: 1600,
      perThousandFilesMegabytes: 1024,
    });
    expect(memoryScaleOf('coding-standards')).toMatchObject({
      baseMegabytes: 1600,
      perThousandFilesMegabytes: 60,
    });
  });

  it('attaches tsconfig program roots to analyzers that load a full TypeScript program', () => {
    expect(typeof memoryScaleOf('typescript-typecheck')?.roots).toBe('function');
    expect(typeof memoryScaleOf('structure')?.roots).toBe('function');
    expect(memoryScaleOf('coupling')?.roots).toBeUndefined();
    expect(memoryScaleOf('coupling')?.baseMegabytes).toBeUndefined();
    expect(memoryScaleOf('unknown-analyzer')).toBeUndefined();
  });

  it('attaches memoryScale and timeoutScale program roots through withSizeScales', () => {
    const analyzer: {
      readonly name: string;
      timeoutScale?: {
        perThousandFilesMs: number;
        extensions: string[];
        roots?: (projectRoot: string) => readonly string[];
      };
      memoryScale?: Exclude<ReturnType<typeof memoryScaleOf>, undefined>;
    } = {
      name: 'structure',
      timeoutScale: { perThousandFilesMs: 120_000, extensions: ['ts'] },
    };
    const scaled = withSizeScales(analyzer);

    expect(scaled.memoryScale?.baseMegabytes).toBe(1600);
    expect(scaled.memoryScale?.perThousandFilesMegabytes).toBe(1000);
    expect(typeof scaled.memoryScale?.roots).toBe('function');
    expect(typeof scaled.timeoutScale?.roots).toBe('function');
  });
});
