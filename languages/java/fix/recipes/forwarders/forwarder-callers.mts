import {
  importEdit,
  standingOf,
  unusedImport,
  type Source,
  type SpanEdit,
} from '../source/java-source.mts';
import { escapeRegExp } from '../../../adapters/typed/regex-escape.mts';
import { classify, type Call } from './forwarder-calls.mts';
import type { Forwarder } from './forwarder-parse.mts';
import { accessibleFrom, type Resolved } from './forwarder-target.mts';

type OtherFile = { readonly path: string; readonly text: string };
export type Project = {
  readonly sources: readonly Source[];
  readonly others: readonly OtherFile[];
};
export type CallerPlan =
  { readonly edits: ReadonlyMap<string, readonly SpanEdit[]> } | { readonly declined: string };
type Scan = { readonly edits: readonly SpanEdit[] } | { readonly declined: string };

function isDeclined(scan: Scan): scan is { readonly declined: string } {
  return 'declined' in scan;
}

function typeNameOf(forwarder: Forwarder, resolved: Resolved): string {
  return forwarder.qualifier ?? resolved.type.name;
}

function editOf(forwarder: Forwarder, resolved: Resolved, { at, qualifierAt }: Call): SpanEdit {
  const end = at + forwarder.method.name.length;
  if (forwarder.kind === 'shim') {
    return { start: at, end, text: forwarder.target };
  }
  return {
    start: qualifierAt ?? at,
    end,
    text: `${typeNameOf(forwarder, resolved)}.${forwarder.target}`,
  };
}

function importNeed(forwarder: Forwarder, resolved: Resolved, source: Source): string {
  if (forwarder.kind === 'shim' || source.path === forwarder.source.path) {
    return 'none';
  }
  const standing = standingOf(source, typeNameOf(forwarder, resolved), resolved.fqn);
  const samePackage = source.packageName === resolved.source.packageName;
  if (standing === 'same' || (standing === 'free' && samePackage)) {
    return 'none';
  }
  return standing === 'free' ? 'import' : 'conflict';
}

function mentions(forwarder: Forwarder, source: Source): string | undefined {
  const { name } = forwarder.method;
  const own = source.path === forwarder.source.path;
  const { start, end } = forwarder.range;
  const text = own ? source.text.slice(0, start) + source.text.slice(end) : source.text;
  const reference = new RegExp(
    String.raw`(?<![\w.$])#\s*${escapeRegExp(name)}\b|\b${escapeRegExp(forwarder.owner.name)}#${escapeRegExp(name)}\b`,
    'u',
  );
  if (reference.test(text)) {
    return `${source.path} refers to ${name} in a doc comment`;
  }
  return new RegExp(String.raw`"${escapeRegExp(name)}"`, 'u').test(source.literals)
    ? `${source.path} has the string "${name}", which may name the method`
    : undefined;
}

function scanSource(forwarder: Forwarder, resolved: Resolved, source: Source): Scan {
  const { name, start, close } = forwarder.method;
  const own = source.path === forwarder.source.path;
  const word = new RegExp(String.raw`\b${escapeRegExp(name)}\b`, 'gu');
  const classified = [...source.code.matchAll(word)]
    .filter(({ index }) => !(own && index >= start && index <= close))
    .map(({ index }) => classify({ forwarder, source, at: index }));
  const calls = classified.filter((item): item is Call => typeof item === 'object');
  const problem = classified.find((item) => typeof item === 'string');
  const need = calls.length === 0 ? 'none' : importNeed(forwarder, resolved, source);
  const unreachable = calls.some((call) => !accessibleFrom(resolved, source, call.at));
  const reason =
    mentions(forwarder, source) ??
    problem ??
    (unreachable || need === 'conflict'
      ? `${source.path} cannot reach the target ${forwarder.target}`
      : undefined);
  if (reason !== undefined) {
    return { declined: reason };
  }
  const qualified = calls.filter(({ qualifierAt }) => qualifierAt !== undefined).length;
  const cleanup =
    forwarder.kind === 'wrapper' && !own
      ? unusedImport(source, forwarder.owner.name, qualified)
      : undefined;
  return {
    edits: [
      ...calls.map((call) => editOf(forwarder, resolved, call)),
      ...(need === 'import' ? [importEdit(source, resolved.fqn)] : []),
      ...(cleanup === undefined ? [] : [cleanup]),
    ],
  };
}

function inheritedBy(forwarder: Forwarder, project: Project): string | undefined {
  const { owner } = forwarder;
  const extending = new RegExp(
    String.raw`\bextends\s+(?:[\w.]+\.)?${escapeRegExp(owner.name)}\b`,
    'u',
  );
  return owner.kind === 'class'
    ? project.sources.find((source) => extending.test(source.code))?.path
    : undefined;
}

type Request = {
  readonly forwarder: Forwarder;
  readonly resolved: Resolved;
  readonly project: Project;
  readonly accepts: (name: string) => boolean;
};

function projectProblem({ forwarder, project }: Request): string | undefined {
  const { name } = forwarder.method;
  const word = new RegExp(String.raw`\b${escapeRegExp(name)}\b`, 'u');
  const ownerWord = new RegExp(String.raw`\b${escapeRegExp(forwarder.owner.name)}\b`, 'u');
  const foreign = project.others.find(
    (other) => word.test(other.text) && ownerWord.test(other.text),
  );
  const subclass = inheritedBy(forwarder, project);
  if (foreign !== undefined) {
    return `${foreign.path} is not Java and mentions ${forwarder.owner.name} and ${name}`;
  }
  return subclass === undefined
    ? undefined
    : `${subclass} extends ${forwarder.owner.name}, which inherits ${name}`;
}

export function callerEdits(request: Request): CallerPlan {
  const { forwarder, resolved, project, accepts } = request;
  const problem = projectProblem(request);
  if (problem !== undefined) {
    return { declined: problem };
  }
  const scans = project.sources.map((source) => ({
    source,
    scan: scanSource(forwarder, resolved, source),
  }));
  const failed = scans.map(({ scan }) => scan).find(isDeclined);
  const edits = new Map(
    scans.flatMap(({ source, scan }) =>
      !isDeclined(scan) && scan.edits.length > 0 ? [[source.path, scan.edits] as const] : [],
    ),
  );
  const refused = [...edits.keys()].find((path) => !accepts(path));
  if (failed !== undefined) {
    return failed;
  }
  return refused === undefined
    ? { edits }
    : { declined: `${refused} is outside the files --fix covers` };
}
