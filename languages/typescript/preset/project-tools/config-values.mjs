const REGEXP_KEY = '$nitpickerRegExp';

function encodedEntries(value, at) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, encodedValue(item, `${at}.${key}`)]),
  );
}

export function encodedValue(value, at = 'config') {
  if (value instanceof RegExp) {
    return { [REGEXP_KEY]: [value.source, value.flags] };
  }
  if (['function', 'symbol', 'bigint'].includes(typeof value)) {
    throw new TypeError(
      `${at} is a ${typeof value}; only JSON values and regular expressions can be used`,
    );
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => encodedValue(item, `${at}[${String(index)}]`));
  }
  return value !== null && typeof value === 'object' ? encodedEntries(value, at) : value;
}

export function hasEncodedRegExp(value) {
  if (Array.isArray(value)) {
    return value.some(hasEncodedRegExp);
  }
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return REGEXP_KEY in value || Object.values(value).some(hasEncodedRegExp);
}

export function revivedExpression(value) {
  const key = JSON.stringify(REGEXP_KEY);
  const reviver = `(_key, item) => Array.isArray(item?.[${key}]) ? new RegExp(...item[${key}]) : item`;
  return `JSON.parse(${JSON.stringify(JSON.stringify(value))}, ${reviver})`;
}
