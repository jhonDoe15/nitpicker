import type { SpringView } from '../../spring/typed/spring-shapes.mts';
import type {
  FanOutReport,
  MessageWork,
  ProjectIndex,
  Work,
} from '../fan-out/typed/fan-out-types.mts';
import { fanOutReport } from '../fan-out/typed/fan-out-views.mts';
import { referenceWork, remoteWork } from '../fan-out/reach.mts';
import { target, workText } from '../fan-out/work-text.mts';
import { reactiveSites, workerOf } from './reactive-sites.mts';
import type { Worker } from './reactive-sites.mts';

const RULE = 'UnboundedReactiveFanOut';
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

function amount(limit: number | undefined): string {
  return limit === undefined
    ? ' at once'
    : `, up to ${String(limit)} at once (Reactor's default concurrency)`;
}

function label(text: string | undefined): string {
  const flat = (text ?? '').trim().replaceAll(/\s+/gu, ' ');
  return flat.length <= MAX_LABEL ? flat : 'the collection';
}

type MessageInput = {
  form: keyof typeof ALLOWED;
  operator: string;
  collection: string;
  limit?: number | undefined;
  work: MessageWork;
};

export function reactiveFanOutMessage({
  form,
  operator,
  collection,
  limit,
  work,
}: MessageInput): string {
  const subscribed = `\`${operator}\` subscribes to ${workText(work)} for every element of \`${collection}\`${amount(limit)}`;
  return `${subscribed}, so a large collection exhausts the ${target(work.kind)}'s connections or rate limit. ${ALLOWED[form]} ${EXCEPTION}`;
}

function workOf(
  project: ProjectIndex,
  view: SpringView,
  worker: Worker | undefined,
): Work | undefined {
  if (worker === undefined) {
    return undefined;
  }
  return 'scope' in worker
    ? remoteWork(project, view, worker.scope)
    : referenceWork(project, view, worker.reference);
}

export function reactiveFindingsOf(project: ProjectIndex, view: SpringView): FanOutReport[] {
  const occurrences = new Map<string, number>();
  return reactiveSites(view)
    .flatMap((site) => {
      const work = workOf(project, view, workerOf(view, site.invocation));
      return work === undefined ? [] : [{ site, work }];
    })
    .toSorted((left, right) => left.site.line - right.site.line)
    .map(({ site, work }) => {
      const collection = label(site.collection);
      const owner = view.chain(site.scope).find(({ k }) => k === 'fun')?.name ?? '';
      const subject = `${owner} ${collection} ${site.operator} ${work.helper ?? work.call}`;
      return fanOutReport(view, {
        rule: RULE,
        subject,
        occurrences,
        message: reactiveFanOutMessage({ ...site, collection, work }),
        line: site.line,
        lines: work.lines,
      });
    });
}
