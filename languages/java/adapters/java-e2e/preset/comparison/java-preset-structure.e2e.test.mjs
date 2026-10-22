import { describe, it, expect } from 'vitest';
import { useJavaPresetProject, enabled } from '../../__tests__/java-preset-project.mjs';

describe.skipIf(!enabled)('Java preset end to end', () => {
  const fixture = useJavaPresetProject();
  it('fails a new method over the nesting limit and keeps the legacy wide method baselined', () => {
    const result = fixture.diffOf('structure-new');

    expect(result.failed).toBe(true);
    expect(fixture.structureOf(result.newEnforceable)).toEqual([
      'function-control-nesting-limit Wide.deep',
      'function-control-nesting-limit Wide.nested',
    ]);
    expect(
      result.newEnforceable
        .filter((finding) => finding.tool === 'structure')
        .map(({ message }) => message),
    ).toEqual([
      'Wide.deep nests control flow 3 deep (limit 2). Return early instead of nesting. If this is intended, add {"rule":"function-control-nesting-limit","paths":["src/main/java/demo/Wide.java"],"function":"Wide.deep","reason":"..."} to "exceptions" in nitpicker.config.json.',
      'Wide.nested nests control flow 3 deep (limit 2). Return early instead of nesting. If this is intended, add {"rule":"function-control-nesting-limit","paths":["src/main/java/demo/Wide.java"],"function":"Wide.nested","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
    expect(fixture.structureOf(result.unchangedFindings)).toEqual([
      'function-parameters-limit Wide.sum',
    ]);
  }, 180_000);
  it('keeps a method over the parameter limit baselined when its line moves', () => {
    const result = fixture.diffOf('structure-moved');

    expect(fixture.structureOf(result.newFindings)).toEqual([]);
    expect(fixture.structureOf(result.unchangedFindings)).toEqual([
      'function-parameters-limit Wide.sum',
    ]);
  }, 180_000);
});
