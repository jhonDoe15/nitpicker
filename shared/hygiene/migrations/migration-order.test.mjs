import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mjs';
import { runHygieneCheck } from '../runner.mjs';

const { createGitRepository } = useGitFixtures();

const SQL = 'create table t (id int);\n';
const STALE_MESSAGE = new RegExp(
  [
    String.raw`^Migration \S+ \(version [\d._-]+\) (?:sorts before|has the same version as) \S+,`,
    String.raw` the newest migration in \S+/ on the base branch\. .+`,
    String.raw` If this is intended, add \{"rule":"migration-order",.+$`,
  ].join(''),
  'u',
);

function orderFindings(baseFiles, headFiles, policy) {
  const { root: baselineRoot } = createGitRepository(baseFiles);
  const { root: projectRoot } = createGitRepository(headFiles);
  return runHygieneCheck({ check: 'repository-hygiene', projectRoot, baselineRoot, policy }).filter(
    ({ rule }) => rule === 'migration-order',
  );
}

const paths = (findings) => findings.map(({ path }) => path);

function layoutCase(folder, { older, newest, stale, current }) {
  const base = { [`${folder}/${older}`]: SQL, [`${folder}/${newest}`]: SQL };
  return { base, stale: `${folder}/${stale}`, current: `${folder}/${current}` };
}

const LAYOUTS = {
  flyway: layoutCase('src/main/resources/db/migration', {
    older: 'V1__init.sql',
    newest: 'V1_2__add_users.sql',
    stale: 'V1_1__add_orders.sql',
    current: 'V1_3__add_orders.sql',
  }),
  'flyway java': layoutCase('src/main/java/db/migration', {
    older: 'V1__Init.java',
    newest: 'V3__AddUsers.java',
    stale: 'V2__AddOrders.java',
    current: 'V4__AddOrders.java',
  }),
  'typeorm or kysely': layoutCase('src/schema/migrations', {
    older: '1744910873969-Initial.ts',
    newest: '1752000000000-AddUsers.ts',
    stale: '1751000000000-AddOrders.ts',
    current: '1753000000000-AddOrders.ts',
  }),
  knex: layoutCase('migrations', {
    older: '20240101000000_init.js',
    newest: '20240301000000_users.js',
    stale: '20240201000000_orders.js',
    current: '20240401000000_orders.js',
  }),
  sequelize: layoutCase('db/migrations', {
    older: '20240101000000-init.cjs',
    newest: '20240301000000-users.cjs',
    stale: '20240201000000-orders.cjs',
    current: '20240401000000-orders.cjs',
  }),
  drizzle: layoutCase('drizzle', {
    older: '0000_init.sql',
    newest: '0001_users.sql',
    stale: '0001_orders.sql',
    current: '0002_orders.sql',
  }),
  'golang-migrate': layoutCase('db/migrations', {
    older: '000001_init.up.sql',
    newest: '000003_users.up.sql',
    stale: '000002_orders.up.sql',
    current: '000004_orders.up.sql',
  }),
  goose: layoutCase('migrations', {
    older: '20240101000000_init.sql',
    newest: '20240301000000_users.go',
    stale: '20240201000000_orders.go',
    current: '20240401000000_orders.sql',
  }),
  'mikro-orm': layoutCase('src/migrations', {
    older: 'Migration20240101000000.ts',
    newest: 'Migration20240301000000.ts',
    stale: 'Migration20240201000000.ts',
    current: 'Migration20240401000000.ts',
  }),
  prisma: {
    base: {
      'prisma/migrations/20240101000000_init/migration.sql': SQL,
      'prisma/migrations/20240301000000_users/migration.sql': SQL,
      'prisma/migrations/migration_lock.toml': 'provider = "postgresql"\n',
    },
    stale: 'prisma/migrations/20240201000000_orders/migration.sql',
    current: 'prisma/migrations/20240401000000_orders/migration.sql',
  },
};

