import { enclosingOpen, parenDepths, splitArguments } from '../kotlin-source.mjs';

const HEADER = new RegExp(
  [
    String.raw`(?<![\w.])(?:(fun)\s+(?:<[^>]*>\s*)?(?:[\w.<>?]+\.)?([A-Za-z_]\w*)`,
    String.raw`|(class)\s+([A-Za-z_]\w*)(?:\s*<[^>]*>)?(?:\s+(?:private|internal|protected|public))?(?:\s+constructor)?`,
    String.raw`|(constructor)())\s*\(`,
  ].join(''),
  'g',
);
const TRI_STATE_PARAMETER = /^\s*(?:(?:val|var)\s+)?([A-Za-z_]\w*)\s*:\s*Boolean\?\s*(?:=|$)/;
const PARAMETER_MODIFIERS = /\boverride\b|@/;
const RETURN_TYPE = /^\s*:\s*(Boolean\?)(?![\w?])/;
const PROPERTY = /(?<![\w.])(?:val|var)\s+([A-Za-z_]\w*)\s*:\s*(Boolean\?)(?![\w?])/g;
const TYPE_HEADER = /\b(?:class|object|interface)\b[^{};]*$/;

export const TRI_STATE_MESSAGES = {
  TriStateBoolean:
    'Use a non-null `Boolean`, or an `enum class` that names each state (`Mode.ON`, `Mode.OFF`, `Mode.AUTO`): a `Boolean?` is true, false or null, so this has three states that the type does not name.',
};

function modifiersBefore(code, index) {
  return code.slice(code.lastIndexOf('\n', index) + 1, index);
}

function isOverride(code, index) {
  return /\boverride\b/.test(modifiersBefore(code, index));
}

function parameterFindings(code, header, open) {
  const { parts, close } = splitArguments(code, open);
  const name = header[2] ?? header[4] ?? header[5];
  const parameters = parts.flatMap((part) => {
    const text = code.slice(part.start, part.end);
    const found = PARAMETER_MODIFIERS.test(text) ? undefined : TRI_STATE_PARAMETER.exec(text);
    return found === null || found === undefined
      ? []
      : [
          {
            rule: 'TriStateBoolean',
            offset: part.start + text.indexOf(found[1]),
            subject: `${name}(${found[1]})`,
          },
        ];
  });
  const returned = header[1] === 'fun' ? RETURN_TYPE.exec(code.slice(close + 1)) : null;
  return returned === null
    ? parameters
    : [
        ...parameters,
        {
          rule: 'TriStateBoolean',
          offset: close + 1 + returned[0].lastIndexOf(returned[1]),
          subject: `${name}()`,
        },
      ];
}

function isMemberLevel(code, offset) {
  const open = enclosingOpen(code, offset);
  return open === -1 || TYPE_HEADER.test(code.slice(Math.max(0, open - 300), open));
}

export function triStateBooleans(scanned) {
  const { code } = scanned;
  const signatures = [...code.matchAll(HEADER)]
    .filter((header) => header[1] !== 'fun' || !isOverride(code, header.index))
    .flatMap((header) => parameterFindings(code, header, header.index + header[0].length - 1));
  const depths = parenDepths(code);
  const properties = [...code.matchAll(PROPERTY)]
    .filter(
      ({ index }) => depths[index] === 0 && !isOverride(code, index) && isMemberLevel(code, index),
    )
    .map((match) => ({
      rule: 'TriStateBoolean',
      offset: match.index + match[0].lastIndexOf(match[2]),
      subject: `${match[1]}`,
    }));
  return [...signatures, ...properties];
}
