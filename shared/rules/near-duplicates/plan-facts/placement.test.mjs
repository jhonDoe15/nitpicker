import { describe, expect, it } from 'vitest';
import { featureRoles } from '../../features/feature-roles.mjs';
import { suggestedPlace } from './placement.mjs';

const LAYOUT = {
  sharedRoots: ['src/shared'],
  featureRoots: ['src/features'],
};
const roleOf = featureRoles(LAYOUT);
const SEVERAL_FEATURES =
  'the copies are in different places, and shared code may be used by several features (shared-used-by-one-feature)';

function place(paths, files = []) {
  return suggestedPlace(paths, { roleOf, files });
}

describe('suggestedPlace', () => {
  it('picks the shared folder when the copies are in two features', () => {
    expect(
      place(['src/features/cart/total.ts', 'src/features/order/total.ts'], ['src/shared/money.ts']),
    ).toEqual({ folder: 'src/shared', kind: 'shared', reason: SEVERAL_FEATURES });
  });

  it('picks the existing shared folder nearest to the copies', () => {
    const files = ['src/shared/money.ts', 'src/other/shared/x.ts'];

    expect(
      suggestedPlace(['src/other/a/total.ts', 'src/other/b/total.ts'], {
        roleOf: featureRoles({ sharedRoots: ['**/shared'], featureRoots: ['**/features'] }),
        files,
      }),
    ).toEqual({ folder: 'src/other/shared', kind: 'shared', reason: SEVERAL_FEATURES });
  });

  it('keeps the function in the feature when both copies are in one feature', () => {
    const found = place(['src/features/cart/a/total.ts', 'src/features/cart/b/total.ts']);

    expect(found).toEqual({
      folder: 'src/features/cart',
      kind: 'feature',
      reason:
        'both copies are in the cart feature, so a shared folder would have one feature as its only user (shared-used-by-one-feature)',
    });
    expect(roleOf(`${found.folder}/module.ts`)).toEqual({
      kind: 'feature',
      directory: 'src/features/cart',
      name: 'cart',
    });
  });

  it('creates the shared folder the layout names when none exists', () => {
    expect(place(['src/features/cart/total.ts', 'src/features/order/total.ts'])).toEqual({
      folder: 'src/shared',
      kind: 'shared',
      reason: SEVERAL_FEATURES,
    });
  });

  it('keeps the function beside copies that are already in shared code', () => {
    expect(place(['src/shared/a/x.ts', 'src/shared/b/x.ts'])).toEqual({
      folder: 'src/shared',
      kind: 'shared',
      reason: 'both copies are already in shared code',
    });
  });

  it('falls back to the common folder when the layout has no shared folder to offer', () => {
    expect(
      suggestedPlace(['app/a/x.ts', 'app/b/x.ts'], {
        roleOf: featureRoles({ sharedRoots: ['lib'], featureRoots: [] }),
      }),
    ).toEqual({
      folder: 'app',
      kind: 'common',
      reason:
        'the layout rules name no shared folder for these files, so this is their nearest common folder',
    });
  });

  it('reads the default layout when none is given', () => {
    expect(suggestedPlace(['a/features/x/p.py', 'a/features/y/q.py'])).toEqual({
      folder: 'a/shared',
      kind: 'shared',
      reason: SEVERAL_FEATURES,
    });
  });
});
