import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { fixOf } from './fix-data.mts';
import type { FixData, FixEdit } from './fix-data.mts';

function replacement(edit: FixEdit, fix: FixData): object {
  if (edit.type === 'replace') {
    return {
      deletedRegion: { charOffset: edit.start, charLength: edit.end - edit.start },
      insertedContent: { text: edit.text },
    };
  }
  return {
    deletedRegion: { charOffset: 0, charLength: fix.textLength },
    insertedContent: { text: edit.text },
  };
}

function replaceable(fix: FixData): boolean {
  return (
    fix.edits.length > 0 &&
    fix.edits.every(({ type }) => type === 'replace' || fix.textLength !== undefined)
  );
}

export function sarifFixes(
  finding: ReportEntry,
  artifactLocation: (name: string) => object,
): object {
  const fix = fixOf(finding);
  if (fix === undefined || !replaceable(fix)) {
    return {};
  }
  const paths = [...new Set(fix.edits.map(({ path }) => path))];
  return {
    fixes: [
      {
        description: { text: `Apply the ${fix.recipe} fix (${fix.safety}).` },
        artifactChanges: paths.map((name) => ({
          artifactLocation: artifactLocation(name),
          replacements: fix.edits
            .filter(({ path }) => path === name)
            .map((edit) => replacement(edit, fix)),
        })),
        properties: { recipe: fix.recipe, safety: fix.safety },
      },
    ],
  };
}
