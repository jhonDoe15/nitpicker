import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_LEGACY_INVENTORY } from '../../../shared/legacy-inventory.mjs';
import { containedPath } from '../common/contained-path.mjs';
import { writeTexts } from '../engine/write-texts.mjs';

const FIXED_LINE = /^(.+):\d+ (\S+) \([^)]*\)$/u;
const INDENT = /^\{\r?\n([ \t]+)"/u;

function fixedCounts(fixedFindings) {
  const counts = new Map();
  for (const line of fixedFindings) {
    const [, file, rule] = FIXED_LINE.exec(line) ?? [];
    if (file !== undefined) {
      const key = JSON.stringify([file, rule]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function ruleMatches(siteRule, fixedRule) {
  return siteRule === fixedRule || siteRule === fixedRule.slice(fixedRule.indexOf('/') + 1);
}

function matchingSites(sites, key) {
  const [file, rule] = JSON.parse(key);
  return sites.filter((site) => site.file === file && ruleMatches(site.rule, rule));
}

function cutsOf(sites, counts) {
  const cuts = new Map();
  const ambiguous = [];
  for (const [key, count] of counts) {
    const matching = matchingSites(sites, key);
    if (matching.length > 1) {
      ambiguous.push(key);
    } else if (matching.length === 1 && Number.isInteger(matching[0].count)) {
      cuts.set(matching[0], (cuts.get(matching[0]) ?? 0) + count);
    }
  }
  return { cuts, ambiguous };
}

function lowered(sites, counts) {
  const { cuts, ambiguous } = cutsOf(sites, counts);
  const changes = [];
  const kept = sites.flatMap((site) => {
    const cut = Math.min(site.count, cuts.get(site) ?? 0);
    if (!(cut > 0)) {
      return [site];
    }
    changes.push({ file: site.file, rule: site.rule, from: site.count, to: site.count - cut });
    return site.count - cut > 0 ? [{ ...site, count: site.count - cut }] : [];
  });
  return { kept, changes, ambiguous };
}

function serialized(inventory, original) {
  const indent = INDENT.exec(original)?.[1];
  const text = JSON.stringify(inventory, undefined, indent);
  return original.endsWith('\n') ? `${text}\n` : text;
}

function changeNote({ file, rule, from, to }, name) {
  return `${name}: lowered the allowance for ${rule} in ${file} from ${String(from)} to ${String(to)}${to === 0 ? ' (entry removed)' : ''}`;
}

function ambiguousNotes(ambiguous, name) {
  return ambiguous.map((key) => {
    const [file, rule] = JSON.parse(key);
    return `${name}: left the allowances for ${rule} in ${file} as is, because several sites match it and a fix does not say which one it removed`;
  });
}

function untouchedNotes({ sites, selectedRules, counts }, name) {
  const counted = [...counts.keys()].map((key) => JSON.parse(key)[1]);
  return selectedRules
    .filter((rule) => !counted.includes(rule) && sites.some((site) => ruleMatches(site.rule, rule)))
    .map(
      (rule) =>
        `${name}: left the allowances for ${rule} as is, because no fix of it was applied and counted`,
    );
}

function readInventory(file) {
  const bytes = readFileSync(file);
  const original = bytes.toString('utf8');
  const inventory = JSON.parse(original);
  return {
    bytes,
    original,
    inventory,
    sites: Array.isArray(inventory.sites) ? inventory.sites : [],
  };
}

function writeLowered({ writer, name, current, kept }) {
  const text = serialized({ ...current.inventory, sites: kept }, current.original);
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

function lowerCurrent({ writer, name, current, counts, selectedRules }) {
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

export function lowerBaseline({ projectRoot, writer, config, selectedRules, fixedFindings }) {
  const name = config?.legacyInventory ?? DEFAULT_LEGACY_INVENTORY;
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
      errors: [`--fix could not lower the legacy inventory ${name}: ${error.message}`],
    };
  }
}
