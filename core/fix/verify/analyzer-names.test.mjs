import { describe, expect, it } from 'vitest';
import { createJavaAnalyzer } from '../../../languages/java/adapters/java-analyzer.mjs';
import {
  PYTHON_ANALYZER_NAME,
  createPythonAnalyzers,
} from '../../../languages/python/adapters/python-analyzer.mjs';
import { configuredAnalyzers } from '../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { analyzersToVerify } from './analyzer-names.mjs';

describe('analyzersToVerify', () => {
  it('picks the analyzers that report the fixed tools and the compile check', () => {
    const analyzers = [
      { name: 'lint', reportedTools: ['style'] },
      { name: 'compiler', reportedTools: ['build'] },
      { name: 'other', reportedTools: ['x'] },
    ];
    expect(analyzersToVerify(analyzers, ['style', 'missing'])).toEqual({
      names: ['lint', 'compiler'],
      unmatched: ['missing'],
    });
  });

  it('matches a tool by the analyzer name', () => {
    expect(analyzersToVerify([{ name: 'coding-standards' }], ['coding-standards']).names).toEqual([
      'coding-standards',
    ]);
  });

  it('selects the type check analyzer of the TypeScript preset', () => {
    const { names } = analyzersToVerify(configuredAnalyzers(), ['coding-standards']);
    expect(
      names.filter((name) => ['typescript-typecheck', 'coding-standards'].includes(name)),
    ).toEqual(['typescript-typecheck', 'coding-standards']);
  });

  it.each([
    ['java', createJavaAnalyzer(), 'checkstyle'],
    ['kotlin', createJavaAnalyzer({ kotlin: true }), 'detekt'],
  ])('selects the %s analyzer, which compiles the project', (name, analyzer, tool) => {
    expect(analyzersToVerify([analyzer], [tool])).toEqual({ names: [name], unmatched: [] });
  });

  it('selects the Python analyzer, which runs the type checker', () => {
    const { names, unmatched } = analyzersToVerify(createPythonAnalyzers({}), ['ruff']);
    expect(names).toEqual([PYTHON_ANALYZER_NAME]);
    expect(unmatched).toEqual([]);
  });
});
