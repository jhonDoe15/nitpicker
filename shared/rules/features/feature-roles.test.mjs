import { describe, expect, it } from 'vitest';
import {
  featureLayout,
  featureRoleContract,
  featureRoles,
  PUBLIC_FACES,
} from './feature-roles.mjs';

const BILLING_ROLE = { kind: 'feature', directory: 'app/features/billing', name: 'billing' };

describe('feature roles', () => {
  const roleOf = featureRoles({ sharedRoots: ['**/shared'], featureRoots: ['app/features'] });

  it.each([
    ['app/shared/money.py', { kind: 'shared' }],
    ['app/features/billing/invoice.py', BILLING_ROLE],
    ['app/features/readme.py', { kind: 'other' }],
    ['lib/features/billing/invoice.py', { kind: 'other' }],
    ['app/features/shared/tax.py', { kind: 'shared' }],
    ['app/features/billing/shared/tax.py', BILLING_ROLE],
  ])('%s is %j', (file, role) => {
    expect(roleOf(file)).toEqual(role);
  });

  it('keeps a configured shared root shared inside a feature', () => {
    const configured = featureRoles(
      featureLayout({ sharedRoots: ['**/shared'], featureRoots: ['app/features'] }),
    );

    expect(configured('app/features/billing/shared/tax.py')).toEqual({ kind: 'shared' });
    expect(configured('app/features/billing/tax.py')).toEqual(BILLING_ROLE);
  });

  it('gives a file to the innermost feature root that holds it', () => {
    const nested = featureRoles(
      featureLayout({ featureRoots: ['app/features', 'app/features/billing/plugins'] }),
    );

    expect(nested('app/features/billing/plugins/pdf/render.py')).toEqual({
      kind: 'feature',
      directory: 'app/features/billing/plugins/pdf',
      name: 'pdf',
    });
    expect(nested('app/features/billing/plugins/__init__.py')).toEqual(BILLING_ROLE);
  });
});

const BILLING = 'src/app/features/billing';
const PYTHON_FACE = `${BILLING}/__init__.py (re-export names or sub-packages there) or a module directly in ${BILLING}/ not starting with "_"`;
const JVM_FACE = `a class directly in ${BILLING}/`;

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
