import type { FixFile, FixSettings, FixStep } from '../../../../core/fix/typed/fix-types.mts';
import {
  fixerError,
  formatNotes,
  withFixedLineEndingsOf,
  writeTexts,
  type Layout,
} from '../typed/fix-views.mts';
import { type Bytes, readBytes } from '../../../../core/fix/typed/fix-pipeline.mts';
import { planCodeFixes } from './plan-code-fixes.mts';

type CodeFixSettings = Pick<FixSettings, 'projectRoot' | 'selectedRules' | 'writer'> & {
  readonly layout: Layout;
};
type Planned = ReturnType<typeof planCodeFixes>;

const TOOL = 'typescript code fixes';

function plan(settings: CodeFixSettings, files: readonly FixFile[], before: Bytes): Planned {
  const sources = files.map(({ path: name }) => ({
    name,
    text: before.get(name)?.toString('utf8') ?? '',
  }));
  return planCodeFixes({
    projectRoot: settings.projectRoot,
    javascript: settings.layout.javascript,
    files: sources,
    selectedRules: settings.selectedRules,
  });
}

function writePlanned(settings: CodeFixSettings, before: Bytes, planned: Planned) {
  const items = [...planned.texts]
    .map(([name, text]) => ({
      name,
      bytes: before.get(name),
      text: withFixedLineEndingsOf(before.get(name)?.toString('utf8') ?? '', text),
    }))
    .filter(({ name, text }) => text !== before.get(name)?.toString('utf8'));
  return writeTexts(settings.writer, items, TOOL);
}

export function codeFixStep(settings: CodeFixSettings, files: readonly FixFile[]): FixStep {
  if (files.length === 0) {
    return { toolErrors: [], notes: [], fixedFindings: [] };
  }
  const before = readBytes(settings.projectRoot, files);
  try {
    const planned = plan(settings, files, before);
    const { written, changedMeanwhile, unwritable } = writePlanned(settings, before, planned);
    const kept = new Set(written);
    return {
      toolErrors: [],
      fixedFindings: planned.applied
        .filter(({ name }) => kept.has(name))
        .map(({ name, rule, line }) => `${name}:${String(line)} ${rule} (typescript-code-fix)`),
      notes: formatNotes(TOOL, {
        rewritten: written,
        changedMeanwhile,
        unwritable,
        unformattable: [],
        keptAsIs: [],
      }),
    };
  } catch (error) {
    return { toolErrors: [fixerError('typescript-code-fix', error)], notes: [], fixedFindings: [] };
  }
}
