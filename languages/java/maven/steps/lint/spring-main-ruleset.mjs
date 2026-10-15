import path from 'node:path';

function escapeXml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function quotePattern(text) {
  return `\\Q${text.replaceAll('\\E', '\\E\\\\E\\Q')}\\E`;
}

export function springOnMainSources(springRuleset, testDirectories) {
  const excludes = testDirectories.map(
    (directory) =>
      `  <exclude-pattern>${escapeXml(`${quotePattern(directory + path.sep)}.*`)}</exclude-pattern>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ruleset name="nitpicker-spring-main" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">',
    "  <description>Nitpicker's Spring rules on main sources only.</description>",
    ...excludes,
    `  <rule ref="${escapeXml(springRuleset)}"/>`,
    '</ruleset>',
    '',
  ].join('\n');
}
