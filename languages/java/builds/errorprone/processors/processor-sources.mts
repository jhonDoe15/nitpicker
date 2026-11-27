import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { engineFindingOf } from '../../../../../shared/engine/engine-rows.mts';
import { fieldOf, listOf } from '../../../../../shared/values/readers.mts';
import { ownClasses, runsProcessors, valuesAfter } from '../engine-arguments.mts';

const PROCESSOR_OUTPUT = '--processor-output=';
const REWRITTEN = '_Rewritten';
const PROJECT_ARG = '--project-arg=';
const PROC_OPTIONS = new Set(['-proc:none', '-proc:only']);

/** The folders where the build's own compile let annotation processors write sources. */
export function processorOutputs(head: readonly string[]): string[] {
  return valuesAfter(head, PROCESSOR_OUTPUT).filter(
    (root) => existsSync(root) && statSync(root).isDirectory(),
  );
}

function javaFilesIn(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.java'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .toSorted();
}

/** The processor folders that hold none of the listed sources: there the engine types code and reports nothing. */
export function contextRoots(head: readonly string[], sources: readonly string[]): string[] {
  const listed = sources.map((source) => path.resolve(source));
  return processorOutputs(head).filter((root) => {
    const inside = `${path.resolve(root)}${path.sep}`;
    return !listed.some((source) => source.startsWith(inside));
  });
}

/** The sources processors wrote that the source set does not list: the engine types them and reports nothing there. */
export function contextFiles(head: readonly string[], sources: readonly string[]): string[] {
  return contextRoots(head, sources).flatMap(javaFilesIn);
}

/** Why a source set whose processors run cannot be compared with its class files, if it cannot. */
export function processorReason(head: readonly string[]): string | undefined {
  if (!runsProcessors(head)) {
    return undefined;
  }
  const off = valuesAfter(head, PROJECT_ARG).find((argument) => PROC_OPTIONS.has(argument));
  if (off !== undefined) {
    return `it runs annotation processors and the project compiles with ${off}`;
  }
  if (ownClasses(head).length === 0) {
    return 'it runs annotation processors and the build names no class folders to compare its classes with';
  }
  return processorOutputs(head).length === 0
    ? 'it runs annotation processors and the folder they write sources to is missing'
    : undefined;
}

/** The environment that has the engine compare each class with its class file and skip the processors' sources. */
export function auditEnvironment(
  head: readonly string[],
  sources: readonly string[],
): Readonly<Record<string, string>> {
  if (!runsProcessors(head)) {
    return {};
  }
  return {
    NP_EP_AUDIT_CLASSES: ownClasses(head).join(path.delimiter),
    NP_EP_CONTEXT_ROOTS: contextRoots(head, sources).join(path.delimiter),
  };
}

/** The classes the engine found changed by a processor, each with what differs from its source. */
export function rewrittenOf(report: unknown): string[] {
  return listOf(fieldOf(report, 'findings'))
    .map(engineFindingOf)
    .filter(({ rule }) => rule === REWRITTEN)
    .map(({ message }) => message);
}
