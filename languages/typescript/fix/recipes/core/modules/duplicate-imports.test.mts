import { describe, expect, it } from 'vitest';
import { applied } from '../test-support/apply-recipe.mts';
import { duplicateImportsRecipe } from './duplicate-imports.mts';

describe('duplicateImportsRecipe', () => {
  it.each([
    [
      "import { a } from './x';\nimport { b, a as c } from './x';\n",
      "import { a, b, a as c } from './x';\n",
    ],
    [
      "import { a } from './x';\nimport { type B } from './x';\n",
      "import { a, type B } from './x';\n",
    ],
    ["import { a } from './x';\nimport main from './x';\n", "import main, { a } from './x';\n"],
    ["import './x';\nimport { a } from './x';\n", "import { a } from './x';\n"],
    ["import { a } from './x';\nimport './x';\n", "import { a } from './x';\n"],
    [
      "import type { A } from './x';\nimport type { B } from './x';\n",
      "import type { A, B } from './x';\n",
    ],
    [
      "import data from './x.json' with { type: 'json' };\nimport { key } from './x.json' with { type: 'json' };\n",
      "import data, { key } from './x.json' with { type: 'json' };\n",
    ],
    [
      "import { a } from './x';\nimport { z } from './z';\nimport { b } from './x';\n",
      "import { a, b } from './x';\nimport { z } from './z';\n",
    ],
  ])('merges %j', (text, expected) => {
    expect(applied(duplicateImportsRecipe, text)).toEqual({ text: expected, notes: [] });
  });

  it('leaves a separate type import, which the preset allows', () => {
    const text = "import { a } from './x';\nimport type { B } from './x';\n";

    expect(applied(duplicateImportsRecipe, text)).toEqual({ text, notes: [] });
  });

  it.each([
    ["import main from './x';\nimport * as all from './x';\n", 'a namespace import'],
    ["import one from './x';\nimport two from './x';\n", 'two default names'],
    [
      "import { a } from './x.json' with { type: 'json' };\nimport { b } from './x.json';\n",
      'different attributes',
    ],
    ["import { a } from './x';\nimport { /* why */ b } from './x';\n", 'a comment'],
  ])('leaves %j with a note', (text, reason) => {
    const fixed = applied(duplicateImportsRecipe, text);

    expect(fixed.text).toBe(text);
    expect(fixed.notes).toEqual([expect.stringContaining(reason)]);
  });
});
