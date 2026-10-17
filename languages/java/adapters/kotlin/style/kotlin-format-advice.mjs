import { ignoredConfigNotice } from '../../../../../shared/conventions/tool-precedence.mjs';
import { ktlintDefaults } from './kotlin-style-files.mjs';

function ktfmtLines(tools) {
  const flags = [
    `--${tools.ktfmtStyle}-style`,
    ...(tools.ktfmtEditorconfig ? ['--enable-editorconfig'] : []),
  ].join(' ');
  const ignored = [
    ...(tools.editorconfigIgnored ? ['.editorconfig'] : []),
    ...(tools.ktfmtBuildStyleIgnored ? ['the ktfmt style of your build file'] : []),
  ];
  return [
    `Format with ktfmt: ktfmt ${flags} <Kotlin files>`,
    ...(ignored.length === 0 ? [] : [ignoredConfigNotice(ignored.join(' and '), 'ktfmt')]),
  ];
}

function ktlintSettings(conventions) {
  const defaults = ktlintDefaults(conventions);
  return defaults === undefined
    ? "ktlint's defaults"
    : defaults
        .split('\n')
        .filter((line) => line !== '' && !line.startsWith('['))
        .join(', ');
}

function ktlintLines(tools, conventions) {
  const settings = ktlintSettings(conventions);
  if (tools.editorconfigFiles !== undefined) {
    return [`ktlint reads your .editorconfig files, and uses ${settings} where they set nothing`];
  }
  return [
    `ktlint runs with ${settings}`,
    ...(tools.editorconfigIgnored ? [ignoredConfigNotice('.editorconfig', 'ktlint')] : []),
  ];
}

function detektLines(tools) {
  return tools.detektIgnored === undefined
    ? []
    : [ignoredConfigNotice(tools.detektIgnored, 'detekt')];
}

export function kotlinSummary(tools, conventions) {
  const formatter = tools.formatter === 'ktfmt' ? ktfmtLines(tools) : [];
  return [
    ...formatter,
    ...(tools.formatter === 'ktlint' ? ktlintLines(tools, conventions) : []),
    ...detektLines(tools),
  ];
}

export function kotlinFormatAdvice(tools) {
  return {
    ktfmt: 'Format it with the "Format with ktfmt" command printed at the start of the run.',
    ktlint: (ruleSwitch) =>
      `Lift this rule with ${ruleSwitch} = disabled in .editorconfig, which nitpicker reads only when ktlint lists "project" (see the start of the run).`,
    detekt:
      tools.detektIgnored === undefined
        ? undefined
        : `Nitpicker runs detekt without your ${tools.detektIgnored} (see the start of the run).`,
  };
}
