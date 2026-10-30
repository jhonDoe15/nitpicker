import { hash, nextOccurrence } from '../../../../../../../shared/rules/finding-helpers.mjs';
import { springViews } from '../../spring/view/spring-view.mjs';
import { MESSAGE_KIND } from './clients.mjs';
import { projectIndex, remoteWork } from './reach.mjs';
import { collectionLabel, isFixed, siteOf, starterOf, waitsInside } from './sites.mjs';

const RULE = 'UnboundedFanOut';
const TOOL = 'kotlin-source';
const ALLOWED = [
  'Hold one `Semaphore(8)` created outside the loop and run each call in `permits.withPermit { ... }`,',
  'await fixed-size chunks (`items.chunked(20)`), or make one batch call when the API has one.',
  'An exception fits only when the collection is always small.',
].join(' ');
const CONSEQUENCE = 'so a large collection exhausts the';

export const FAN_OUT_MESSAGES = {
  [RULE]: [
    'A task started for every element of a collection makes a remote or message call,',
    `${CONSEQUENCE} connections or rate limit of the remote service. ${ALLOWED}`,
  ].join(' '),
};

function target(kind) {
  return kind === MESSAGE_KIND ? 'broker' : 'remote service';
}

function workText({ call, helper }) {
  return helper === undefined ? `\`${call}\`` : `\`${helper}\`, which reaches \`${call}\`,`;
}

export function fanOutMessage({ starter, collection, work }) {
  const started = `\`${starter}\` starts ${workText(work)} for every element of \`${collection}\` at once`;
  return `${started}, ${CONSEQUENCE} ${target(work.kind)}'s connections or rate limit. ${ALLOWED}`;
}

function startedTasks(project, view) {
  return view.file.scopes.flatMap((scope) => {
    const starter = starterOf(view, scope);
    const work = starter === undefined ? undefined : remoteWork(project, view, scope);
    return work === undefined ? [] : [{ scope, starter, work }];
  });
}

function sitesOf(view, tasks) {
  const bySite = new Map();
  for (const task of tasks) {
    const site = siteOf(view, task.scope);
    if (site !== undefined) {
      bySite.set(site, [...(bySite.get(site) ?? []), task]);
    }
  }
  const started = new Set(tasks.map(({ scope }) => scope.id));
  return [...bySite]
    .filter(([site]) => !isFixed(view, site) && !waitsInside(view, site, started))
    .map(([site, siteTasks]) => ({ site, tasks: siteTasks }));
}

function findingsOf(project, view) {
  const occurrences = new Map();
  return sitesOf(view, startedTasks(project, view))
    .toSorted((left, right) => left.site.line - right.site.line)
    .map(({ site, tasks: [first, ...rest] }) => {
      const collection = collectionLabel(site);
      const owner = view.chain(site.id).find(({ k }) => k === 'fun')?.name ?? '';
      const subject = `${owner} ${collection} ${first.starter} ${first.work.helper ?? first.work.call}`;
      const occurrence = nextOccurrence(occurrences, `${RULE}\0${subject}`);
      const suffix = occurrence === 1 ? '' : `#${String(occurrence)}`;
      return {
        finding: {
          tool: TOOL,
          rule: RULE,
          path: view.file.file,
          identity: `${RULE}:${hash(subject)}${suffix}`,
          message: fanOutMessage({ starter: first.starter, collection, work: first.work }),
          classification: 'enforceable',
          location: { line: site.line },
        },
        lines: [first, ...rest].flatMap(({ work }) => work.lines),
      };
    });
}

export function fanOutFindings({ own, projectFiles, projectRoot, javaRoots }) {
  const project = projectIndex(
    springViews({ files: projectFiles, projectFiles, projectRoot, javaRoots }),
  );
  const reported = springViews({ files: own, projectFiles, projectRoot, javaRoots }).flatMap(
    (view) => findingsOf(project, view),
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
