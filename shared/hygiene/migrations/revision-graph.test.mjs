import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mjs';
import { runHygieneCheck } from '../runner.mjs';

const { createGitRepository } = useGitFixtures();

function orderFindings(baseFiles, headFiles) {
  const { root: baselineRoot } = createGitRepository(baseFiles);
  const { root: projectRoot } = createGitRepository(headFiles);
  return runHygieneCheck({ check: 'repository-hygiene', projectRoot, baselineRoot }).filter(
    ({ rule }) => rule === 'migration-order',
  );
}

const paths = (findings) => findings.map(({ path }) => path);

const VERSIONS = 'alembic/versions';

function alembic(revision, parent, extra = '') {
  const down = parent === undefined ? 'None' : parent;
  return [
    '"""change"""',
    'from typing import Sequence, Union',
    '',
    `revision: str = "${revision}"`,
    `down_revision: Union[str, Sequence[str], None] = ${down}`,
    extra,
    '',
    'def upgrade() -> None:',
    '    pass',
    '',
  ].join('\n');
}

const ALEMBIC_BASE = {
  [`${VERSIONS}/a1_init.py`]: alembic('a1'),
  [`${VERSIONS}/b2_users.py`]: alembic('b2', '"a1"'),
};

describe('migration order with Alembic', () => {
  it('reports a revision whose parent already has a child on the base', () => {
    const findings = orderFindings(ALEMBIC_BASE, {
      ...ALEMBIC_BASE,
      [`${VERSIONS}/c3_orders.py`]: alembic('c3', '"a1"'),
    });

    expect(paths(findings)).toEqual([`${VERSIONS}/c3_orders.py`]);
    expect(findings[0].message).toBe(
      `Migration ${VERSIONS}/c3_orders.py follows a1, but b2 (${VERSIONS}/b2_users.py) already does on the ` +
        'base branch, so the migration history splits into two heads and the migration command stops. ' +
        'Make it follow the latest migration on the base branch, b2, or add a merge migration ' +
        '(`alembic merge heads`, `manage.py makemigrations --merge`). If this is intended, add ' +
        `{"rule":"migration-order","paths":["${VERSIONS}/c3_orders.py"],"reason":"..."} to "exceptions" in ` +
        'nitpicker.config.json.',
    );
  });

  it('allows a revision on the current head, a chain after it, and a merge revision', () => {
    expect(
      orderFindings(ALEMBIC_BASE, {
        ...ALEMBIC_BASE,
        [`${VERSIONS}/c3_orders.py`]: alembic('c3', "'b2'"),
        [`${VERSIONS}/d4_items.py`]: alembic('d4', "'c3'"),
      }),
    ).toEqual([]);
    expect(
      orderFindings(
        { ...ALEMBIC_BASE, [`${VERSIONS}/c3_orders.py`]: alembic('c3', '"a1"') },
        {
          ...ALEMBIC_BASE,
          [`${VERSIONS}/c3_orders.py`]: alembic('c3', '"a1"'),
          [`${VERSIONS}/m5_merge.py`]: alembic('m5', '("b2", "c3")'),
        },
      ),
    ).toEqual([]);
  });

  it('allows a stale revision once the change merges the heads', () => {
    expect(
      orderFindings(ALEMBIC_BASE, {
        ...ALEMBIC_BASE,
        [`${VERSIONS}/c3_orders.py`]: alembic('c3', '"a1"'),
        [`${VERSIONS}/m5_merge.py`]: alembic('m5', '("b2", "c3")'),
      }),
    ).toEqual([]);
  });

  it('reports only the first of two stale revisions, and a second root', () => {
    expect(
      paths(
        orderFindings(ALEMBIC_BASE, {
          ...ALEMBIC_BASE,
          [`${VERSIONS}/c3_orders.py`]: alembic('c3', '"a1"'),
          [`${VERSIONS}/d4_items.py`]: alembic('d4', '"c3"'),
        }),
      ),
    ).toEqual([`${VERSIONS}/c3_orders.py`]);
    expect(
      paths(
        orderFindings(ALEMBIC_BASE, { ...ALEMBIC_BASE, [`${VERSIONS}/z9_root.py`]: alembic('z9') }),
      ),
    ).toEqual([`${VERSIONS}/z9_root.py`]);
  });

  it('allows a revision that starts a labelled branch, and a renamed stale revision', () => {
    expect(
      orderFindings(ALEMBIC_BASE, {
        ...ALEMBIC_BASE,
        [`${VERSIONS}/c3_audit.py`]: alembic('c3', '"a1"', 'branch_labels = ("audit",)'),
      }),
    ).toEqual([]);
    expect(
      orderFindings(
        { ...ALEMBIC_BASE, [`${VERSIONS}/c3_orders.py`]: alembic('c3', '"b2"') },
        {
          ...ALEMBIC_BASE,
          [`${VERSIONS}/c3_orders.py`]: alembic('c3', '"b2"'),
          [`${VERSIONS}/e5.py`]: alembic('e5', '"c3"'),
        },
      ),
    ).toEqual([]);
  });
});

