import type { SpringView } from '../../spring/typed/spring-shapes.mts';
import type {
  FanOutInput,
  FanOutReport,
  FanOutResult,
  Frame,
  ProjectIndex,
  Task,
  MessageWork,
} from './typed/fan-out-types.mts';
import { fanOutReport } from './typed/fan-out-views.mts';
import { springViews } from '../../spring/view/spring-view.mts';
import {
  REACTIVE_FAN_OUT_MESSAGES,
  reactiveFindingsOf,
} from '../reactive-fan-out/reactive-fan-out.mts';
import { projectIndex, remoteWork } from './reach.mts';
import { collectionLabel, isFixed, siteOf, starterOf, waitsInside } from './sites.mts';
import { target, workText } from './work-text.mts';

const RULE = 'UnboundedFanOut';
const ALLOWED = [
  'Hold one `Semaphore(8)` created outside the loop and run each call in `permits.withPermit { ... }`,',
  'await fixed-size chunks (`items.chunked(20)`), or make one batch call when the API has one.',
  'An exception fits only when the collection is always small.',
].join(' ');
const CONSEQUENCE = 'so a large collection exhausts the';

type FanOutText = { starter: string; collection: string; work: MessageWork };

export const FAN_OUT_MESSAGES = {
  [RULE]: [
    'A task started for every element of a collection makes a remote or message call,',
    `${CONSEQUENCE} connections or rate limit of the remote service. ${ALLOWED}`,
  ].join(' '),
  ...REACTIVE_FAN_OUT_MESSAGES,
};

export function fanOutMessage({ starter, collection, work }: FanOutText): string {
  const started = `\`${starter}\` starts ${workText(work)} for every element of \`${collection}\` at once`;
  return `${started}, ${CONSEQUENCE} ${target(work.kind)}'s connections or rate limit. ${ALLOWED}`;
}

function startedTasks(project: ProjectIndex, view: SpringView): Task[] {
  return view.file.scopes.flatMap((scope) => {
    const starter = starterOf(view, scope);
    const work = starter === undefined ? undefined : remoteWork(project, view, scope);
    return work === undefined || starter === undefined ? [] : [{ scope, starter, work }];
  });
}

type SiteTasks = { site: Frame; tasks: [Task, ...Task[]] };

function sitesOf(view: SpringView, tasks: Task[]): SiteTasks[] {
  const bySite = new Map<Frame, [Task, ...Task[]]>();
  for (const task of tasks) {
    const site = siteOf(view, task.scope);
    if (site !== undefined) {
      const known = bySite.get(site);
      bySite.set(site, known === undefined ? [task] : [...known, task]);
    }
  }
  const started = new Set(tasks.map(({ scope }) => scope.id));
  return [...bySite]
    .filter(([site]) => !(isFixed(view, site) || waitsInside(view, site, started)))
    .map(([site, siteTasks]) => ({ site, tasks: siteTasks }));
}

function findingsOf(project: ProjectIndex, view: SpringView): FanOutReport[] {
  const occurrences = new Map<string, number>();
  return sitesOf(view, startedTasks(project, view))
    .toSorted((left, right) => left.site.line - right.site.line)
    .map(({ site, tasks: [first, ...rest] }) => {
      const collection = collectionLabel(site);
      const owner = view.chain(site.id).find(({ k }) => k === 'fun')?.name ?? '';
      const subject = `${owner} ${collection} ${first.starter} ${first.work.helper ?? first.work.call}`;
      return fanOutReport(view, {
        rule: RULE,
        subject,
        occurrences,
        message: fanOutMessage({ starter: first.starter, collection, work: first.work }),
        line: site.line,
        lines: [first, ...rest].flatMap(({ work }) => work.lines),
      });
    });
}

export function fanOutFindings({
  own,
  projectFiles,
  projectRoot,
  javaRoots,
}: FanOutInput): FanOutResult {
  const project = projectIndex(
    springViews({ files: projectFiles, projectFiles, projectRoot, javaRoots }),
  );
  const reported = springViews({ files: own, projectFiles, projectRoot, javaRoots }).flatMap(
    (view) => [...findingsOf(project, view), ...reactiveFindingsOf(project, view)],
  );
  return {
    findings: reported.map(({ finding }) => finding),
    calls: new Set(
      reported.flatMap(({ finding, lines }) =>
        lines.map((line) => `${finding.path}:${String(line)}`),
      ),
    ),
  };
}

export const kotlinSourceRules = { messages: FAN_OUT_MESSAGES };
