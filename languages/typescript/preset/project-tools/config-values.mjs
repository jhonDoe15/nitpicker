const REGEXP_KEY = '$nitpickerRegExp';
const UNSUPPORTED_TYPES = new Set(['function', 'symbol', 'bigint']);

export function listOf(value) {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function encodedValue(value, at = 'config') {
  const text = JSON.stringify(value, (key, item) => {
    if (item instanceof RegExp) {
      return { [REGEXP_KEY]: [item.source, item.flags] };
    }
    if (UNSUPPORTED_TYPES.has(typeof item)) {
      const where = key === '' ? at : `${at}: "${key}"`;
      throw new TypeError(
        `${where} is a ${typeof item}; only JSON values and regular expressions can be used`,
      );
    }
    return item;
  });
  return text === undefined ? undefined : JSON.parse(text);
}

export function hasEncodedRegExp(value) {
  return JSON.stringify(value)?.includes(JSON.stringify(REGEXP_KEY)) === true;
}

export function revivedExpression(value) {
  const key = JSON.stringify(REGEXP_KEY);
  const reviver = `(_key, item) => Array.isArray(item?.[${key}]) ? new RegExp(...item[${key}]) : item`;
  return `JSON.parse(${JSON.stringify(JSON.stringify(value))}, ${reviver})`;
}