const APP = 'shop/orders/migrations';

function django(dependencies, extra = '') {
  return [
    'from django.conf import settings',
    'from django.db import migrations, models',
    '',
    '',
    'class Migration(migrations.Migration):',
    extra,
    '    dependencies = [',
    '        migrations.swappable_dependency(settings.AUTH_USER_MODEL),',
    ...dependencies.map(([app, name]) => `        ("${app}", "${name}"),`),
    '    ]',
    '',
    '    operations = []',
    '',
  ].join('\n');
}

const DJANGO_BASE = {
  [`${APP}/__init__.py`]: '',
  [`${APP}/0001_initial.py`]: django([['catalog', '0001_initial']]),
  [`${APP}/0002_order_note.py`]: django([['orders', '0001_initial']]),
};

describe('migration order with Django', () => {
  it('reports a migration that leaves two leaf nodes in its app', () => {
    const findings = orderFindings(DJANGO_BASE, {
      ...DJANGO_BASE,
      [`${APP}/0002_order_total.py`]: django([
        ['orders', '0001_initial'],
        ['catalog', '0003_price'],
      ]),
    });

    expect(paths(findings)).toEqual([`${APP}/0002_order_total.py`]);
    expect(findings[0].message.split(' (')[0]).toBe(
      `Migration ${APP}/0002_order_total.py follows 0001_initial, but 0002_order_note`,
    );
  });

  it('allows a migration on the latest one, a merge migration and a squash', () => {
    const latest = {
      ...DJANGO_BASE,
      [`${APP}/0003_order_total.py`]: django([['orders', '0002_order_note']]),
    };
    const conflict = {
      ...DJANGO_BASE,
      [`${APP}/0002_order_total.py`]: django([['orders', '0001_initial']]),
    };

    expect(orderFindings(DJANGO_BASE, latest)).toEqual([]);
    expect(
      orderFindings(conflict, {
        ...conflict,
        [`${APP}/0003_merge.py`]: django([
          ['orders', '0002_order_note'],
          ['orders', '0002_order_total'],
        ]),
      }),
    ).toEqual([]);
    expect(
      orderFindings(DJANGO_BASE, {
        ...DJANGO_BASE,
        [`${APP}/0001_squashed_0002.py`]: django([], "    replaces = [('orders', '0001_initial')]"),
      }),
    ).toEqual([]);
  });

  it('reads the app label from the dependencies when it differs from the folder', () => {
    const labelled = {
      'shop/orders_app/migrations/0001_initial.py': django([]),
      'shop/orders_app/migrations/0002_note.py': django([['orders', '0001_initial']]),
    };

    expect(
      orderFindings(labelled, {
        ...labelled,
        'shop/orders_app/migrations/0003_total.py': django([['orders', '0002_note']]),
      }),
    ).toEqual([]);
    expect(
      paths(
        orderFindings(labelled, {
          ...labelled,
          'shop/orders_app/migrations/0002_total.py': django([['orders', '0001_initial']]),
        }),
      ),
    ).toEqual(['shop/orders_app/migrations/0002_total.py']);
  });

  it('ignores other apps and files that are not migrations', () => {
    expect(
      orderFindings(DJANGO_BASE, {
        ...DJANGO_BASE,
        'shop/billing/migrations/0001_initial.py': django([]),
        [`${APP}/0003_helpers.py`]: 'def helper():\n    return 1\n',
      }),
    ).toEqual([]);
  });
});
