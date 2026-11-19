import { rule as ioInLoop } from '../../../../../rules/loops/no-io-in-loop.mts';
import { ormProject } from '../../../../../test-support/projects/orm-project.mts';
import {
  PRISMA_INSERT_HEAD,
  insertCases,
} from '../../../../../test-support/queries/write-cases.mts';

const body = `export async function run() {
  for (const row of rows) {
    await prisma.tag.create({ data: { name: row.name, userId: 1 } });
  }
}
`;
const postgres = insertCases(ormProject('prisma-inserts'), PRISMA_INSERT_HEAD);
const mysql = insertCases(
  ormProject('prisma-inserts-mysql', { provider: 'mysql' }),
  PRISMA_INSERT_HEAD,
);
const sqlite = insertCases(
  ormProject('prisma-inserts-sqlite', { provider: 'sqlite' }),
  PRISMA_INSERT_HEAD,
);
const sqlServer = insertCases(
  ormProject('prisma-inserts-sqlserver', { provider: 'sqlserver' }),
  PRISMA_INSERT_HEAD,
);
const prisma5 = insertCases(
  ormProject('prisma-inserts-v5', { prismaVersion: '5.22.0' }),
  PRISMA_INSERT_HEAD,
);
const unversioned = insertCases(
  ormProject('prisma-inserts-unversioned', { prismaManifest: 'unversioned' }),
  PRISMA_INSERT_HEAD,
);
const mongo = insertCases(
  ormProject('prisma-inserts-mongo', { provider: 'mongodb' }),
  PRISMA_INSERT_HEAD,
);

postgres.project.tester.run('prisma creates per item', ioInLoop, {
  valid: [],
  invalid: [
    postgres.pair(
      `export async function run() {
  for (const row of rows) {
    await prisma.tag.create({ data: { name: row.name, userId: row.ownerId } });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await prisma.tag.createMany({ data: part.map((row) => ({ name: row.name, userId: row.ownerId })) });
  }
}
`,
    ),
    postgres.pair(
      `export async function run() {
  for (const row of rows) {
    await prisma.tag.create({ data: { name: \`\${row.name}-x\`, userId: scope } });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await prisma.tag.createMany({ data: part.map((row) => ({ name: \`\${row.name}-x\`, userId: scope })) });
  }
}
`,
    ),
    postgres.pair(
      `export async function run() {
  for (const row of rows) {
    await prisma.user.create({ data: { name: row.name, email: 'a@b.c', teamId: scope } });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await prisma.user.createMany({ data: part.map((row) => ({ name: row.name, email: 'a@b.c', teamId: scope })) });
  }
}
`,
    ),
    postgres.pair(
      `export async function run() {
  for (const row of rows) {
    await prisma.team.create({ data: { id: row.team, name: row.name } });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await prisma.team.createMany({ data: part.map((row) => ({ id: row.team, name: row.name })) });
  }
}
`,
    ),
    postgres.pair(
      `export async function run() {
  for (const id of ids) {
    await prisma.tag.create({ data: { id, name: 'x', userId: scope } });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < ids.length; index += 100) {
    const part = ids.slice(index, index + 100);
    await prisma.tag.createMany({ data: part.map((id) => ({ id, name: 'x', userId: scope })) });
  }
}
`,
    ),
    postgres.pair(
      `export async function run() {
  for (const row of rows) {
    await prisma.tag.create({ data: { name: row.name, userId: clock.now() } });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await prisma.tag.createMany({ data: part.map((row) => ({ name: row.name, userId: clock.now() })) });
  }
}
`,
    ),
    postgres.pair(
      `export async function run() {
  for (const row of rows) await prisma.tag.create({ data: { name: row.name, userId: 1 } });
}
`,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await prisma.tag.createMany({ data: part.map((row) => ({ name: row.name, userId: 1 })) });
  }
}
`,
    ),
  ],
});

postgres.project.tester.run('prisma creates that stay as they are', ioInLoop, {
  valid: [],
  invalid: [
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await prisma.user.create({ data: { name: row.name, email: 'x', team: { connect: { id: row.team } } } });
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    const tag = await prisma.tag.create({ data: { name: row.name, userId: 1 } });
    out.push(tag);
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await prisma.tag.create({ data: { name: row.name, userId: 1 }, select: { id: true } });
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await prisma.tag.create({ data: toData(row) });
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await prisma.team.create({ data: { id: row.team, name: row.name, users: { create: [] } } });
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await prisma.tag.create({ data: { ...toData(row) } });
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await prisma.tag.createMany({ data: [{ name: row.name, userId: 1 }] });
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await prisma.tag.create({ data: { name: row.name, userId: await Promise.resolve(1) } });
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await prisma.tag.create({ data: { name: row.name, id: ids.length, userId: 1 } });
    ids.push(1);
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await prisma.tag.create({ data: { name: row.name, nope: 1, userId: 1 } } as never);
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    await prisma.tag.create({ data: {} });
  }
}
`),
    postgres.declines(`export async function run() {
  for (const row of rows) {
    const created = await prisma.$transaction(async (tx) => tx.tag.create({ data: { name: row.name, userId: 1 } }));
    out.push(created);
  }
}
`),
  ],
});

mysql.project.tester.run('prisma creates on MySQL', ioInLoop, {
  valid: [],
  invalid: [
    mysql.pair(
      body,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await prisma.tag.createMany({ data: part.map((row) => ({ name: row.name, userId: 1 })) });
  }
}
`,
    ),
  ],
});

sqlite.project.tester.run('prisma creates on SQLite', ioInLoop, {
  valid: [],
  invalid: [sqlite.declines(body)],
});

sqlServer.project.tester.run('prisma creates on SQL Server', ioInLoop, {
  valid: [],
  invalid: [sqlServer.declines(body)],
});

mongo.project.tester.run('prisma creates on MongoDB', ioInLoop, {
  valid: [],
  invalid: [mongo.declines(body)],
});

prisma5.project.tester.run('prisma creates before Prisma 6', ioInLoop, {
  valid: [],
  invalid: [prisma5.declines(body)],
});

unversioned.project.tester.run('prisma creates with an unknown Prisma version', ioInLoop, {
  valid: [],
  invalid: [unversioned.declines(body)],
});
