const TREE_WALKER = '<module name="TreeWalker">';
const INDENTATION_PROPERTIES = ['basicOffset', 'caseIndent', 'arrayInitIndent'];
const TAB_MODULES = ['Indentation', 'FileTabCharacter'];
const WIDE_INDENTATION = '4';
const TAB_INDENTATION = 'tab';

function withoutModule(text, name) {
  return text.replaceAll(
    new RegExp(`<module name="${name}"\\s*(?:/>|>[\\s\\S]*?</module>)`, 'gu'),
    '',
  );
}

function withIndentation(text, property, width) {
  const pattern = new RegExp(
    `(<module name="Indentation">(?:(?!</module>)[\\s\\S])*?<property name="${property}" value=")\\d+(")`,
    'u',
  );
  if (!pattern.test(text)) {
    throw new Error(`nitpicker could not find Indentation ${property} in google_checks.xml`);
  }
  return text.replace(pattern, (whole, head, tail) => `${head}${width}${tail}`);
}

export function unformattedCheckstyle(text, indentation) {
  if (!text.includes(TREE_WALKER)) {
    throw new Error('nitpicker could not find TreeWalker in google_checks.xml');
  }
  const checked = text.replace(TREE_WALKER, `${TREE_WALKER}\n    <module name="UnusedImports"/>`);
  if (indentation === TAB_INDENTATION) {
    return TAB_MODULES.reduce(withoutModule, checked);
  }
  return indentation === WIDE_INDENTATION
    ? INDENTATION_PROPERTIES.reduce(
        (current, property) => withIndentation(current, property, WIDE_INDENTATION),
        checked,
      )
    : checked;
}
