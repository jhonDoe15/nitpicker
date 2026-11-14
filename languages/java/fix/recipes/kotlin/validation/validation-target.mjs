import { splitArguments } from '../../../../adapters/kotlin/scan/kotlin-source.mjs';
import { CONSTRAINT_NAMES } from '../../../../adapters/kotlin/review-rules/validation/constraint-names.mjs';
import { kotlinRecipe } from '../shared/kotlin-recipe.mjs';

const CASCADE = new Set(['jakarta.validation', 'javax.validation']);
const IMPORT = /^[ \t]*import[ \t]+([\w.]+)(?:[ \t]+as[ \t]+(\w+))?[ \t]*$/gmu;
const CLASS_HEADER = new RegExp(
  [
    String.raw`(?<![\w.:])class\s+[A-Za-z_]\w*(?:<[^<>{}()]*>)?\s*`,
    String.raw`(?:(?:private|internal|public|protected)\s+)?(?:constructor\s*)?\(`,
  ].join(''),
  'gu',
);
const ANNOTATION = /@(?:([A-Za-z_]\w*):)?([A-Za-z_][\w.]*)/gu;
const PROPERTY = /(?<![\w.])(?:val|var)\s+[A-Za-z_`]/u;
const VISIBLE = new Set(['field', 'get', 'all']);

function isValidation(qualified) {
  const parts = qualified.split('.');
  const name = parts.pop();
  const pack = parts.join('.');
  return pack in CONSTRAINT_NAMES || (CASCADE.has(pack) && name === 'Valid');
}

function explicitImports(code) {
  return new Map(
    [...code.matchAll(IMPORT)].map(([, path, alias]) => [alias ?? path.split('.').at(-1), path]),
  );
}

function resolves(imports, written) {
  const [first, ...rest] = written.split('.');
  return imports.has(first)
    ? isValidation([imports.get(first), ...rest].join('.'))
    : rest.length > 0 && isValidation(written);
}

function annotationsBefore(code, from, to) {
  const found = [];
  const head = code.slice(from, to);
  for (const match of head.matchAll(ANNOTATION)) {
    const after = from + match.index + match[0].length;
    if (!found.some(({ end }) => from + match.index < end)) {
      const end = code[after] === '(' ? splitArguments(code, after).close + 1 : after;
      found.push({ at: from + match.index, target: match[1], name: match[2], end });
    }
  }
  return found;
}

function hidden(code, imports, { start, end }) {
  const slice = code.slice(start, end);
  const property = PROPERTY.exec(slice);
  if (property === null) {
    return [];
  }
  const entries = annotationsBefore(code, start, start + property.index).filter(({ name }) =>
    resolves(imports, name),
  );
  const visible = new Set(
    entries.filter(({ target }) => VISIBLE.has(target)).map(({ name }) => name),
  );
  return entries.filter(({ target, name }) => target === undefined && !visible.has(name));
}

export const validationTargetRecipe = kotlinRecipe({
  id: 'kotlin-validation-annotation-target',
  rules: [{ tool: 'pmd', rule: 'ValidationAnnotationTarget' }],
  find({ code }) {
    const imports = explicitImports(code);
    return [...code.matchAll(CLASS_HEADER)].flatMap((header) => {
      const open = header.index + header[0].length - 1;
      return splitArguments(code, open).parts.flatMap((part) =>
        hidden(code, imports, part).map(({ at }) => ({
          offset: at,
          edits: [{ start: at + 1, end: at + 1, text: 'field:' }],
        })),
      );
    });
  },
});
