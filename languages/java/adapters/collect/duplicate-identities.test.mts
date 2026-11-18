import { describe, expect, it } from 'vitest';
import { withoutDuplicateIdentities } from './duplicate-identities.mts';

const metric = (message: string) => ({
  tool: 'coupling',
  rule: 'module-coupling',
  path: 'src/main/java/index/Codec.java',
  identity: 'module:fanIn',
  message,
  classification: 'descriptive',
});

describe('withoutDuplicateIdentities', () => {
  it('keeps the first finding of a repeated identity and warns about the rest', () => {
    const warnings: string[] = [];
    const other = { ...metric('fanOut'), identity: 'module:fanOut' };

    const kept = withoutDuplicateIdentities(
      [metric('first'), metric('second'), other],
      'base',
      (message) => warnings.push(message),
    );

    expect(kept.map((finding) => finding.message)).toEqual(['first', 'fanOut']);
    expect(warnings).toEqual([
      'base: left 1 finding of coupling/module-coupling at src/main/java/index/Codec.java out of the ' +
        'comparison because each repeated the identity of another finding.',
    ]);
  });

  it('changes nothing when every identity is distinct', () => {
    const warnings: string[] = [];
    const findings = [metric('one'), { ...metric('two'), path: 'src/main/java/index/Other.java' }];

    expect(
      withoutDuplicateIdentities(findings, 'head', (message) => warnings.push(message)),
    ).toEqual(findings);
    expect(warnings).toEqual([]);
  });
});
