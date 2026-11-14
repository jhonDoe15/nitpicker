import path from 'node:path';
import { editDistance } from '../../../shared/messages/closest-match.mjs';
import { globMatcher } from '../../../shared/paths/glob.mjs';
import { normalizeProjectPath } from '../../configuration/layers/settings.mjs';
import { projectNames } from './project-names.mts';
import type { PlanProject } from '../project-types.mts';

type Named = { readonly path: string; readonly names: readonly string[] };
type Request = {
  readonly projects: readonly PlanProject[];
  readonly requested: readonly string[];
  readonly root: string;
  readonly workingDirectory: string | undefined;
};

const MAX_SUGGESTIONS = 5;
const GLOB = /[*?{[]/u;

const editsBetween: (left: string, right: string) => number | undefined = editDistance;
const matcherOf: (glob: string) => { readonly test: (value: string) => boolean } = globMatcher;
const normalized: (value: string) => string = normalizeProjectPath;

function relativeToCurrent(value: string, request: Request): string | undefined {
  const current = request.workingDirectory ?? process.cwd();
  const relative = path.relative(request.root, path.resolve(current, value));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return undefined;
  }
  return normalized(relative.split(path.sep).join('/'));
}

function globMatches(value: string, named: readonly Named[]): string[] {
  const matcher = matcherOf(value);
  return named
    .filter((entry) => matcher.test(entry.path) || entry.names.some((name) => matcher.test(name)))
    .map((entry) => entry.path);
}

function pathMatch(value: string, request: Request, named: readonly Named[]): string | undefined {
  const fromTop = normalized(value);
  const fromCurrent = relativeToCurrent(value, request);
  return [fromTop, fromCurrent].find((candidate) =>
    named.some((entry) => entry.path === candidate),
  );
}

function ambiguity(value: string, choices: readonly string[]): Error {
  return new Error(
    `--project ${value} names more than one project: ${choices.join(' and ')}. ` +
      'Give the project folder from the top of the monorepo instead.',
  );
}

function exactMatch(value: string, request: Request, named: readonly Named[]): string[] {
  const byPath = pathMatch(value, request, named);
  const byName = named.filter((entry) => entry.names.includes(value)).map((entry) => entry.path);
  const others = byName.filter((folder) => folder !== byPath);
  if (others.length > 0 && (byPath !== undefined || others.length > 1)) {
    throw ambiguity(value, [
      ...(byPath === undefined ? [] : [`${byPath} (path)`]),
      ...others.map((folder) => `${folder} (name)`),
    ]);
  }
  return byPath === undefined ? byName : [byPath];
}

function suggestions(value: string, named: readonly Named[]): string[] {
  const limit = Math.max(2, Math.ceil(value.length / 2));
  const scored = named.flatMap((entry) =>
    [entry.path, ...entry.names].map((candidate) => ({
      candidate,
      score: candidate.includes(value)
        ? 0
        : (editsBetween(value, candidate) ?? Number.POSITIVE_INFINITY),
    })),
  );
  return [
    ...new Set(
      scored
        .filter(({ score }) => score <= limit)
        .toSorted((left, right) => left.score - right.score)
        .map(({ candidate }) => candidate),
    ),
  ].slice(0, MAX_SUGGESTIONS);
}

function unknownMessage(unknown: readonly string[], named: readonly Named[]): string {
  const close = [...new Set(unknown.flatMap((value) => suggestions(value, named)))].slice(
    0,
    MAX_SUGGESTIONS,
  );
  const hint =
    close.length === 0
      ? 'nitpicker projects lists the projects.'
      : `Closest: ${close.join(', ')}. nitpicker projects lists them all.`;
  return (
    `--project ${unknown.join(', ')} matches no project of this repository by folder, ` +
    `folder from the current one, or package name. ${hint}`
  );
}

export function requestedProjects(request: Request): string[] {
  const named = request.projects.map((project) => ({
    path: project.path,
    names: projectNames(project.absolute),
  }));
  const unknown: string[] = [];
  const matched = request.requested.flatMap((value) => {
    const found = GLOB.test(value) ? globMatches(value, named) : exactMatch(value, request, named);
    if (found.length === 0) {
      unknown.push(value);
    }
    return found;
  });
  if (unknown.length > 0) {
    throw new Error(unknownMessage(unknown, named));
  }
  return [...new Set(matched)];
}
