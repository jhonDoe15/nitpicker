import { parenDepths, splitArguments } from '../kotlin-source.mjs';
import {
  enclosingOpens,
  hasModifier,
  isMappedClass,
  isMappedMember,
  isMemberLevel,
  typeHeaderAt,
} from './declarations.mjs';

const HEADER = new RegExp(
  [
    String.raw`(?<![\w.])(?:(fun)\s+(?:<[^>]*>\s*)?(?:[\w.<>?]+\.)?([A-Za-z_]\w*)`,
    String.raw`|(class)\s+([A-Za-z_]\w*)(?:\s*<[^>]*>)?(?:\s+(?:private|internal|protected|public))?(?:\s+constructor)?`,
    String.raw`|(constructor)())\s*\(`,
  ].join(''),
  'g',
);
const TRI_STATE_PARAMETER = /^\s*(?:(?:val|var)\s+)?([A-Za-z_]\w*)\s*:\s*Boolean\?\s*(?:=|$)/;
const OVERRIDE_PARAMETER = /\boverride\b/;
const MAPPED_PARAMETER =
  /@(?:[a-z]+:)?(?:\w+\.)*(?:Column|Field|JsonProperty|SerialName|RequestParam|RequestBody|RequestHeader|PathVariable)\b/;
const RETURN_TYPE = /^\s*:\s*(Boolean\?)(?![\w?])/;
const PROPERTY = /(?<![\w.])(?:val|var)\s+([A-Za-z_]\w*)\s*:\s*(Boolean\?)(?![\w?])/g;

export const TRI_STATE_MESSAGES = {
  TriStateBoolean:
    'Use an `enum class` that names each state (`Mode.ON`, `Mode.OFF`, `Mode.AUTO`): a `Boolean?` is true, false or null, so this has three states that the type does not name. A plain `Boolean` is fine only when it is not a flag that switches the function between two behaviors.',
};

function triStateParameter(text) {
  return OVERRIDE_PARAMETER.test(text) || MAPPED_PARAMETER.test(text)
    ? undefined
    : (TRI_STATE_PARAMETER.exec(text) ?? undefined);
}

function parameterFindings(code, header, open) {
  const { parts, close } = splitArguments(code, open);
  const name = header[2] ?? header[4] ?? header[5];
  const mapped = header[3] === 'class' && isMappedClass(code, header.index);
  const parameters = mapped
    ? []
    : parts.flatMap((part) => {
        const text = code.slice(part.start, part.end);
        const found = triStateParameter(text);
        return found === undefined
          ? []
          : [
              {
                rule: 'TriStateBoolean',
                offset: part.start + text.indexOf(found[1]),
                subject: `${name}(${found[1]})`,
              },
            ];
      });
  const returned =
    header[1] === 'fun' ? (RETURN_TYPE.exec(code.slice(close + 1)) ?? undefined) : undefined;
  return returned === undefined
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

function isMappedProperty(code, enclosing, index) {
  const owner = typeHeaderAt(code, enclosing[index]);
  return isMappedMember(code, index) || (owner !== undefined && isMappedClass(code, owner));
}

function propertyFindings(code) {
  const enclosing = enclosingOpens(code);
  const depths = parenDepths(code);
  return [...code.matchAll(PROPERTY)]
    .filter(
      ({ index }) =>
        depths[index] === 0 &&
        !hasModifier(code, index, 'override') &&
        isMemberLevel(code, enclosing, index) &&
        !isMappedProperty(code, enclosing, index),
    )
    .map((match) => ({
      rule: 'TriStateBoolean',
      offset: match.index + match[0].lastIndexOf(match[2]),
      subject: `${match[1]}`,
    }));
}

export function triStateBooleans(scanned) {
  const { code } = scanned;
  const signatures = [...code.matchAll(HEADER)]
    .filter((header) => header[1] !== 'fun' || !hasModifier(code, header.index, 'override'))
    .flatMap((header) => parameterFindings(code, header, header.index + header[0].length - 1));
  return [...signatures, ...propertyFindings(code)];
}
