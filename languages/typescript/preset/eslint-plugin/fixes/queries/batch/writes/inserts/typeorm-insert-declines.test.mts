import { rule as ioInLoop } from '../../../../../rules/loops/no-io-in-loop.mts';
import { ormProject } from '../../../../../test-support/projects/orm-project.mts';
import { INSERT_HEAD, insertCases } from '../../../../../test-support/queries/write-cases.mts';

const body = `export async function run() {
  for (const row of rows) {
    await notes.insert({ email: row.slug, ownerId: 1 });
  }
}
`;
const postgres = insertCases(
  ormProject('typeorm-insert-declines', { dependencies: ['typeorm', 'pg'] }),
  INSERT_HEAD,
);
const sqlite = insertCases(
  ormProject('typeorm-insert-sqlite', { dependencies: ['typeorm', 'pg', 'better-sqlite3'] }),
  INSERT_HEAD,
);
const sqlServer = insertCases(
  ormProject('typeorm-insert-mssql', { dependencies: ['typeorm', 'mssql'] }),
  INSERT_HEAD,
);
const unknown = insertCases(
  ormProject('typeorm-insert-unknown', { dependencies: ['typeorm'] }),
  INSERT_HEAD,
);

postgres.project.tester.run('typeorm inserts that stay as they are', ioInLoop, {
  valid: [],
  invalid: [
    postgres.declines(`export async function run() {
  for (const row of rows) {
    const result = await notes.insert({ email: row.slug, ownerId: 1 });
    out.push(result);
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await notes.insert({ email: row.slug, ownerId: 1 });
    use(row);
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await notes.insert([{ email: row.slug, ownerId: 1 }]);
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await notes.insert({ email: row.slug, ownerId: await Promise.resolve(1) });
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await notes.save({ email: row.slug, ownerId: 1 });
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await notes.insert({ email: row.slug, ownerId: ids.length });
    ids.push(1);
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await notes.insert({ email: row.slug, ownerId: ids.map((id) => id)[0]! });
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await notes.insert({ email: row.slug, ownerId: await notes.count() });
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await notes.insert(out as never);
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    // note
    await notes.insert({ email: row.slug, ownerId: 1 });
  }
}
`),
    postgres.declines(
      `export async function run() {
  await Promise.all(rows.map(async (row) => {
    await notes.insert({ email: row.slug, ownerId: 1 });
  }));
}
`,
      ['concurrentQuery'],
    ),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await notes.insert({ ...toEntity(row), email: row.slug });
  }
}
`),
    postgres.declines(`export async function run() {
  let counter = 0;
  for (const row of rows) {
    await notes.insert({ email: row.slug, ownerId: counter++ });
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await notes.insert({ email: row.slug, ownerId: ((): number => 1)() });
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await notes.insert({ [row.slug]: 1 } as never);
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await notes.insert(row.owner as never);
  }
}
`),
    postgres.declines(
      `export async function run() {
  for (const row of rows) {
    await notes.insert({ email: row.slug, ownerId: 1 });
    await notes.insert({ email: row.name, ownerId: 2 });
  }
}
`,
      ['query', 'query'],
    ),
  ],
});

sqlite.project.tester.run('typeorm inserts when SQLite is a dependency', ioInLoop, {
  valid: [],
  invalid: [sqlite.declines(body)],
});

sqlServer.project.tester.run('typeorm inserts on SQL Server', ioInLoop, {
  valid: [],
  invalid: [sqlServer.declines(body)],
});

unknown.project.tester.run('typeorm inserts with no known driver', ioInLoop, {
  valid: [],
  invalid: [unknown.declines(body)],
});
