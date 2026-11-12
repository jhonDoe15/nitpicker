const PRINTF_SPEC =
  /^(\d+\$)?[-#+ 0,(<]*(?:[1-9]\d*)?(?:\.\d+)?([bBhHsScCdoxXeEfgGaA]|[tT][HIklMSLNpzZsQBbhAaCYyjmdeRTrDFc])/u;
const RELATIVE = /^[-#+ 0,(<]*</u;
const PRINTF_IN_MESSAGE = /%(?:\d+\$)?[-#+0,(]*(?:[1-9]\d*)?(?:\.\d+)?[sdfxXbBcSeEgG]/u;
const MESSAGE_IN_PRINTF = /\{\s*(?:\d+\s*)?[,}]/u;
const MESSAGE_INDEX = /\{\s*(\d+)\s*[,}]/gu;
const MESSAGE_MALFORMED = /\{\s*[^\d\s]|\{\s+\d/u;
const QUOTED = /'[^']*(?:'|$)/gu;

function printfSpecs(text) {
  return text
    .replaceAll(/%-?\d*%|%n/gu, '')
    .split('%')
    .slice(1)
    .map((spec) => ({ spec, match: PRINTF_SPEC.exec(spec) }));
}

export function printfFormat(text) {
  const specs = printfSpecs(text);
  const conversions = [];
  let ordinary = 0;
  for (const { spec, match } of specs) {
    if (match !== null && match[1] !== undefined) {
      conversions.push({ argument: Number.parseInt(match[1], 10), conversion: match[2] });
    } else if (match === null || !RELATIVE.test(spec)) {
      ordinary += 1;
      conversions.push({ argument: ordinary, conversion: match?.[2] });
    }
  }
  return {
    malformed: specs.some(({ match }) => match === null),
    required: Math.max(0, ...conversions.map(({ argument }) => argument)),
    conversions: conversions.filter(({ conversion }) => conversion !== undefined),
    otherSyntax: MESSAGE_IN_PRINTF.test(text),
  };
}

export function messageFormat(text) {
  const unquoted = text.replaceAll("''", '').replaceAll(QUOTED, '');
  const indexes = [...unquoted.matchAll(MESSAGE_INDEX)].map(([, index]) =>
    Number.parseInt(index, 10),
  );
  return {
    malformed: MESSAGE_MALFORMED.test(unquoted),
    required: indexes.length === 0 ? 0 : Math.max(...indexes) + 1,
    conversions: [],
    otherSyntax: PRINTF_IN_MESSAGE.test(unquoted),
  };
}

const INTEGRAL = new Set(['d', 'o', 'x', 'X']);
const DECIMAL = new Set(['e', 'E', 'f', 'g', 'G', 'a', 'A']);

export function wrongConversion(conversion, kind) {
  if (INTEGRAL.has(conversion)) {
    return kind === 'text' || kind === 'decimal';
  }
  return DECIMAL.has(conversion) && (kind === 'text' || kind === 'integral');
}
