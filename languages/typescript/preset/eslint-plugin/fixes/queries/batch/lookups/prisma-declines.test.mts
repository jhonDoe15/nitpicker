import { rule as ioInLoop } from '../../../../rules/loops/no-io-in-loop.mts';
import { typescriptRuleTester } from '../../../../test-support/rule-tester.mts';
import { ormProject } from '../../../../test-support/projects/orm-project.mts';
import { PRISMA_HEAD, prismaCases } from '../../../../test-support/queries/batch-cases.mts';

const { project, declines } = prismaCases(ormProject('prisma-declines'));
const mysql = prismaCases(ormProject('prisma-mysql', { provider: 'mysql' }));
const prisma5 = prismaCases(ormProject('prisma-v5', { prismaVersion: '5.22.0' }));
const unversioned = prismaCases(
  ormProject('prisma-unversioned', { prismaManifest: 'unversioned' }),
);

project.tester.run('prisma lookups that stay as they are', ioInLoop, {
  valid: [],
  invalid: [
    declines(`export async function run() {
  for (const id of ids) {
    const user = await prisma.user.findUnique({ where: { id } });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await prisma.user.findFirst({ where: { id }, orderBy: { name: 'asc' } });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const name of emails) {
    const user = await prisma.user.findFirst({ where: { name } });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await prisma.user.findUnique({ where: { id: { equals: id } } });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of emails) {
    const doc = await prisma.doc.findUnique({ where: { id } });
    out.push(doc);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await prisma.user.findUnique({ where: { id }, select: { name: true } });
    out.push(user);
  }
}
`),
    declines(
      `export async function run() {
  for (const id of ids) {
    const user = await prisma.user.findUnique({ where: { id } });
    await prisma.user.update({ where: { id }, data: { name: 'x' } });
    out.push(user);
  }
}
`,
      ['query', 'query'],
    ),
    declines(`export async function run() {
  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      const user = await tx.user.findUnique({ where: { id } });
      out.push(user);
    }
  });
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (user) {
      user.name = 'x';
    }
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await prisma.user.findUnique({ where: { id }, take: 1 });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const tag = await prisma.tag.findFirst({ where: { userId: id } });
    out.push(tag);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await prisma.user.findUnique({ where: { id: Number(id) } });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await prisma.user.findUnique({ where: { id } });
    out.push(user);
  }
}
export const client = prisma.$extends({});
`),
    declines(`export async function run() {
  for (const id of ids) {
    const team = await prisma.user.findUnique({ where: { teamId: id } });
    out.push(team);
  }
}
`),
    declines(
      `export async function run() {
  for (const event of events) {
    event.ownerId += 1;
    const user = await prisma.user.findUnique({ where: { id: event.ownerId } });
    out.push(user);
  }
}
`,
      ['foreignKeyQuery'],
    ),
    declines(
      `export async function run() {
  await Promise.all(events.map(async (event) => {
    Object.assign(event, { ownerId: scope });
    const user = await prisma.user.findUnique({ where: { id: event.ownerId } });
    out.push(user);
  }));
}
`,
      ['foreignKeyQuery'],
    ),
  ],
});

function lookup(model: string, items: string) {
  return [
    'export async function run() {',
    `  for (const id of ${items}) {`,
    `    const row = await prisma.${model}.findUnique({ where: { id } });`,
    '    out.push(row);',
    '  }',
    '}',
    '',
  ].join('\n');
}

mysql.project.tester.run('prisma lookups on MySQL', ioInLoop, {
  valid: [],
  invalid: [mysql.declines(lookup('team', 'teamIds'))],
});

prisma5.project.tester.run('prisma lookups before Prisma 6', ioInLoop, {
  valid: [],
  invalid: [prisma5.declines(lookup('user', 'ids'))],
});

unversioned.project.tester.run('prisma lookups with an unknown Prisma version', ioInLoop, {
  valid: [],
  invalid: [unversioned.declines(lookup('user', 'ids'))],
});

typescriptRuleTester().run('prisma lookups without type information', ioInLoop, {
  valid: [],
  invalid: [{ code: `${PRISMA_HEAD}${lookup('user', 'ids')}`, errors: [{ messageId: 'query' }] }],
});
