import { hash, nextOccurrence } from '../../../../../../../shared/rules/finding-helpers.mjs';
import { referenceWork, remoteWork } from '../fan-out/reach.mjs';
import { target, workText } from '../fan-out/work-text.mjs';
import { reactiveSites, workerOf } from './reactive-sites.mjs';

const RULE = 'UnboundedReactiveFanOut';
const TOOL = 'kotlin-source';
const MAX_LABEL = 50;
const EXCEPTION = 'An exception fits only when the collection is always small.';
const ALLOWED = {
  operator: [
    'Pass a concurrency limit (`flatMap({ fetch(it) }, 8)`), use `concatMap` for one call at a time,',
    'or `buffer(20)` and make one batch call per chunk.',
  ].join(' '),
  combinator: [
    'Build the list through `Flux.fromIterable(items).flatMap({ fetch(it) }, 8).collectList()`,',
    'or make one batch call when the API has one.',
  ].join(' '),
  flow: 'Keep the default concurrency (16) or pass a small limit (`flatMapMerge(8) { ... }`).',
};

export const REACTIVE_FAN_OUT_MESSAGES = {
  [RULE]: [
    'A Reactor or Flow operator subscribes to a remote or message call for every element of a collection',
    '(`Mono.zip`, `Mono.when`, `flatMapMerge(Int.MAX_VALUE)`), or up to 256 at once (`flatMap` and `Flux.merge`',
    'without a concurrency argument), so a large collection exhausts the connections or rate limit of the',
    `remote service. ${ALLOWED.operator} ${EXCEPTION}`,
  ].join(' '),
};

function amount(limit) {
  return limit === undefined
    ? ' at once'
    : `, up to ${String(limit)} at once (Reactor's default concurrency)`;
}

function label(text) {
  const flat = (text ?? '').trim().replaceAll(/\s+/gu, ' ');
  return flat.length <= MAX_LABEL ? flat : 'the collection';
}

export function reactiveFanOutMessage({ form, operator, collection, limit, work }) {
  const subscribed = `\`${operator}\` subscribes to ${workText(work)} for every element of \`${collection}\`${amount(limit)}`;
  return `${subscribed}, so a large collection exhausts the ${target(work.kind)}'s connections or rate limit. ${ALLOWED[form]} ${EXCEPTION}`;
}

function workOf(project, view, worker) {
  if (worker === undefined) {
    return undefined;
  }
  return worker.scope === undefined
    ? referenceWork(project, view, worker.reference)
    : remoteWork(project, view, worker.scope);
}

export function reactiveFindingsOf(project, view) {
  const occurrences = new Map();
  return reactiveSites(view)
    .map((site) => ({ site, work: workOf(project, view, workerOf(view, site.invocation)) }))
    .filter(({ work }) => work !== undefined)
    .toSorted((left, right) => left.site.line - right.site.line)
    .map(({ site, work }) => {
      const collection = label(site.collection);
      const owner = view.chain(site.scope).find(({ k }) => k === 'fun')?.name ?? '';
      const subject = `${owner} ${collection} ${site.operator} ${work.helper ?? work.call}`;
      const occurrence = nextOccurrence(occurrences, `${RULE}\0${subject}`);
      const suffix = occurrence === 1 ? '' : `#${String(occurrence)}`;
      return {
        finding: {
          tool: TOOL,
          rule: RULE,
          path: view.file.file,
          identity: `${RULE}:${hash(subject)}${suffix}`,
          message: reactiveFanOutMessage({ ...site, collection, work }),
          classification: 'enforceable',
          location: { line: site.line },
        },
        lines: work.lines,
      };
    });
}
