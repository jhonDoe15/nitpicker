import {
  partialCandidates as untypedPartialCandidates,
  wholeCandidates as untypedWholeCandidates,
} from '../../../../../shared/fix/recipes/extract/candidates.mjs';
import { nearDuplicateMatches as untypedNearDuplicateMatches } from '../../../../../shared/rules/near-duplicates/near-duplicates.mjs';
import { declineNote as untypedDeclineNote } from '../../../../../shared/fix/recipes/extract/names.mjs';
import { REVIEW } from '../../../../../core/fix/engine/safety.mjs';
import type {
  Decline,
  PlanContext,
  ScriptPlanned,
  ScriptRecipe,
  ScriptResult,
} from '../../typed/fix-types.mts';
import type { ScriptOptions, ScriptSettings } from '../../typed/script-types.mts';
import { isText } from '../../../../../shared/values/readers.mts';

type Span = { readonly start: number; readonly end: number };
type Placed = {
  readonly file: string;
  readonly name: string;
  readonly start: number;
  readonly end: number;
};
type Reported = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly line: number;
};
type Candidate = {
  readonly first: Placed;
  readonly second: Placed;
  readonly reported: Reported;
  readonly finding: { readonly parameters: readonly unknown[] };
  readonly runs?: readonly Span[];
};
type Candidates = { readonly candidates: Candidate[]; readonly notes: string[] };
type Unit = { readonly file: string };
type Extraction = { readonly id: string; readonly strategy: 'whole' | 'partial' };

const wholeCandidates: (
  matches: readonly unknown[],
  options: { readonly crossFile: boolean; readonly textProof: boolean },
) => Candidates = untypedWholeCandidates;
const partialCandidates: (matches: readonly unknown[]) => Candidates = untypedPartialCandidates;
const nearDuplicateMatches: (
  units: readonly Unit[],
  options: { readonly isExcepted: () => boolean },
) => readonly unknown[] = untypedNearDuplicateMatches;

const declineNote: (reported: Reported, reason: string) => string = untypedDeclineNote;
const parseUnits: (text: string) => { readonly units: Unit[] } = JSON.parse;
const parseResult: (text: string) => ScriptResult = JSON.parse;
const RULE = 'near-duplicate';
const TOOL = 'structure';
const PYTHON_FILE = /\.py$/u;
const GENERATED = /(?:^|\/)(?:build|dist|\.venv|venv|site-packages|node_modules)\//u;
const STRATEGIES = {
  whole: (matches: readonly unknown[]) =>
    wholeCandidates(matches, { crossFile: false, textProof: false }),
  partial: partialCandidates,
};

function placed({ file, name, start, end }: Placed): Placed {
  return { file, name, start, end };
}

function payloadOf(candidate: Candidate) {
  return {
    reported: candidate.reported,
    first: placed(candidate.first),
    second: placed(candidate.second),
    holes: candidate.finding.parameters.length,
    ...(candidate.runs === undefined ? {} : { runs: candidate.runs }),
  };
}

function testFilesOf(options: ScriptOptions): Set<string> {
  const value = options['testFiles'];
  return new Set(Array.isArray(value) ? value.filter(isText) : []);
}

function sourceFiles({ files, inputs }: PlanContext, options: ScriptOptions): PlanContext['files'] {
  const isExcepted = inputs.isExcepted ?? (() => false);
  const tests = testFilesOf(options);
  return files.filter(
    ({ path: name }) =>
      PYTHON_FILE.test(name) &&
      !GENERATED.test(name) &&
      !tests.has(name) &&
      !isExcepted(RULE, name),
  );
}

export function extractionRecipe(
  { id, strategy }: Extraction,
  { runScript, optionsFor }: ScriptSettings,
): ScriptRecipe {
  return {
    id,
    rules: [{ tool: TOOL, rule: RULE }],
    presets: ['python'],
    scope: 'file',
    safety: REVIEW,
    plan(context: PlanContext): ScriptPlanned {
      const sources = sourceFiles(context, optionsFor(context.files));
      if (sources.length === 0) {
        return { fixes: [], notes: [] };
      }
      const { units } = parseUnits(
        runScript(JSON.stringify({ mode: 'near-units', files: sources })),
      );
      const { candidates, notes } = STRATEGIES[strategy](
        nearDuplicateMatches(units, { isExcepted: () => false }),
      );
      if (candidates.length === 0) {
        return { fixes: [], notes };
      }
      const found = parseResult(
        runScript(
          JSON.stringify({
            mode: 'near-extract',
            strategy,
            files: sources,
            candidates: candidates.map(payloadOf),
          }),
        ),
      );
      return {
        fixes: found.fixes,
        notes: [
          ...notes,
          ...found.declines.map((decline: Decline) =>
            declineNote({ ...decline, tool: TOOL }, decline.reason),
          ),
        ],
      };
    },
  };
}
