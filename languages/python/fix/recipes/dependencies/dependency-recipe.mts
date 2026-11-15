import { removeFromArray, removeKeyLines } from './toml-edits.mts';
import { addDependency, addRaw, declaredEntries } from './pyproject-layout.mts';

import type {
  DeclaredEntry,
  DependencyFinding,
  DependencyInputs,
  PlanContext,
  ReplaceEdit,
  Planned,
  RecipeFix,
  TextEdit,
} from '../../typed/fix-types.mts';

type Step = { edits?: ReplaceEdit[]; notes?: string[] };
type Fixer = (text: string, finding: DependencyFinding, state: DependencyInputs) => Step;

const MANIFEST = 'pyproject.toml';
const TOOL = 'dependencies';
const RULES = ['unused-dependency', 'unlisted-dependency', 'no-dev-dependency-in-production'];
const PREFIXES: Record<string, string> = {
  'unused-dependency': 'unused:',
  'unlisted-dependency': 'unlisted:',
  'no-dev-dependency-in-production': 'dev-only:',
};

function nameOf(finding: DependencyFinding): string {
  return finding.identity.slice(PREFIXES[finding.rule]?.length);
}

function allEdits(edits: (TextEdit | undefined)[]): TextEdit[] | undefined {
  const found = edits.filter((edit) => edit !== undefined);
  return found.length === edits.length ? found : undefined;
}

function removal(text: string, entry: DeclaredEntry): TextEdit | undefined {
  return entry.kind === 'array'
    ? removeFromArray(text, entry.key, entry.index)
    : removeKeyLines(entry.key);
}

function replaceEdit(edit: TextEdit): ReplaceEdit {
  return { type: 'replace', path: MANIFEST, ...edit };
}

function decline(finding: DependencyFinding, reason: string): Step {
  return { notes: [`--fix could not fix ${finding.rule} for ${nameOf(finding)}: ${reason}`] };
}

function unlistedFix(
  text: string,
  finding: DependencyFinding,
  { versions }: DependencyInputs,
): Step {
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
  if (typeof version !== 'string') {
    return decline(finding, 'its installed version could not be read');
  }
  const edit = addDependency(text, { name, version, development: finding.test });
  return edit === undefined
    ? decline(finding, `${MANIFEST} has no dependency list to add it to`)
    : { edits: [replaceEdit(edit)] };
}

function unusedFix(text: string, finding: DependencyFinding): Step {
  const entries = declaredEntries(text).filter(
    ({ group, normalized }) => group === 'production' && normalized === nameOf(finding),
  );
  const edits = allEdits(entries.map((entry) => removal(text, entry)));
  return entries.length === 0 || edits === undefined
    ? decline(finding, `${MANIFEST} does not declare it as a project dependency`)
    : { edits: edits.map(replaceEdit) };
}

function movedFix(text: string, finding: DependencyFinding): Step {
  const entries = declaredEntries(text).filter(
    ({ group, normalized }) => group === 'dev' && normalized === nameOf(finding),
  );
  const added = entries.length === 0 ? undefined : addRaw(text, entries[0]);
  const edits = allEdits(entries.map((entry) => removal(text, entry)));
  return added === undefined || edits === undefined
    ? decline(finding, `${MANIFEST} does not hold it as a development dependency it can move`)
    : { edits: [...edits, added].map(replaceEdit) };
}

const FIXERS: Record<string, Fixer> = {
  'unlisted-dependency': unlistedFix,
  'unused-dependency': unusedFix,
  'no-dev-dependency-in-production': movedFix,
};

function planFinding(
  text: string,
  finding: DependencyFinding,
  state: DependencyInputs,
): { fix?: RecipeFix; notes?: string[] } {
  if (finding.rule === 'unused-dependency' && finding.path !== MANIFEST) {
    return decline(
      finding,
      `only ${MANIFEST} is edited, and the dependency is listed in ${finding.path}`,
    );
  }
  const fixer = FIXERS[finding.rule];
  if (fixer === undefined) {
    return decline(finding, 'its rule has no fixer');
  }
  const planned = fixer(text, finding, state);
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

function ordered(findings: readonly DependencyFinding[]): DependencyFinding[] {
  return [...findings].sort((left, right) => Number(left.test) - Number(right.test));
}

export const pythonDependenciesRecipe = {
  id: 'python-dependencies',
  rules: RULES.map((rule) => ({ tool: TOOL, rule })),
  presets: ['python'],
  scope: 'project',
  safety: 'review',
  accepts: (name: string): boolean => name === MANIFEST,
  plan({ read, inputs }: PlanContext): Planned {
    const state = inputs.pythonDependencies;
    const text = read(MANIFEST);
    if (state === undefined || state.findings.length === 0 || text === undefined) {
      return { fixes: [] };
    }
    const handled = new Set<string>();
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
