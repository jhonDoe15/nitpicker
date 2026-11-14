import {
  braceDepths,
  enclosingOpen,
  literalAt,
} from '../../../../adapters/kotlin/scan/kotlin-source.mjs';
import { kotlinRecipe } from '../shared/kotlin-recipe.mjs';

const VISIBILITY = String.raw`((?:(?:public|private|internal|protected)[ \t]+)?)`;
const PROPERTY = new RegExp(
  String.raw`^([ \t]*)${VISIBILITY}val[ \t]+[A-Za-z_]\w*[ \t]*(?::[ \t]*([A-Za-z]\w*)[ \t]*)?=[ \t]*`,
  'gmu',
);
const TYPES = new Set([
  ...['String', 'Int', 'Long', 'Short', 'Byte', 'Float', 'Double', 'Boolean', 'Char'],
  ...['UInt', 'ULong', 'UShort', 'UByte'],
]);
const STRING = /^"(?:[^"\\$]|\\[^$])*"$/u;
const CHARACTER = /^'(?:[^'\\]|\\.)'$/u;
const NUMBER =
  /^-?(?:0[xX][\da-fA-F_]+[LuU]*|0[bB][01_]+[LuU]*|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?[fFLuU]*)$/u;
const BOOLEAN = /^(?:true|false)$/u;
const OBJECT_HEADER =
  /^\s*(?:@[\w.]+(?:\([^)]*\))?\s+)*(?:(?:public|private|internal|protected|data)\s+)*(?:companion\s+)?object\b/u;

function inObjectOrTop(code, depths, offset) {
  if (depths[offset] === 0) {
    return true;
  }
  const open = enclosingOpen(code, offset);
  const before = code.slice(0, open);
  const boundary = Math.max(
    before.lastIndexOf(';'),
    before.lastIndexOf('{'),
    before.lastIndexOf('}'),
  );
  return OBJECT_HEADER.test(before.slice(boundary + 1));
}

function isConstant(scanned, from) {
  const { code, source } = scanned;
  const lineEnd = code.indexOf('\n', from) === -1 ? code.length : code.indexOf('\n', from);
  const text = source
    .slice(from, from + code.slice(from, lineEnd).trimEnd().length)
    .replace(/;$/u, '');
  if (STRING.test(text)) {
    return literalAt(scanned, from)?.template !== true;
  }
  return CHARACTER.test(text) || NUMBER.test(text) || BOOLEAN.test(text);
}

function annotatedAbove(code, offset) {
  const before = code.slice(0, offset).trimEnd();
  const line = before.slice(before.lastIndexOf('\n') + 1).trim();
  return line.startsWith('@');
}

function hasAccessor(code, from) {
  return /^\s*(?:get|set|by)\b/u.test(code.slice(code.indexOf('\n', from) + 1));
}

function mayBeConst({ id, safety, visible }) {
  return kotlinRecipe({
    id,
    rules: [{ tool: 'detekt', rule: 'detekt.style.MayBeConst' }],
    safety,
    find(scanned) {
      const { code } = scanned;
      const depths = braceDepths(code);
      return [...code.matchAll(PROPERTY)].flatMap((match) => {
        const [text, indent, modifiers, type] = match;
        const start = match.index + indent.length;
        const from = match.index + text.length;
        const accepted =
          modifiers.startsWith('private') === !visible &&
          (type === undefined || TYPES.has(type)) &&
          !annotatedAbove(code, match.index) &&
          !hasAccessor(code, from) &&
          inObjectOrTop(code, depths, match.index) &&
          isConstant(scanned, from);
        const at = start + modifiers.length;
        return accepted ? [{ offset: start, edits: [{ start: at, end: at, text: 'const ' }] }] : [];
      });
    },
  });
}

export const mayBeConstRecipe = mayBeConst({
  id: 'kotlin-may-be-const',
  safety: 'safe',
  visible: false,
});

export const mayBeConstReviewRecipe = mayBeConst({
  id: 'kotlin-may-be-const-visible',
  safety: 'review',
  visible: true,
});
