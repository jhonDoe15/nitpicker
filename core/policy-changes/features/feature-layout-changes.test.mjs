import { describe, expect, it } from 'vitest';
import { featureLayoutChanges } from './feature-layout-changes.mjs';

function layoutChanges(baseConfig, headConfig, files) {
  const { loosened, changed } = featureLayoutChanges(baseConfig, headConfig, { code: files });
  return { loosened: loosened.map(({ text }) => text), changed };
}

describe('featureLayoutChanges', () => {
  it('counts feature and shared roots that take files out of the folder role they had', () => {
    const python = (layout) => ({ preset: 'python', layout });
    const files = [
      'src/app/features/billing/api.py',
      'src/app/features/billing/plugins/pdf/render.py',
      'src/app/shared/ids.py',
    ];
    const roots = ['src/app/features', 'src/app/features/billing/plugins'];

    expect(layoutChanges(python({}), python({ featureRoots: [] }), files).loosened).toEqual([
      'layout.featureRoots: not set -> [] takes files out of the feature or shared folder they were in: src/app/features/billing/api.py, src/app/features/billing/plugins/pdf/render.py',
    ]);
    expect(layoutChanges(python({}), python({ sharedRoots: ['**'] }), files).loosened).toEqual([
      'layout.sharedRoots: not set -> ["**"] takes files out of the feature or shared folder they were in: src/app/features/billing/api.py, src/app/features/billing/plugins/pdf/render.py',
    ]);
    expect(layoutChanges(python({ featureRoots: roots }), python({}), files).loosened).toEqual([
      'layout.featureRoots: ["src/app/features","src/app/features/billing/plugins"] -> not set takes files out of the feature or shared folder they were in: src/app/features/billing/plugins/pdf/render.py',
    ]);
  });

  it('lists feature and shared roots that only add or split folders without counting them', () => {
    const layout = { featureRoots: ['**/features', 'src/a/features/b/c'], sharedRoots: ['src/d'] };
    const files = ['src/a/features/b/c/e/f.py', 'src/d/ids.py'];
    const typescript = { layout: { featureRoots: ['**/src/main/features', 'lib/features'] } };

    expect(layoutChanges({ preset: 'python' }, { preset: 'python', layout }, files)).toEqual({
      loosened: [],
      changed: [
        'layout.sharedRoots: not set -> ["src/d"]; layout.featureRoots: not set -> ["**/features","src/a/features/b/c"]',
      ],
    });
    expect(layoutChanges({}, typescript, ['src/main/features/billing/api.ts'])).toEqual({
      loosened: [],
      changed: ['layout.featureRoots: not set -> ["**/src/main/features","lib/features"]'],
    });
  });
});
