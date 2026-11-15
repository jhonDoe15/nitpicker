import { afterEach, describe, expect, it } from 'vitest';
import { buildFixPlans } from '../../../../../shared/fix-plans/build-fix-plans.mjs';
import { filesEnvironment } from '../../../../../shared/fix-plans/test-support/env.mjs';
import { indexEntries, readReferenceEntries } from '../../../../../shared/reference/store.mjs';
import { fieldOf, fieldsOf, listOf, textOf } from '../../../../../shared/values/readers.mts';
import { createFactsProjects } from '../test-support/facts-projects.mts';

const pythonE2eEnabled = process.env['NITPICKER_PYTHON_E2E'] === '1';

const { nearDuplicates, cleanup } = createFactsProjects();

afterEach(cleanup);

const TOP = 'src/shop/features/top/top.py';
const BOTTOM = 'src/shop/features/bottom/bottom.py';
const INDEX = indexEntries(readReferenceEntries());

const ALIGN = (edge: string, key: string) =>
  [
    `def align_${edge}(elements, state, translate):`,
    '    selected = [e for e in state.selection if not e.locked]',
    `    label = translate("labels.${key}")`,
    `    return render(selected, icon="${edge}", label=label)`,
    '',
  ].join('\n');

describe.skipIf(!pythonE2eEnabled)('the extract-shared-function plan for Python modules', () => {
  const files = {
    [TOP]: ALIGN('top', 'alignTop'),
    [BOTTOM]: ALIGN('bottom', 'alignBottom'),
  };

  it('names the signature and a shared folder, and stops the finding once followed', () => {
    const plans: unknown = buildFixPlans(nearDuplicates(files), {
      index: INDEX,
      env: filesEnvironment(files),
    });
    const context = fieldOf(listOf(plans)[0], 'context');
    const signature = fieldsOf(fieldOf(context, 'signature'));
    const signatureName = textOf(signature['name']);
    const folder = textOf(fieldOf(fieldOf(context, 'location'), 'folder'));
    const copies = listOf(fieldOf(context, 'copies'));

    expect(signature['text']).toBe('align(elements, state, translate, text1, text2)');
    expect(folder).toBe('src/shop/shared');
    const callerArguments = (copy: unknown) =>
      listOf(fieldOf(copy, 'arguments'))
        .map((argument) => textOf(fieldOf(argument, 'value')))
        .join(', ');
    const caller = (copy: unknown) => {
      const symbol = textOf(fieldOf(copy, 'symbol'));
      const call = `${signatureName}(elements, state, translate, ${callerArguments(copy)})`;
      const importLine = `from shop.shared.${signatureName} import ${signatureName}`;
      return `${importLine}\n\n\ndef ${symbol}(elements, state, translate):\n    return ${call}\n`;
    };
    const followed = {
      [TOP]: caller(copies[0]),
      [BOTTOM]: caller(copies[1]),
      [`${folder}/${signatureName}.py`]: [
        `def ${signatureName}(elements, state, translate, text1, text2):`,
        '    selected = [e for e in state.selection if not e.locked]',
        '    label = translate(text1)',
        '    return render(selected, icon=text2, label=label)',
        '',
      ].join('\n'),
    };

    expect(nearDuplicates(followed)).toEqual([]);
  });
});
