import { largest } from '../../../../../../shared/lists/lists.mts';
import type { Conversion, ParsedFormat } from './log-format-types.mts';
const PRINTF_SPEC =
  /^(\d+\$)?[-#+ 0,(<]*(?:[1-9]\d*)?(?:\.\d+)?([bBhHsScCdoxXeEfgGaA]|[tT][HIklMSLNpzZsQBbhAaCYyjmdeRTrDFc])/u;
const RELATIVE = /^[-#+ 0,(<]*</u;
const PRINTF_IN_MESSAGE = /%(?:\d+\$)?[-#+0,(]*(?:[1-9]\d*)?(?:\.\d+)?[sdfxXbBcSeEgG]/u;
const MESSAGE_IN_PRINTF = /\{\s*(?:\d+\s*)?[,}]/u;
const MESSAGE_INDEX = /\{\s*(\d+)\s*[,}]/gu;
const MESSAGE_MALFORMED = /\{\s*[^\d\s]|\{\s+\d/u;
const QUOTED = /'[^']*(?:'|$)/gu;

function printfSpecs(text: string): { spec: string; match: RegExpExecArray | undefined }[] {
  return text
    .replaceAll(/%-?\d*%|%n/gu, '')
    .split('%')
    .slice(1)
    .map((spec) => ({ spec, match: PRINTF_SPEC.exec(spec) ?? undefined }));
}

export function printfFormat(text: string): ParsedFormat {
  const specs = printfSpecs(text);
  const conversions: { argument: number; conversion: string | undefined }[] = [];
  let ordinary = 0;
  for (const { spec, match } of specs) {
    if (match !== undefined && match[1] !== undefined) {
      conversions.push({ argument: Number.parseInt(match[1], 10), conversion: match[2] });
    } else if (match === undefined || !RELATIVE.test(spec)) {
      ordinary += 1;
      conversions.push({ argument: ordinary, conversion: match?.[2] });
    }
  }
  return {
    malformed: specs.some(({ match }) => match === undefined),
    required: largest([0, ...conversions.map(({ argument }) => argument)]),
    conversions: conversions.flatMap(({ argument, conversion }): Conversion[] =>
      conversion === undefined ? [] : [{ argument, conversion }],
    ),
    otherSyntax: MESSAGE_IN_PRINTF.test(text),
  };
}

export function messageFormat(text: string): ParsedFormat {
  const unquoted = text.replaceAll("''", '').replaceAll(QUOTED, '');
  const indexes = [...unquoted.matchAll(MESSAGE_INDEX)].map(([, index = '']) =>
    Number.parseInt(index, 10),
  );
  return {
    malformed: MESSAGE_MALFORMED.test(unquoted),
    required: indexes.length === 0 ? 0 : largest(indexes) + 1,
    conversions: [],
    otherSyntax: PRINTF_IN_MESSAGE.test(unquoted),
  };
}

const INTEGRAL = new Set(['d', 'o', 'x', 'X']);
const DECIMAL = new Set(['e', 'E', 'f', 'g', 'G', 'a', 'A']);

export function wrongConversion(conversion: string, kind: string | undefined): boolean {
  if (INTEGRAL.has(conversion)) {
    return kind === 'text' || kind === 'decimal';
  }
  return DECIMAL.has(conversion) && (kind === 'text' || kind === 'integral');
}
