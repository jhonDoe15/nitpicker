import { frameAt } from '../max-value-sums/source-file.mjs';
import { methodCalls } from '../token-calls/calls.mjs';

export const OBJECT_LISTING_RULE = 'UnpagedListing';
export const OBJECT_LISTING_EXCEPTION_RULE = `pmd/${OBJECT_LISTING_RULE}`;

const STORES = {
  imports: [
    'software.amazon.awssdk.services.s3',
    'com.amazonaws.services.s3',
    'com.aliyun.oss',
    'com.qcloud.cos',
    'com.obs',
  ],
  calls: new Set(['listObjectsV2', 'listObjects', 'listObjectVersions']),
  markers: new Set([
    'isTruncated',
    'nextContinuationToken',
    'getNextContinuationToken',
    'getNextMarker',
    'nextMarker',
    'continuationToken',
    'listNextBatchOfObjects',
    'isTruncatedV2',
    'getNextKeyMarker',
    'nextKeyMarker',
    'marker',
    'startAfter',
  ]),
};
const SEARCH = {
  imports: ['redis.clients.jedis'],
  calls: new Set(['ftSearch']),
  markers: new Set(['limit', 'Limit']),
};
const MAX_KEYS = new Set(['maxKeys', 'withMaxKeys', 'setMaxKeys']);

function importsAny(source, prefixes) {
  const text = source.tokens.map((token) => token.text).join('');
  return prefixes.some((prefix) => text.includes(`import${prefix}`));
}

function singleKey(source, body) {
  const { tokens } = source;
  for (let index = body.from; index < body.to; index += 1) {
    const limited =
      MAX_KEYS.has(tokens[index].text) && ['(', '='].includes(tokens[index + 1]?.text);
    if (limited && tokens[index + 2]?.text === '1') {
      return true;
    }
  }
  return false;
}

function mentionsMarker(source, body, markers) {
  return source.tokens
    .slice(body.from, body.to)
    .some(({ kind, text }) => kind === 'identifier' && markers.has(text));
}

function insideLoop(source, index) {
  const { tokens, opener, partner } = source;
  for (let open = opener[index]; open >= 0; open = opener[open]) {
    const before = tokens[open - 1]?.text;
    const header = before === ')' ? tokens[partner[open - 1] - 1]?.text : undefined;
    if (tokens[open].text === '{' && (before === 'do' || header === 'while' || header === 'for')) {
      return true;
    }
  }
  return false;
}

function unpaged(source, call, table) {
  const frame = frameAt(source, call.index);
  if (frame === undefined || call.receiver === undefined) {
    return false;
  }
  return !mentionsMarker(source, frame.body, table.markers) && !singleKey(source, frame.body);
}

export function findUnpagedListings(source) {
  const calls = methodCalls(source);
  const stores =
    calls.some(({ name }) => STORES.calls.has(name)) && importsAny(source, STORES.imports);
  const search =
    calls.some(({ name }) => SEARCH.calls.has(name)) && importsAny(source, SEARCH.imports);
  return calls.flatMap((call) => {
    const listing = stores && STORES.calls.has(call.name) && call.args.length === 1;
    const query = search && SEARCH.calls.has(call.name) && call.args.length === 2;
    const found =
      (listing && unpaged(source, call, STORES)) ||
      (query && !insideLoop(source, call.index) && unpaged(source, call, SEARCH));
    return found
      ? [
          {
            line: call.line,
            kind: listing ? 'listing' : 'search',
            symbol: call.name,
            key: call.name,
          },
        ]
      : [];
  });
}

const MESSAGES = {
  listing:
    'An object-store listing call returns one page (1000 keys) and the rest is ignored. Use the ' +
    'paginator (`listObjectsV2Paginator(request)`), or loop on `isTruncated()` and `nextContinuationToken()`. ' +
    'An existence check sets `maxKeys(1)`.',
  search:
    'RediSearch `FT.SEARCH` returns 10 documents by default, so ' +
    'the rest is ignored. Set `Query.limit(offset, count)` ' +
    'and loop on the offset until a page comes back short.',
};

export const unpagedListingRule = {
  id: OBJECT_LISTING_RULE,
  find: findUnpagedListings,
  message: ({ kind }) => MESSAGES[kind],
};

export const OBJECT_LISTING_ALLOWED = MESSAGES.listing;
