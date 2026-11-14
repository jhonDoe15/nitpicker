import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_LEGACY_INVENTORY } from '../../../shared/legacy-inventory.mjs';
import { containedPath } from '../common/contained-path.mjs';
import { messageOf, parseJson } from '../../../shared/values/readers.mts';
import {
  configuredInventory,
  inventoryFields,
  keyParts,
  sitesOf,
  writeTexts,
  type Change,
  type Counts,
  type Current,
  type Lowered,
  type Plan,
  type Request,
  reduced,
  type WriteRequest,
  type Site,
  type Untouched,
} from './baseline-types.mts';

const FIXED_LINE = /^(.+):\d+ (\S+) \([^)]*\)$/u;
const INDENT = /^\{\r?\n([ \t]+)"/u;

function fixedCounts(fixedFindings: readonly string[]) {
  const counts = new Map<string, number>();
  for (const line of fixedFindings) {
    const [, file, rule] = FIXED_LINE.exec(line) ?? [];
    if (file !== undefined && rule !== undefined) {
      const key = JSON.stringify([file, rule]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function ruleMatches(siteRule: string, fixedRule: string) {
  return siteRule === fixedRule || siteRule === fixedRule.slice(fixedRule.indexOf('/') + 1);
}

function matchingSites(sites: readonly Site[], key: string) {
  const [file, rule] = keyParts(key);
  return sites.filter((site) => site.file === file && ruleMatches(site.rule, rule));
}

function cutsOf(sites: readonly Site[], counts: Counts) {
  const cuts = new Map<Site, number>();
  const ambiguous: string[] = [];
  for (const [key, count] of counts) {
    const matching = matchingSites(sites, key);
    if (matching.length > 1) {
      ambiguous.push(key);
    } else if (
      matching[0] !== undefined &&
      matching.length === 1 &&
      Number.isInteger(matching[0].count)
    ) {
      cuts.set(matching[0], (cuts.get(matching[0]) ?? 0) + count);
    }
  }
  return { cuts, ambiguous };
}

function lowered(sites: readonly Site[], counts: Counts) {
  const { cuts, ambiguous } = cutsOf(sites, counts);
  const changes: Change[] = [];
  const kept = sites.flatMap((site) => {
    const cut = Math.min(site.count, cuts.get(site) ?? 0);
    if (!(cut > 0)) {
      return [site];
    }
    changes.push({ file: site.file, rule: site.rule, from: site.count, to: site.count - cut });
    return site.count - cut > 0 ? [reduced(site, cut)] : [];
  });
  return { kept, changes, ambiguous };
}

function serialized(inventory: unknown, original: string) {
  const indent = INDENT.exec(original)?.[1];
  const text = JSON.stringify(inventory, undefined, indent);
  return original.endsWith('\n') ? `${text}\n` : text;
}

function changeNote({ file, rule, from, to }: Change, name: string) {
  return `${name}: lowered the allowance for ${rule} in ${file} from ${String(from)} to ${String(to)}${to === 0 ? ' (entry removed)' : ''}`;
}

function ambiguousNotes(ambiguous: readonly string[], name: string) {
  return ambiguous.map((key) => {
    const [file, rule] = keyParts(key);
    return `${name}: left the allowances for ${rule} in ${file} as is, because several sites match it and a fix does not say which one it removed`;
  });
}

function untouchedNotes({ sites, selectedRules, counts }: Untouched, name: string) {
  const counted = [...counts.keys()].map((key) => keyParts(key)[1]);
  return selectedRules
    .filter((rule) => !counted.includes(rule) && sites.some((site) => ruleMatches(site.rule, rule)))
    .map(
      (rule) =>
        `${name}: left the allowances for ${rule} as is, because no fix of it was applied and counted`,
    );
}

function readInventory(file: string): Current {
  const bytes = readFileSync(file);
  const original = bytes.toString('utf8');
  const inventory: unknown = parseJson(original);
  return {
    bytes,
    original,
    inventory,
    sites: sitesOf(inventory),
  };
}

function writeLowered({ writer, name, current, kept }: WriteRequest) {
  const text = serialized(
    { ...inventoryFields(current.inventory), sites: kept.map(({ raw }) => raw) },
    current.original,
  );
  const { written, unwritable } = writeTexts(
    writer,
    [{ name, bytes: current.bytes, text }],
    'legacy inventory',
  );
  return {
    errors: unwritable.map((message) => `--fix could not write ${message}`),
    changed: written,
  };
}

function lowerCurrent({ writer, name, current, counts, selectedRules }: Plan): Lowered {
  const { kept, changes, ambiguous } = lowered(current.sites, counts);
  const notes = [
    ...changes.map((change) => changeNote(change, name)),
    ...ambiguousNotes(ambiguous, name),
    ...untouchedNotes({ sites: current.sites, selectedRules, counts }, name),
  ];
  if (changes.length === 0) {
    return { notes, changed: [], errors: [] };
  }
  const { errors, changed } = writeLowered({ writer, name, current, kept });
  return { notes: [...notes, ...errors], changed, errors: [] };
}

export function lowerBaseline(request: Request): Lowered {
  const { projectRoot, writer, config, selectedRules, fixedFindings } = request;
  const name = configuredInventory(config) ?? DEFAULT_LEGACY_INVENTORY;
  try {
    const file = containedPath(projectRoot, name);
    if (!existsSync(file)) {
      return { notes: [], changed: [], errors: [] };
    }
    const current = readInventory(file);
    const counts = fixedCounts(fixedFindings);
    return lowerCurrent({ writer, name, current, counts, selectedRules });
  } catch (error) {
    return {
      notes: [],
      changed: [],
      errors: [`--fix could not lower the legacy inventory ${name}: ${messageOf(error)}`],
    };
  }
}
