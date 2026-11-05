import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RULESET = readFileSync(
  path.resolve(import.meta.dirname, '../../gradle/pmd-main-ruleset.xml'),
  'utf8',
);
const SHARED = [
  ['$clientTypes', '$permit'],
  ['$sizes', '$mappers'],
  ['$collection', '$growing'],
];

function ruleText(name) {
  const start = RULESET.indexOf(`<rule name="${name}"`);
  return RULESET.slice(start, RULESET.indexOf('</rule>', start));
}

function between(text, from, to) {
  const start = text.indexOf(`${from} :=`);
  return text.slice(start, text.indexOf(`${to} :=`, start)).trim();
}

describe('pmd/UnboundedReactiveFanOut', () => {
  const fanOut = ruleText('UnboundedFanOut');
  const reactive = ruleText('UnboundedReactiveFanOut');

  it.each(SHARED)(
    'recognizes remote calls and fixed collections as UnboundedFanOut does (%s)',
    (from, to) => {
      const shared = between(fanOut, from, to);

      expect(shared.length).toBeGreaterThan(100);
      expect(reactive.includes(shared)).toBe(true);
    },
  );

  it('names the defaults, the allowed forms and when an exception fits', () => {
    const message = /message="([^"]*)"/u.exec(reactive)[1];

    expect(message).toBe(
      [
        'This Reactor operator subscribes to a remote or message call for every element of a collection:',
        'Mono.zip, Mono.when and Flux.zip over a list built per element start every call at once,',
        'and flatMap or Flux.merge without a concurrency argument run up to 256 at once,',
        'so a large collection exhausts the connections or rate limit of the remote service.',
        'Pass a concurrency limit (flatMap(this::fetch, 8)), use concatMap for one call at a time,',
        'or buffer(20) and make one batch call per chunk;',
        'for a zip, use Flux.fromIterable(items).flatMap(this::fetch, 8).collectList().',
        'An exception fits only when the collection is always small.',
      ].join(' '),
    );
  });
});
