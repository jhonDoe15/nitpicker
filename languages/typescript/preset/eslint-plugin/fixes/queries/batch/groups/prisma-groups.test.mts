import { rule as ioInLoop } from '../../../../rules/loops/no-io-in-loop.mts';
import { ormProject } from '../../../../test-support/projects/orm-project.mts';
import { prismaCases } from '../../../../test-support/queries/batch-cases.mts';

const { project, pair, declines } = prismaCases(ormProject('prisma-groups'), 'batchGroups');

project.tester.run('prisma lists grouped by key', ioInLoop, {
  valid: [],
  invalid: [
    pair(
      `export async function run() {
  for (const userId of ids) {
    const tags = await prisma.tag.findMany({ where: { userId } });
    out.push(tags.length);
  }
}
`,
      `export async function run() {
  const keys = Array.from(new Set(ids));
  const tagsByUserId = new Map<number, Array<{ id: number; name: string; userId: number; }>>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await prisma.tag.findMany({ where: { userId: { in: part } } })) {
      const group = tagsByUserId.get(row.userId);
      if (group === undefined) {
        tagsByUserId.set(row.userId, [row]);
      } else {
        group.push(row);
      }
    }
  }
  for (const userId of ids) {
    const tags = tagsByUserId.get(userId) ?? [];
    out.push(tags.length);
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const userId of ids) {
    const tags = await prisma.tag.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, userId: true },
    });
    out.push(tags.map((tag) => tag.name));
  }
}
`,
      `export async function run() {
  const keys = Array.from(new Set(ids));
  const tagsByUserId = new Map<number, Array<{ id: number; name: string; userId: number; }>>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await prisma.tag.findMany({
      where: { userId: { in: part } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, userId: true },
    })) {
      const group = tagsByUserId.get(row.userId);
      if (group === undefined) {
        tagsByUserId.set(row.userId, [row]);
      } else {
        group.push(row);
      }
    }
  }
  for (const userId of ids) {
    const tags = tagsByUserId.get(userId) ?? [];
    out.push(tags.map((tag) => tag.name));
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const userId of ids) {
    const tags = await prisma.tag.findMany({ where: { userId } });
    out.push(tags.filter((tag) => tag.name === 'a'));
  }
}
`,
      `export async function run() {
  const keys = Array.from(new Set(ids));
  const tagsByUserId = new Map<number, Array<{ id: number; name: string; userId: number; }>>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await prisma.tag.findMany({ where: { userId: { in: part } } })) {
      const group = tagsByUserId.get(row.userId);
      if (group === undefined) {
        tagsByUserId.set(row.userId, [row]);
      } else {
        group.push(row);
      }
    }
  }
  for (const userId of ids) {
    const tags = tagsByUserId.get(userId) ?? [];
    out.push(tags.filter((tag) => tag.name === 'a'));
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const userId of ids) {
    const tags = await prisma.tag.findMany({ where: { userId, name: 'a' } });
    out.push(tags.length);
  }
}
`,
      `export async function run() {
  const keys = Array.from(new Set(ids));
  const tagsByUserId = new Map<number, Array<{ id: number; name: string; userId: number; }>>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await prisma.tag.findMany({ where: { userId: { in: part }, name: 'a' } })) {
      const group = tagsByUserId.get(row.userId);
      if (group === undefined) {
        tagsByUserId.set(row.userId, [row]);
      } else {
        group.push(row);
      }
    }
  }
  for (const userId of ids) {
    const tags = tagsByUserId.get(userId) ?? [];
    out.push(tags.length);
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const userId of ids) {
    const tags = await prisma.tag.findMany({ where: { userId }, orderBy: { id: 'desc' } });
    out.push(tags.some((tag) => tag.id === 1));
  }
}
`,
      `export async function run() {
  const keys = Array.from(new Set(ids));
  const tagsByUserId = new Map<number, Array<{ id: number; name: string; userId: number; }>>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await prisma.tag.findMany({ where: { userId: { in: part } }, orderBy: { id: 'desc' } })) {
      const group = tagsByUserId.get(row.userId);
      if (group === undefined) {
        tagsByUserId.set(row.userId, [row]);
      } else {
        group.push(row);
      }
    }
  }
  for (const userId of ids) {
    const tags = tagsByUserId.get(userId) ?? [];
    out.push(tags.some((tag) => tag.id === 1));
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const userId of ids) {
    const tags = await prisma.tag.findMany({ where: { userId }, include: { user: true } });
    out.push(tags.length);
  }
}
`,
      `export async function run() {
  const keys = Array.from(new Set(ids));
  const tagsByUserId = new Map<number, Array<{ id: number; name: string; userId: number; }>>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await prisma.tag.findMany({ where: { userId: { in: part } }, include: { user: true } })) {
      const group = tagsByUserId.get(row.userId);
      if (group === undefined) {
        tagsByUserId.set(row.userId, [row]);
      } else {
        group.push(row);
      }
    }
  }
  for (const userId of ids) {
    const tags = tagsByUserId.get(userId) ?? [];
    out.push(tags.length);
  }
}
`,
    ),
    declines(
      `export async function run() {
  for (const event of events) {
    const tags = await prisma.tag.findMany({ where: { userId: event.ownerId } });
    for (const tag of tags) {
      use(tag.name);
    }
  }
}
`,
      ['foreignKeyQuery'],
    ),
    declines(`export async function run() {
  for (const userId of ids) {
    const tags = await prisma.tag.findMany({ where: { userId }, take: 3 });
    out.push(tags.length);
  }
}
`),
    declines(`export async function run() {
  for (const userId of ids) {
    const tags = await prisma.tag.findMany({ where: { userId }, skip: 1 });
    out.push(tags.length);
  }
}
`),
    declines(`export async function run() {
  for (const userId of ids) {
    const tags = await prisma.tag.findMany({ where: { userId }, distinct: ['name'] });
    out.push(tags.length);
  }
}
`),
    declines(`export async function run() {
  for (const userId of ids) {
    const tags = await prisma.tag.findMany({ where: { userId }, cursor: { id: 1 } });
    out.push(tags.length);
  }
}
`),
    declines(`export async function run() {
  for (const userId of ids) {
    const tags = await prisma.tag.findMany({ where: { userId }, select: { name: true } });
    out.push(tags.length);
  }
}
`),
    declines(`export async function run() {
  for (const userId of ids) {
    const tags = await prisma.tag.findMany({ where: { userId } });
    tags.reverse();
    out.push(tags);
  }
}
`),
    declines(`export async function run() {
  for (const userId of ids) {
    const tags = await prisma.tag.findMany({ where: { userId: { gt: userId } } });
    out.push(tags.length);
  }
}
`),
    declines(`export async function run() {
  for (const id of teamIds) {
    const users = await prisma.user.findMany({ where: { team: { id } } });
    out.push(users.length);
  }
}
`),
    declines(`export async function run() {
  for (const userId of ids) {
    const tags = await prisma.tag.findMany({ where: { userId } });
    tags.push(tags[0]!);
  }
}
`),
    declines(`export async function run() {
  for (const userId of ids) {
    const tags = await prisma.tag.findMany({ where: { userId: { in: [userId] } } });
    out.push(tags.length);
  }
}
`),
  ],
});
