import { describe, expect, it } from 'vitest';
import { finding } from '../test-support/report-builders.mjs';
import {
  annotationLines,
  escapeData,
  escapeProperty,
  MAX_ANNOTATIONS,
  workflowCommand,
} from './workflow-commands.mjs';

describe('workflow command escaping', () => {
  it('escapes percent signs and line breaks in data', () => {
    expect(escapeData('100% done\r\nnext\nline: a,b')).toBe('100%25 done%0D%0Anext%0Aline: a,b');
  });

  it('also escapes colons and commas in properties', () => {
    expect(escapeProperty('a:b,c%d\ne')).toBe('a%3Ab%2Cc%25d%0Ae');
  });

  it('writes the properties in order and leaves out the empty ones', () => {
    expect(
      workflowCommand('error', { file: 'a,b.js', line: 3, col: undefined, title: '' }, 'x'),
    ).toBe('::error file=a%2Cb.js,line=3::x');
    expect(workflowCommand('notice', {}, 'x')).toBe('::notice::x');
  });

  it('cannot start a second command from a message', () => {
    const line = workflowCommand('error', {}, 'first\n::error::injected');
    expect(line).toBe('::error::first%0A::error::injected');
    expect(line).not.toContain('\n');
  });
});

describe('annotationLines', () => {
  it('annotates a finding at its repository path, line and column', () => {
    const lines = annotationLines({
      findings: [finding({ message: 'Unexpected: 100%\nsecond line' })],
      toolErrors: [],
      projectPrefix: 'web/app/',
    });

    expect(lines).toEqual([
      '::error file=web/app/src/a.js,line=12,col=3,title=eslint/no-console::Unexpected: 100%25%0Asecond line',
    ]);
  });

  it('annotates a finding without a location or path by its title only', () => {
    const lines = annotationLines({
      findings: [finding({ location: undefined, path: '' })],
      toolErrors: [],
      projectPrefix: '',
    });

    expect(lines).toEqual(['::error title=eslint/no-console::Unexpected console statement']);
  });

  it('puts tool errors first, one line each, with a title', () => {
    const lines = annotationLines({
      findings: [finding()],
      toolErrors: [{ tool: 'knip', snapshot: 'head', message: 'boom\nstack' }],
      projectPrefix: '',
    });

    expect(lines[0]).toBe('::error title=nitpicker tool error%3A knip (head)::boom stack');
    expect(lines).toHaveLength(2);
  });

  it('caps the annotations and says how many were left out', () => {
    const findings = Array.from({ length: 14 }, (_, index) =>
      finding({ identity: `f${String(index)}`, path: `src/f${String(index)}.js` }),
    );

    const lines = annotationLines({
      findings,
      toolErrors: Array.from({ length: 4 }, () => ({ tool: 'knip', message: 'boom' })),
      projectPrefix: '',
    });

    expect(lines.filter((line) => line.startsWith('::error'))).toHaveLength(MAX_ANNOTATIONS);
    expect(lines.at(-1)).toBe(
      '::notice title=nitpicker::8 more problems are not annotated ' +
        '(GitHub shows at most 10 error annotations per step). ' +
        'See the job summary and the report files.',
    );
    expect(lines).toHaveLength(MAX_ANNOTATIONS + 1);
  });

  it('writes nothing when there is nothing to report', () => {
    expect(annotationLines({ findings: [], toolErrors: [], projectPrefix: '' })).toEqual([]);
  });

  it('shortens a very long message', () => {
    const [line] = annotationLines({
      findings: [finding({ message: 'x'.repeat(5000) })],
      toolErrors: [],
      projectPrefix: '',
    });

    expect(line.length).toBeLessThan(1200);
    expect(line.endsWith('...')).toBe(true);
  });
});
