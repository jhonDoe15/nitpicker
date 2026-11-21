import {
  partialCandidates,
  wholeCandidates,
} from '../../../../../shared/fix/recipes/extract/candidates.mts';
import { nearDuplicateMatches } from '../../../../../shared/rules/near-duplicates/near-duplicates.mts';
import { declineNote } from '../../../../../shared/fix/recipes/extract/names.mts';
import type { FactUnit } from '../../../../../shared/rules/facts/typed/fact-types.mts';
import type {
  Candidate,
  MatchUnit,
  PartialCandidate,
} from '../../../../../shared/fix/recipes/extract/typed/extract-types.mts';
import { REVIEW } from '../../../../../core/fix/engine/safety.mts';
import type {
  PlanContext,
  ScriptPlanned,
  ScriptRecipe,
  ScriptResult,
} from '../../typed/fix-types.mts';
import type { ScriptOptions, ScriptSettings } from '../../typed/script-types.mts';
import { isText } from '../../../../../shared/values/readers.mts';

type Extraction = { readonly id: string; readonly strategy: 'whole' | 'partial' };

const parseUnits: (text: string) => { readonly units: FactUnit[] } = JSON.parse;
const parseResult: (text: string) => ScriptResult = JSON.parse;
const RULE = 'near-duplicate';
const TOOL = 'structure';
const PYTHON_FILE = /\.py$/u;
const GENERATED = /(?:^|\/)(?:build|dist|\.venv|venv|site-packages|node_modules)\//u;
const STRATEGIES = {
  whole: (matches: unknown) => wholeCandidates(matches, { crossFile: false, textProof: false }),
  partial: partialCandidates,
};

function placed({ file, name, start, end }: MatchUnit) {
  return { file, name, start, end };
}

function payloadOf(candidate: Candidate | PartialCandidate) {
  return {
    reported: candidate.reported,
    first: placed(candidate.first),
    second: placed(candidate.second),
    holes: candidate.finding.parameters?.length ?? 0,
    ...('runs' in candidate ? { runs: candidate.runs } : {}),
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
        notes: [...notes, ...found.declines.map((decline) => declineNote(decline, decline.reason))],
      };
    },
  };
}
