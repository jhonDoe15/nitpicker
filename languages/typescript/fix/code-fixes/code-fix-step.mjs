import { fixerError } from '../../../../core/fix/common/fix-command.mjs';
import { readBytes } from '../../../../core/fix/common/fix-files.mjs';
import { formatNotes } from '../../../../core/fix/common/fix-notes.mjs';
import { withFixedLineEndingsOf } from '../../../../core/fix/common/rewrite/line-endings.mjs';
import { writeTexts } from '../../../../core/fix/engine/write-texts.mjs';
import { planCodeFixes } from './plan-code-fixes.mjs';

const TOOL = 'typescript code fixes';

function plan(settings, files, before) {
  const sources = files.map(({ path: name }) => ({
    name,
    text: before.get(name).toString('utf8'),
  }));
  return planCodeFixes({
    projectRoot: settings.projectRoot,
    javascript: settings.layout.javascript === true,
    files: sources,
    selectedRules: settings.selectedRules ?? [],
  });
}

function writePlanned(settings, before, planned) {
  const items = [...planned.texts]
    .map(([name, text]) => ({
      name,
      bytes: before.get(name),
      text: withFixedLineEndingsOf(before.get(name).toString('utf8'), text),
    }))
    .filter(({ name, text }) => text !== before.get(name).toString('utf8'));
  return writeTexts(settings.writer, items, TOOL);
}

export function codeFixStep(settings, files) {
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
        .map(({ name, rule, line }) => `${name}:${line} ${rule} (typescript-code-fix)`),
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