describe.each(Object.entries(LAYOUTS))('migration order with %s', (_layout, layout) => {
  it('reports a migration the change adds with a version before the newest on the base', () => {
    const findings = orderFindings(layout.base, { ...layout.base, [layout.stale]: SQL });

    expect(paths(findings)).toEqual([layout.stale]);
    expect(findings[0].message).toMatch(STALE_MESSAGE);
  });

  it('allows a migration with a current version', () => {
    expect(orderFindings(layout.base, { ...layout.base, [layout.current]: SQL })).toEqual([]);
  });

  it('allows the stale migration renamed with a current version', () => {
    const { base } = layout;
    expect(
      orderFindings({ ...base, [layout.stale]: SQL }, { ...base, [layout.current]: SQL }),
    ).toEqual([]);
  });

  it('reports only the stale one of two migrations the change adds', () => {
    const findings = orderFindings(layout.base, {
      ...layout.base,
      [layout.stale]: SQL,
      [layout.current]: SQL,
    });

    expect(paths(findings)).toEqual([layout.stale]);
  });

  it('leaves the base side alone', () => {
    const { root } = createGitRepository({ ...layout.base, [layout.stale]: SQL });
    const findings = runHygieneCheck({ check: 'repository-hygiene', projectRoot: root });

    expect(findings.filter(({ rule }) => rule === 'migration-order')).toEqual([]);
  });
});

describe('migration order details', () => {
  const folder = 'src/main/resources/db/migration';
  const base = { [`${folder}/V1__init.sql`]: SQL, [`${folder}/V2__users.sql`]: SQL };

  it('names the newest base migration, the version and the allowed form', () => {
    const [finding] = orderFindings(base, { ...base, [`${folder}/V2__orders.sql`]: SQL });

    expect(finding).toEqual({
      tool: 'repository-hygiene',
      rule: 'migration-order',
      path: `${folder}/V2__orders.sql`,
      identity: `migration-order|${folder}|V2__orders.sql`,
      message:
        `Migration ${folder}/V2__orders.sql (version 2) has the same version as V2__users.sql, ` +
        `the newest migration in ${folder}/ on the base branch. A database that already ran that one ` +
        'skips this one, refuses to start or runs it out of order. Give it a version after 2: create it ' +
        'again with the migration tool, or rename it with the next version or the current timestamp. If this is intended, add ' +
        `{"rule":"migration-order","paths":["${folder}/V2__orders.sql"],"reason":"..."} to ` +
        '"exceptions" in nitpicker.config.json.',
      classification: 'enforceable',
    });
  });

  it('reports one finding for the up and down files of one migration', () => {
    const migrate = 'db/migrations';
    const migrateBase = {
      [`${migrate}/000002_users.up.sql`]: SQL,
      [`${migrate}/000002_users.down.sql`]: SQL,
    };
    const findings = orderFindings(migrateBase, {
      ...migrateBase,
      [`${migrate}/000001_orders.up.sql`]: SQL,
      [`${migrate}/000001_orders.down.sql`]: SQL,
    });

    expect(findings).toHaveLength(1);
  });

  it('reads date-style versions with separators', () => {
    const dated = {
      'migrations/2024_01_01_120000_init.ts': SQL,
      'migrations/2024_02_01_090000_users.ts': SQL,
    };

    expect(
      orderFindings(dated, { ...dated, 'migrations/2024_02_01_100000_orders.ts': SQL }),
    ).toEqual([]);
    expect(
      paths(orderFindings(dated, { ...dated, 'migrations/2024_01_15_100000_orders.ts': SQL })),
    ).toEqual(['migrations/2024_01_15_100000_orders.ts']);
    expect(
      orderFindings(
        { 'db/migrations/2024-01-01-init.sql': SQL },
        {
          'db/migrations/2024-01-01-init.sql': SQL,
          'db/migrations/2024-02-01-users.sql': SQL,
        },
      ),
    ).toEqual([]);
  });

  it('compares against the newest base migration the change keeps', () => {
    const findings = orderFindings(base, {
      [`${folder}/V1__init.sql`]: SQL,
      [`${folder}/V1_5__orders.sql`]: SQL,
    });

    expect(findings).toEqual([]);
  });

  it('ignores a folder with no migrations on the base, tests and other folders', () => {
    const findings = orderFindings(
      { 'src/migrations/1752000000000-Users.ts': SQL, 'src/a.ts': SQL },
      {
        'src/migrations/1752000000000-Users.ts': SQL,
        'src/migrations/1751000000000-Users.test.ts': SQL,
        'src/fixtures/1751000000000-Orders.ts': SQL,
        'other/migrations/1700000000000-Init.ts': SQL,
        'src/a.ts': SQL,
      },
    );

    expect(findings).toEqual([]);
  });

  it('drops an excepted or excluded migration', () => {
    const head = { ...base, [`${folder}/V1_1__orders.sql`]: SQL };
    const exceptions = [
      { rule: 'migration-order', paths: [`${folder}/**`], reason: 'out of order on' },
    ];

    expect(orderFindings(base, head, { exceptions })).toEqual([]);
    expect(orderFindings(base, head, { exclude: [`${folder}/V1_1__*`] })).toEqual([]);
  });
});
