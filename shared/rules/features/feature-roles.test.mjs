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

  it('leaves the folders named in notFeatures out of the features under a feature root', () => {
    const springRoles = featureRoles({
      sharedRoots: ['src/shop/shared'],
      featureRoots: ['src/shop'],
      notFeatures: ['service'],
    });

    expect(springRoles('src/shop/service/Billing.java')).toEqual({ kind: 'other' });
    expect(springRoles('src/shop/billing/service/Rates.java')).toEqual({
      kind: 'feature',
      directory: 'src/shop/billing',
    });
    expect(springRoles('src/shop/shared/Money.java')).toEqual({ kind: 'shared' });
  });
});

const BILLING = 'src/app/features/billing';
const PYTHON_FACE = `its __init__.py (a name it imports from an internal module counts) or a module directly in ${BILLING}/ whose name does not start with "_"`;
const JVM_FACE = `a class directly in the feature package ${BILLING}/`;

function billing(isPublic, face) {
  return { kind: 'feature', directory: BILLING, name: 'billing', isPublic, face };
}

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
    expect(python(`${BILLING}/${file}`)).toEqual(billing(isPublic, PYTHON_FACE));
  });

  it.each([
    ['Invoice.java', true],
    ['internal/Rates.java', false],
  ])('JVM: billing/%s is public: %s', (file, isPublic) => {
    expect(jvm(`${BILLING}/${file}`)).toEqual(billing(isPublic, JVM_FACE));
  });

  it('leaves shared and other files as they are', () => {
    expect(python('src/app/shared/money.py')).toEqual({ kind: 'shared' });
    expect(python('src/app/main.py')).toEqual({ kind: 'other' });
  });

  it('defaults to the **/features and **/shared folders', () => {
    const roleOf = featureRoleContract(undefined, PUBLIC_FACES.python);

    expect(roleOf('pkg/features/orders/_cart.py')).toEqual({
      kind: 'feature',
      directory: 'pkg/features/orders',
      name: 'orders',
      isPublic: false,
      face: PUBLIC_FACES.python.describe('pkg/features/orders'),
    });
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
