import type {
  FixRecipe,
  RecipeFix,
  RecipeSource,
  RuleRef,
} from '../../../../../../core/fix/typed/fix-types.mts';
import { generatedFile as untypedGeneratedFile } from '../../../../adapters/kotlin/scan/rules/markers.mjs';
import { lineAt, scanKotlinSource } from './kotlin-scan.mts';
import type { KotlinFound, ScannedKotlin } from './kotlin-scan.mts';

const KOTLIN_FILE = /\.kt$/u;
const TEST_PATH = /(?:^|\/)src\/(?:test|[A-Za-z]*Test)\//u;

const generatedFile: (scanned: ScannedKotlin) => boolean = untypedGeneratedFile;

type KotlinOptions = {
  readonly id: string;
  readonly rules: readonly RuleRef[];
  readonly safety?: string;
  readonly where?: 'main' | 'test' | 'both';
  readonly keepComments?: true;
  readonly find: (scanned: ScannedKotlin, file: RecipeSource) => readonly KotlinFound[];
};

export function isKotlinTestPath(name: string): boolean {
  return TEST_PATH.test(name);
}

function wanted(where: string, name: string): boolean {
  const test = isKotlinTestPath(name);
  return where === 'both' || (where === 'test' ? test : !test);
}

function touchesComment(
  { comments }: ScannedKotlin,
  edits: readonly { readonly start: number; readonly end: number }[],
): boolean {
  return edits.some(({ start, end }) =>
    comments.some((comment) => comment.start < end && start < comment.end),
  );
}

function planFile(options: KotlinOptions, file: RecipeSource): readonly RecipeFix[] {
  const { rules, keepComments, find } = options;
  const { path: name, text } = file;
  const byRule = new Map(rules.map((entry) => [entry.rule, entry]));
  const scanned = scanKotlinSource(text);
  if (generatedFile(scanned)) {
    return [];
  }
  return find(scanned, file)
    .filter(({ edits }) => !(keepComments === true && touchesComment(scanned, edits)))
    .map(({ rule, offset, alsoOffsets, edits }) => {
      const entry = byRule.get(rule ?? '') ?? rules[0];
      function findingAt(at: number): RecipeFix['finding'] {
        return {
          tool: entry?.tool ?? '',
          rule: entry?.rule ?? '',
          path: name,
          line: lineAt(text, at),
        };
      }
      return {
        finding: findingAt(offset),
        ...(alsoOffsets === undefined || alsoOffsets.length === 0
          ? {}
          : { alsoFixes: alsoOffsets.map(findingAt) }),
        edits: edits.map(({ start, end, text: replacement }) => ({
          type: 'replace',
          path: name,
          start,
          end,
          text: replacement,
        })),
      };
    });
}

export function kotlinRecipe(options: KotlinOptions): FixRecipe {
  const { id, rules, safety = 'safe', where = 'main' } = options;
  return {
    id,
    rules,
    presets: ['kotlin'],
    scope: 'file',
    safety,
    plan({ files }) {
      return {
        fixes: files
          .filter(({ path: name }) => KOTLIN_FILE.test(name) && wanted(where, name))
          .flatMap((file) => planFile(options, file)),
      };
    },
  };
}
