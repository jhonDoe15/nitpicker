import { removeFromArray, removeKeyLines } from './toml-edits.mjs';
import { addDependency, addRaw, declaredEntries } from './pyproject-layout.mjs';

const MANIFEST = 'pyproject.toml';
const TOOL = 'dependencies';
const RULES = ['unused-dependency', 'unlisted-dependency', 'no-dev-dependency-in-production'];
const PREFIXES = {
  'unused-dependency': 'unused:',
  'unlisted-dependency': 'unlisted:',
  'no-dev-dependency-in-production': 'dev-only:',
};

function nameOf(finding) {
  return finding.identity.slice(PREFIXES[finding.rule].length);
}

function removal(text, entry) {
  return entry.kind === 'array'
    ? removeFromArray(text, entry.key, entry.index)
    : removeKeyLines(entry.key);
}

function replaceEdit(edit) {
  return { type: 'replace', path: MANIFEST, ...edit };
}

function decline(finding, reason) {
  return { notes: [`--fix could not fix ${finding.rule} for ${nameOf(finding)}: ${reason}`] };
}

function unlistedFix(text, finding, { versions }) {
  const name = nameOf(finding);
  if (declaredEntries(text).some(({ normalized }) => normalized === name)) {
    return {};
  }
  const version = versions[name];
  if (version === null) {
    return decline(
      finding,
      'its installed version needs a newer Python than requires-python allows',
    );
  }
  if (version === undefined) {
    return decline(finding, 'its installed version could not be read');
  }
  const edit = addDependency(text, { name, version, development: finding.test === true });
  return edit === undefined
    ? decline(finding, `${MANIFEST} has no dependency list to add it to`)
    : { edits: [replaceEdit(edit)] };
}

function unusedFix(text, finding) {
  const entries = declaredEntries(text).filter(
    ({ group, normalized }) => group === 'production' && normalized === nameOf(finding),
  );
  const edits = entries.map((entry) => removal(text, entry));
  return entries.length === 0 || edits.includes(undefined)
    ? decline(finding, `${MANIFEST} does not declare it as a project dependency`)
    : { edits: edits.map(replaceEdit) };
}

function movedFix(text, finding) {
  const entries = declaredEntries(text).filter(
    ({ group, normalized }) => group === 'dev' && normalized === nameOf(finding),
  );
  const added = entries.length === 0 ? undefined : addRaw(text, entries[0]);
  const edits = entries.map((entry) => removal(text, entry));
  return added === undefined || edits.includes(undefined)
    ? decline(finding, `${MANIFEST} does not hold it as a development dependency it can move`)
    : { edits: [...edits, added].map(replaceEdit) };
}

const FIXERS = {
  'unlisted-dependency': unlistedFix,
  'unused-dependency': unusedFix,
  'no-dev-dependency-in-production': movedFix,
};

function planFinding(text, finding, state) {
  if (finding.rule === 'unused-dependency' && finding.path !== MANIFEST) {
    return decline(
      finding,
      `only ${MANIFEST} is edited, and the dependency is listed in ${finding.path}`,
    );
  }
  const planned = FIXERS[finding.rule](text, finding, state);
  return planned.edits === undefined
    ? planned
    : {
        fix: {
          finding: {
            tool: TOOL,
            rule: finding.rule,
            path: finding.path,
            line: finding.location?.line ?? 1,
          },
          edits: planned.edits,
        },
      };
}

function ordered(findings) {
  return [...findings].sort(
    (left, right) => Number(left.test === true) - Number(right.test === true),
  );
}

export const pythonDependenciesRecipe = {
  id: 'python-dependencies',
  rules: RULES.map((rule) => ({ tool: TOOL, rule })),
  presets: ['python'],
  scope: 'project',
  safety: 'review',
  accepts: (name) => name === MANIFEST,
  plan({ read, inputs }) {
    const state = inputs.pythonDependencies;
    const text = read(MANIFEST);
    if (state === undefined || state.findings.length === 0 || text === undefined) {
      return { fixes: [] };
    }
    const handled = new Set();
    const planned = ordered(state.findings)
      .filter(({ rule, identity }) => {
        const key = `${rule}|${identity}`;
        const fresh = !handled.has(key);
        handled.add(key);
        return fresh;
      })
      .map((finding) => planFinding(text, finding, state));
    return {
      fixes: planned.flatMap(({ fix }) => (fix === undefined ? [] : [fix])),
      notes: planned.flatMap(({ notes = [] }) => notes),
    };
  },
};
