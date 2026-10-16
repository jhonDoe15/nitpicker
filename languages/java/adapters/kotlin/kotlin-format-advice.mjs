import { ktlintDefaults } from './kotlin-style-files.mjs';

function optIn(tool) {
  return `"tools": { "${tool}": { "precedence": ["project", "nitpicker"] } }`;
}

function ktfmtAdvice(tools) {
  const flags = [
    `--${tools.ktfmtStyle}-style`,
    ...(tools.ktfmtEditorconfig ? ['--enable-editorconfig'] : []),
  ].join(' ');
  return tools.ktfmtEditorconfig
    ? `Nitpicker checks with ktfmt ${flags}, so your build's ktfmt style and .editorconfig apply. Format with: ktfmt ${flags}.`
    : `Nitpicker checks with ktfmt ${flags} and ignores your build's ktfmt style and .editorconfig. Format with: ktfmt ${flags}. To use yours instead, add ${optIn('ktfmt')} to nitpicker.config.json.`;
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

function ktlintAdvice(tools, conventions) {
  const settings = ktlintSettings(conventions);
  return tools.projectEditorconfig === undefined
    ? (ruleSwitch) =>
        `Nitpicker runs ktlint with ${settings} and ignores your .editorconfig. To lift this rule, set ${ruleSwitch} = disabled in .editorconfig and add ${optIn('ktlint')} to nitpicker.config.json.`
    : (ruleSwitch) =>
        `Nitpicker runs ktlint with your .editorconfig, and with ${settings} where it sets nothing. Lift this rule: ${ruleSwitch} = disabled in .editorconfig.`;
}

function detektAdvice(tools) {
  return tools.detektIgnored === undefined
    ? undefined
    : `Nitpicker runs detekt without your ${tools.detektIgnored}. If it turns this rule off, add ${optIn('detekt')} to nitpicker.config.json.`;
}

export function kotlinFormatAdvice(tools, conventions) {
  return {
    ktfmt: ktfmtAdvice(tools),
    ktlint: ktlintAdvice(tools, conventions),
    detekt: detektAdvice(tools),
  };
}
