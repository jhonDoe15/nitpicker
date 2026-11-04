const DOMAIN_PATH = /(?:^|\/)features\/[^/]+\/domain\//u;

const LEAD = 'Spreading the accumulator copies it on every step, which is quadratic';
const NO_LOOPS = `${LEAD}, and domain/ has no loops`;
const EXCEPTION = ' An exception fits only when the input stays small.';
const ENTRIES = 'Object.fromEntries(xs.map((x) => [x.key, x.value]))';
const MERGED = 'Object.fromEntries(parts.flatMap((p) => Object.entries(p)))';
const DOMAIN_OBJECT =
  'Object.fromEntries(xs.map((x) => [x.key, x.value] as const)), ' +
  `new Map(xs.map((x) => [x.key, x] as const)) or ${MERGED} (drop as const in JavaScript)`;
const ARRAYS = 'xs.flatMap((x) => x.items), map or filter';
const WRAPPED = 'map, flatMap or filter and wrap the result once (new Set, new Map)';

function message(lead, advice) {
  return `${lead}: ${advice}.${EXCEPTION}`;
}

export const accumulatingSpreadMessages = {
  reduceObject: message(
    LEAD,
    `use ${ENTRIES} or ${MERGED}, or fill a const object in a for...of loop`,
  ),
  reduceArray: message(LEAD, `use ${ARRAYS}, or push onto a const array in a for...of loop`),
  reduce: message(LEAD, `build it with ${WRAPPED}, or fill a const accumulator in a for...of loop`),
  loopObject: message(
    LEAD,
    `use ${ENTRIES} or ${MERGED}, or declare the object const before the loop and set its keys`,
  ),
  loopArray: message(
    LEAD,
    `use ${ARRAYS}, or declare the array const before the loop and push onto it`,
  ),
  domainReduceObject: message(LEAD, `use ${DOMAIN_OBJECT}`),
  domainReduceArray: message(LEAD, `use ${ARRAYS}`),
  domainReduce: message(LEAD, `build it with ${WRAPPED}`),
  domainLoopObject: message(NO_LOOPS, `use ${DOMAIN_OBJECT}`),
  domainLoopArray: message(NO_LOOPS, `use ${ARRAYS}`),
};

export function accumulatingSpreadMessageId(kind, filePath) {
  return DOMAIN_PATH.test(filePath.replaceAll('\\', '/'))
    ? `domain${kind[0].toUpperCase()}${kind.slice(1)}`
    : kind;
}
