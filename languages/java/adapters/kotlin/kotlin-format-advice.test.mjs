import { describe, expect, it } from 'vitest';
import { kotlinFormatAdvice } from './kotlin-format-advice.mjs';

const OPT_IN = (tool) =>
  `"tools": { "${tool}": { "precedence": ["project", "nitpicker"] } } to nitpicker.config.json`;

describe('the advice on a ktfmt finding', () => {
  it('names the flag and the route to the build style and .editorconfig', () => {
    const { ktfmt } = kotlinFormatAdvice(
      { ktfmtStyle: 'kotlinlang', ktfmtEditorconfig: false },
      {},
    );

    expect(ktfmt).toBe(
      "Nitpicker checks with ktfmt --kotlinlang-style and ignores your build's ktfmt style and .editorconfig. " +
        `Format with: ktfmt --kotlinlang-style. To use yours instead, add ${OPT_IN('ktfmt')}.`,
    );
  });

  it('names both flags once the project is listed', () => {
    const { ktfmt } = kotlinFormatAdvice({ ktfmtStyle: 'google', ktfmtEditorconfig: true }, {});

    expect(ktfmt).toBe(
      "Nitpicker checks with ktfmt --google-style --enable-editorconfig, so your build's ktfmt style and .editorconfig apply. " +
        'Format with: ktfmt --google-style --enable-editorconfig.',
    );
  });
});

describe('the advice on a ktlint finding', () => {
  const RULE = 'ktlint_standard_indent';

  it('names the settings it runs with and how to lift the rule', () => {
    const { ktlint } = kotlinFormatAdvice(
      { ktfmtStyle: 'meta' },
      { 'kotlin.indentation': '2', 'kotlin.trailingCommas': 'never' },
    );

    expect(ktlint(RULE)).toBe(
      'Nitpicker runs ktlint with indent_size = 2, ij_kotlin_allow_trailing_comma = false, ij_kotlin_allow_trailing_comma_on_call_site = false and ignores your .editorconfig. ' +
        `To lift this rule, set ${RULE} = disabled in .editorconfig and add ${OPT_IN('ktlint')}.`,
    );
  });

  it('says it runs with ktlint defaults when nothing is followed', () => {
    expect(kotlinFormatAdvice({}, {}).ktlint(RULE)).toBe(
      "Nitpicker runs ktlint with ktlint's defaults and ignores your .editorconfig. " +
        `To lift this rule, set ${RULE} = disabled in .editorconfig and add ${OPT_IN('ktlint')}.`,
    );
  });

  it('reads the .editorconfig once the project is listed', () => {
    const { ktlint } = kotlinFormatAdvice(
      { projectEditorconfig: 'indent_size = 8\n' },
      { 'kotlin.indentation': '2' },
    );

    expect(ktlint(RULE)).toBe(
      'Nitpicker runs ktlint with your .editorconfig, and with indent_size = 2 where it sets nothing. ' +
        `Lift this rule: ${RULE} = disabled in .editorconfig.`,
    );
  });
});

describe('the advice on a detekt finding', () => {
  it('names the config that was left out and the opt-in', () => {
    expect(kotlinFormatAdvice({ detektIgnored: 'config/detekt/detekt.yml' }, {}).detekt).toBe(
      `Nitpicker runs detekt without your config/detekt/detekt.yml. If it turns this rule off, add ${OPT_IN('detekt')}.`,
    );
  });

  it('has none without a project config or once it is used', () => {
    expect(kotlinFormatAdvice({}, {}).detekt).toBeUndefined();
  });
});
