import { afterEach, describe, expect, it } from 'vitest';
import { buildFixPlans } from '../../../../../shared/fix-plans/build-fix-plans.mjs';
import { filesEnvironment } from '../../../../../shared/fix-plans/test-support/env.mjs';
import { indexEntries, readReferenceEntries } from '../../../../../shared/reference/store.mjs';
import { pythonE2eEnabled } from '../../e2e/test-support/python-e2e-support.mjs';
import { createFactsProjects } from '../test-support/facts-projects.mjs';

const { factsOf, cleanup } = createFactsProjects();

afterEach(cleanup);

const TOP = 'src/shop/features/top/top.py';
const BOTTOM = 'src/shop/features/bottom/bottom.py';
const INDEX = indexEntries(readReferenceEntries());

const ALIGN = (edge, key) =>
  [
    `def align_${edge}(elements, state, translate):`,
    '    selected = [e for e in state.selection if not e.locked]',
    `    label = translate("labels.${key}")`,
    `    return render(selected, icon="${edge}", label=label)`,
    '',
  ].join('\n');

function nearDuplicates(files) {
  return factsOf(files)
    .findings()
    .filter(({ rule }) => rule === 'near-duplicate');
}

describe.skipIf(!pythonE2eEnabled)('the extract-shared-function plan for Python modules', () => {
  const files = {
    [TOP]: ALIGN('top', 'alignTop'),
    [BOTTOM]: ALIGN('bottom', 'alignBottom'),
  };

  it('names the signature and a shared folder, and stops the finding once followed', () => {
    const [plan] = buildFixPlans(nearDuplicates(files), {
      index: INDEX,
      env: filesEnvironment(files),
    });
    const { signature, copies, location } = plan.context;

    expect(signature.text).toBe('align(elements, state, translate, text1, text2)');
    expect(location.folder).toBe('src/shop/shared');
    const caller = (copy) =>
      `from shop.shared.${signature.name} import ${signature.name}\n\n\ndef ${copy.symbol}(elements, state, translate):\n    return ${signature.name}(elements, state, translate, ${copy.arguments.map(({ value }) => value).join(', ')})\n`;
    const followed = {
      [TOP]: caller(copies[0]),
      [BOTTOM]: caller(copies[1]),
      [`${location.folder}/${signature.name}.py`]: `def ${signature.name}(elements, state, translate, text1, text2):\n    selected = [e for e in state.selection if not e.locked]\n    label = translate(text1)\n    return render(selected, icon=text2, label=label)\n`,
    };

    expect(nearDuplicates(followed)).toEqual([]);
  });
});
