import { describe, expect, it } from 'vitest';
import { kotlinFormatAdvice, kotlinSummary } from './kotlin-format-advice.mjs';

const OPT_IN = (tool) => `"tools": { "${tool}": { "precedence": ["project", "nitpicker"] } }`;

describe('the advice on the findings', () => {
  it('sends a ktfmt finding to the command printed at the start of the run', () => {
    expect(kotlinFormatAdvice({}).ktfmt).toBe(
      'Format it with the "Format with ktfmt" command printed at the start of the run.',
    );
  });

  it('names the switch of a ktlint rule and when nitpicker reads the .editorconfig', () => {
    expect(kotlinFormatAdvice({}).ktlint('ktlint_standard_indent')).toBe(
      'Lift this rule with ktlint_standard_indent = disabled in .editorconfig, which nitpicker reads only when ktlint lists "project" (see the start of the run).',
    );
  });

  it('names the detekt config that was left out, and has no advice without one', () => {
    expect(kotlinFormatAdvice({ detektIgnored: 'config/detekt/detekt.yml' }).detekt).toBe(
      'Nitpicker runs detekt without your config/detekt/detekt.yml (see the start of the run).',
    );
    expect(kotlinFormatAdvice({}).detekt).toBeUndefined();
  });
});

describe('the summary lines of the run', () => {
  it('prints the ktfmt command with every flag, once', () => {
    expect(kotlinSummary({ formatter: 'ktfmt', ktfmtStyle: 'kotlinlang' }, {})).toEqual([
      'Format with ktfmt: ktfmt --kotlinlang-style <Kotlin files>',
    ]);
    expect(
      kotlinSummary({ formatter: 'ktfmt', ktfmtStyle: 'google', ktfmtEditorconfig: true }, {}),
    ).toEqual(['Format with ktfmt: ktfmt --google-style --enable-editorconfig <Kotlin files>']);
  });

  it('says what ktfmt ignores only when the project has it', () => {
    const tools = { formatter: 'ktfmt', ktfmtStyle: 'meta' };

    expect(kotlinSummary({ ...tools, editorconfigIgnored: true }, {})[1]).toBe(
      `Ignoring .editorconfig; opt in with ${OPT_IN('ktfmt')}`,
    );
    expect(kotlinSummary({ ...tools, ktfmtBuildStyleIgnored: true }, {})[1]).toBe(
      `Ignoring the ktfmt style of your build file; opt in with ${OPT_IN('ktfmt')}`,
    );
    expect(
      kotlinSummary({ ...tools, editorconfigIgnored: true, ktfmtBuildStyleIgnored: true }, {})[1],
    ).toBe(
      `Ignoring .editorconfig and the ktfmt style of your build file; opt in with ${OPT_IN('ktfmt')}`,
    );
  });

  it('names the settings ktlint runs with, and the .editorconfig it ignores if there is one', () => {
    const conventions = { 'kotlin.indentation': '2', 'kotlin.trailingCommas': 'never' };

    expect(kotlinSummary({ formatter: 'ktlint' }, conventions)).toEqual([
      'ktlint runs with indent_size = 2, ij_kotlin_allow_trailing_comma = false, ij_kotlin_allow_trailing_comma_on_call_site = false',
    ]);
    expect(kotlinSummary({ formatter: 'ktlint' }, {})).toEqual([
      "ktlint runs with ktlint's defaults",
    ]);
    expect(kotlinSummary({ formatter: 'ktlint', editorconfigIgnored: true }, {})).toEqual([
      "ktlint runs with ktlint's defaults",
      `Ignoring .editorconfig; opt in with ${OPT_IN('ktlint')}`,
    ]);
  });

  it('says ktlint reads the .editorconfig files once the project is listed', () => {
    expect(
      kotlinSummary(
        { formatter: 'ktlint', editorconfigFiles: ['/p/.editorconfig'] },
        {
          'kotlin.indentation': '2',
        },
      ),
    ).toEqual([
      'ktlint reads your .editorconfig files, and uses indent_size = 2 where they set nothing',
    ]);
  });

  it('names the detekt config that is left out, and nothing when it is used or absent', () => {
    expect(kotlinSummary({ formatter: 'none', detektIgnored: 'detekt.yml' }, {})).toEqual([
      `Ignoring detekt.yml; opt in with ${OPT_IN('detekt')}`,
    ]);
    expect(kotlinSummary({ formatter: 'none' }, {})).toEqual([]);
  });
});
