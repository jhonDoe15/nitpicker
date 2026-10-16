import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { reachableModules } from '../../../../modules/module-resolution.mjs';
import { scanDomEvidence } from './dom-evidence.mjs';

const LIMITS = { maxDepth: 8, maxFiles: 200 };
const COMPONENT_MODULE = /\.(?:[jt]sx|vue|svelte|astro)$/u;
const SCANNED_MODULE = /\.(?:[cm]?[jt]sx?)$/u;

const evidenceCache = new Map();

function fileStamp(file) {
  const stats = statSync(file, { throwIfNoEntry: false });
  return stats === undefined ? undefined : `${String(stats.mtimeMs)}:${String(stats.size)}`;
}

function evidenceOf(file) {
  const stamp = fileStamp(file);
  if (stamp === undefined) return undefined;
  const cached = evidenceCache.get(file);
  if (cached?.stamp === stamp) return cached.evidence;
  const evidence = scanDomEvidence(readFileSync(file, 'utf8'), file);
  evidenceCache.set(file, { stamp, evidence });
  return evidence;
}

function scannedEvidence(file) {
  return SCANNED_MODULE.test(file) && !file.endsWith('.d.ts') ? evidenceOf(file) : undefined;
}

function domVerdict(file, signal) {
  if (signal === 'usesDom' && COMPONENT_MODULE.test(file)) return true;
  const evidence = scannedEvidence(file);
  if (evidence?.[signal] === true) return true;
  return evidence?.opaqueImport === true ? undefined : false;
}

function closureVerdict(entryFile, { entrySpecifiers, aliases, signal }) {
  function specifiersOf(file) {
    return file === entryFile ? entrySpecifiers : (scannedEvidence(file)?.specifiers ?? []);
  }
  for (const step of reachableModules(entryFile, specifiersOf, { ...LIMITS, aliases })) {
    const verdict = step.truncated === true ? undefined : domVerdict(step.file, signal);
    if (verdict !== false) return verdict;
  }
  return false;
}

export function closureUsesDom(entryFile, entrySpecifiers, aliases = []) {
  return closureVerdict(entryFile, { entrySpecifiers, aliases, signal: 'usesDom' });
}

const SETUP_ENTRY = '__nitpicker_setup_entry__.ts';

function setupFileVerdict(entry, directory, aliases) {
  if (path.isAbsolute(entry) && !existsSync(entry)) return undefined;
  const syntheticFile = path.join(directory, SETUP_ENTRY);
  const { specifiers } = scanDomEvidence(`import ${JSON.stringify(entry)};`, syntheticFile);
  return closureVerdict(syntheticFile, {
    entrySpecifiers: specifiers,
    aliases,
    signal: 'touchesDom',
  });
}

export function setupUsesDom(setupFiles, directory, aliases = []) {
  return setupFiles.some((entry) => setupFileVerdict(entry, directory, aliases) !== false);
}
