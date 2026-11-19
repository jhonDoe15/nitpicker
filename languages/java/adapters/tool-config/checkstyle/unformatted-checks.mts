import { escapeRegExp as untypedEscapeRegExp } from '../../../../../shared/paths/glob.mjs';

const escapeRegExp: (text: string) => string = untypedEscapeRegExp;

const TREE_WALKER = '<module name="TreeWalker">';
const INDENTATION_PROPERTIES = ['basicOffset', 'caseIndent', 'arrayInitIndent'];
const TAB_MODULES = ['Indentation', 'FileTabCharacter'];
const WIDE_INDENTATION = '4';
const TAB_INDENTATION = 'tab';

function withoutModule(text: string, name: string): string {
  return text.replaceAll(
    new RegExp(`<module name="${escapeRegExp(name)}"\\s*(?:/>|>[\\s\\S]*?</module>)`, 'gu'),
    '',
  );
}

function withIndentation(text: string, property: string, width: string): string {
  const pattern = new RegExp(
    `(<module name="Indentation">(?:(?!</module>)[\\s\\S])*?<property name="${escapeRegExp(property)}" value=")\\d+(")`,
    'u',
  );
  if (!pattern.test(text)) {
    throw new Error(`nitpicker could not find Indentation ${property} in google_checks.xml`);
  }
  return text.replace(
    pattern,
    (_whole: string, head: string, tail: string) => `${head}${width}${tail}`,
  );
}

export function unformattedCheckstyle(text: string, indentation: unknown): string {
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
