import { describe, expect, it } from 'vitest';
import { featureRoleContract, featureRoles, PUBLIC_FACES } from './feature-roles.mjs';

describe('feature roles', () => {
  const roleOf = featureRoles({ sharedRoots: ['**/shared'], featureRoots: ['app/features'] });

  it.each([
    ['app/shared/money.py', { kind: 'shared' }],
    ['app/features/billing/invoice.py', { kind: 'feature', directory: 'app/features/billing' }],
    ['app/features/readme.py', { kind: 'other' }],
    ['lib/features/billing/invoice.py', { kind: 'other' }],
    ['app/features/shared/tax.py', { kind: 'shared' }],
    ['app/features/billing/shared/tax.py', { kind: 'feature', directory: 'app/features/billing' }],
  ])('%s is %j', (file, role) => {
    expect(roleOf(file)).toEqual(role);
  });
});

describe('the feature role contract', () => {
  const layout = { featureRoots: ['src/app/features'] };
  const python = featureRoleContract(layout, PUBLIC_FACES.python);
  const jvm = featureRoleContract(layout, PUBLIC_FACES.jvm);

  it.each([
    ['__init__.py', true],
    ['api.py', true],
    ['_rates.py', false],
    ['__main__.py', false],
    ['internal/rates.py', false],
    ['internal/__init__.py', false],
  ])('Python: billing/%s is public: %s', (file, isPublic) => {
    expect(python(`src/app/features/billing/${file}`)).toMatchObject({
      kind: 'feature',
      name: 'billing',
      directory: 'src/app/features/billing',
      isPublic,
    });
  });

  it.each([
    ['Invoice.java', true],
    ['internal/Rates.java', false],
  ])('JVM: billing/%s is public: %s', (file, isPublic) => {
    expect(jvm(`src/app/features/billing/${file}`)).toMatchObject({ isPublic });
  });

  it('describes the public face it judges by, and leaves shared and other files as they are', () => {
    expect(python('src/app/features/billing/_rates.py').face).toBe(
      'its __init__.py (a name it imports from an internal module counts) or a module directly in src/app/features/billing/ whose name does not start with "_"',
    );
    expect(jvm('src/app/features/billing/Invoice.java').face).toBe(
      'a class directly in the feature package src/app/features/billing/',
    );
    expect(python('src/app/shared/money.py')).toEqual({ kind: 'shared' });
    expect(python('src/app/main.py')).toEqual({ kind: 'other' });
  });

  it('defaults to the **/features and **/shared folders', () => {
    const roleOf = featureRoleContract(undefined, PUBLIC_FACES.python);

    expect(roleOf('pkg/features/orders/cart.py')).toMatchObject({ name: 'orders' });
    expect(roleOf('pkg/shared/ids.py')).toEqual({ kind: 'shared' });
  });

  it.each([[undefined], [{}], [{ isPublic: () => true }]])(
    'rejects %j as the public face',
    (face) => {
      expect(() => featureRoleContract(layout, face)).toThrow(
        /"publicFace" must be \{ isPublic, describe \}, such as PUBLIC_FACES.python/u,
      );
    },
  );
});
