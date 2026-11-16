import { lineAt } from '../../../../../../shared/conventions/lines.mjs';
import { scanKotlinSource } from '../../../../adapters/kotlin/scan/kotlin-source.mjs';
import { generatedFile } from '../../../../adapters/kotlin/scan/rules/markers.mjs';

const KOTLIN_FILE = /\.kt$/u;
const TEST_PATH = /(?:^|\/)src\/(?:test|[A-Za-z]*Test)\//u;

export function isKotlinTestPath(name) {
  return TEST_PATH.test(name);
}

function wanted(where, name) {
  const test = isKotlinTestPath(name);
  return where === 'both' || (where === 'test' ? test : !test);
}

function touchesComment({ comments }, edits) {
  return edits.some(({ start, end }) =>
    comments.some((comment) => comment.start < end && start < comment.end),
  );
}

export function kotlinRecipe({
  id,
  rules,
  safety = 'safe',
  where = 'main',
  keepComments = false,
  find,
}) {
  return {
    id,
    rules,
    presets: ['kotlin'],
    scope: 'file',
    safety,
    plan({ files }) {
      const byRule = new Map(rules.map((entry) => [entry.rule, entry]));
      return {
        fixes: files
          .filter(({ path: name }) => KOTLIN_FILE.test(name) && wanted(where, name))
          .flatMap(({ path: name, text }) => {
            const scanned = scanKotlinSource(text);
            return generatedFile(scanned)
              ? []
              : find(scanned, { path: name, text })
                  .filter(({ edits }) => !(keepComments && touchesComment(scanned, edits)))
                  .map(({ rule, offset, edits }) => ({
                    finding: {
                      ...(byRule.get(rule) ?? rules[0]),
                      path: name,
                      line: lineAt(text, offset),
                    },
                    edits: edits.map(({ start, end, text: replacement }) => ({
                      type: 'replace',
                      path: name,
                      start,
                      end,
                      text: replacement,
                    })),
                  }));
          }),
      };
    },
  };
}
