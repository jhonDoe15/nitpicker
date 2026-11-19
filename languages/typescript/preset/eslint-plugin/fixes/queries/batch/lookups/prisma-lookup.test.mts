import { rule as ioInLoop } from '../../../../rules/loops/no-io-in-loop.mts';
import { ormProject } from '../../../../test-support/projects/orm-project.mts';
import { PRISMA_HEAD, prismaCases } from '../../../../test-support/queries/batch-cases.mts';

const { project, pair, clean } = prismaCases(ormProject('prisma-lookup'));

const REWRITTEN = [
  `${PRISMA_HEAD}export async function run() {
  const usersById = new Map<number, { id: number; email: string; name: string; teamId: number; }>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    for (const row of await prisma.user.findMany({ where: { id: { in: part } } })) {
      usersById.set(row.id, row);
    }
  }
  for (const id of ids) {
    const user = usersById.get(id) ?? null;
    console.log(user);
  }
}
`,
  `${PRISMA_HEAD}export async function run() {
  const usersById = new Map<number, { id: number; email: string; name: string; teamId: number; }>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    for (const row of await prisma.user.findMany({ where: { id: { in: part } } })) {
      usersById.set(row.id, row);
    }
  }
  const rows = await Promise.all(
    ids.map(async (id) => {
      const user = usersById.get(id) ?? null;
      return user ?? null;
    }),
  );
  use(rows);
}
`,
];

project.tester.run('prisma lookups', ioInLoop, {
  valid: REWRITTEN.map((code) => clean(code)),
  invalid: [
    pair(
      `export async function run() {
  for (const id of ids) {
    const user = await prisma.user.findUnique({ where: { id } });
    console.log(user);
  }
}
`,
      `export async function run() {
  const usersById = new Map<number, { id: number; email: string; name: string; teamId: number; }>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    for (const row of await prisma.user.findMany({ where: { id: { in: part } } })) {
      usersById.set(row.id, row);
    }
  }
  for (const id of ids) {
    const user = usersById.get(id) ?? null;
    console.log(user);
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const email of emails) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });
    if (user) {
      console.log(user.name);
    }
  }
}
`,
      `export async function run() {
  const usersByEmail = new Map<string, { id: number; email: string; name: string; teamId: number; }>();
  for (let index = 0; index < emails.length; index += 500) {
    const part = emails.slice(index, index + 500);
    for (const row of await prisma.user.findMany({
      where: { email: { in: part } },
      select: { id: true, email: true, name: true },
    })) {
      usersByEmail.set(row.email, row);
    }
  }
  for (const email of emails) {
    const user = usersByEmail.get(email) ?? null;
    if (user) {
      console.log(user.name);
    }
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const id of ids) {
    const user = await prisma.user.findFirst({ where: { id, teamId: scope } });
    console.log(user?.email);
  }
}
`,
      `export async function run() {
  const usersById = new Map<number, { id: number; email: string; name: string; teamId: number; }>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    for (const row of await prisma.user.findMany({ where: { id: { in: part }, teamId: scope } })) {
      usersById.set(row.id, row);
    }
  }
  for (const id of ids) {
    const user = usersById.get(id) ?? null;
    console.log(user?.email);
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const id of ids) {
    const user = await prisma.user.findUnique({ where: { id }, include: { team: true } });
    console.log(user);
  }
}
`,
      `export async function run() {
  const usersById = new Map<number, { id: number; email: string; name: string; teamId: number; }>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    for (const row of await prisma.user.findMany({ where: { id: { in: part } }, include: { team: true } })) {
      usersById.set(row.id, row);
    }
  }
  for (const id of ids) {
    const user = usersById.get(id) ?? null;
    console.log(user);
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const id of teamIds) {
    const team = await prisma.team.findUnique({ where: { id } });
    console.log(team?.name);
  }
}
`,
      `export async function run() {
  const teamsById = new Map<string, { id: string; name: string; }>();
  for (let index = 0; index < teamIds.length; index += 500) {
    const part = teamIds.slice(index, index + 500);
    for (const row of await prisma.team.findMany({ where: { id: { in: part } } })) {
      teamsById.set(row.id, row);
    }
  }
  for (const id of teamIds) {
    const team = teamsById.get(id) ?? null;
    console.log(team?.name);
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const event of events) {
    const team = await prisma.team.findUnique({ where: { id: event.teamId } });
    console.log(team);
  }
}
`,
      `export async function run() {
  const keys = events.map((event) => event.teamId);
  const teamsById = new Map<string, { id: string; name: string; }>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await prisma.team.findMany({ where: { id: { in: part } } })) {
      teamsById.set(row.id, row);
    }
  }
  for (const event of events) {
    const team = teamsById.get(event.teamId) ?? null;
    console.log(team);
  }
}
`,
      { report: 'foreignKeyQuery' },
    ),
    pair(
      `export async function run() {
  const rows = await Promise.all(
    ids.map(async (id) => {
      const user = await prisma.user.findUnique({ where: { id } });
      return user ?? null;
    }),
  );
  use(rows);
}
`,
      `export async function run() {
  const usersById = new Map<number, { id: number; email: string; name: string; teamId: number; }>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    for (const row of await prisma.user.findMany({ where: { id: { in: part } } })) {
      usersById.set(row.id, row);
    }
  }
  const rows = await Promise.all(
    ids.map(async (id) => {
      const user = usersById.get(id) ?? null;
      return user ?? null;
    }),
  );
  use(rows);
}
`,
      { report: 'concurrentQuery' },
    ),
    pair(
      `export class Service {
  constructor(private readonly prisma: PrismaClient) {}
  async run() {
    for (const id of ids) {
      const user = await this.prisma.user.findUnique({ where: { id: id } });
      console.log(user);
    }
  }
}
`,
      `export class Service {
  constructor(private readonly prisma: PrismaClient) {}
  async run() {
    const usersById = new Map<number, { id: number; email: string; name: string; teamId: number; }>();
    for (let index = 0; index < ids.length; index += 500) {
      const part = ids.slice(index, index + 500);
      for (const row of await this.prisma.user.findMany({ where: { id: { in: part } } })) {
        usersById.set(row.id, row);
      }
    }
    for (const id of ids) {
      const user = usersById.get(id) ?? null;
      console.log(user);
    }
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const id of ids) {
    const user = await prisma.user.findUnique({ where: { id } });
    use(user?.name);
    console.log(user?.teamId);
  }
}
`,
      `export async function run() {
  const usersById = new Map<number, { id: number; email: string; name: string; teamId: number; }>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    for (const row of await prisma.user.findMany({ where: { id: { in: part } } })) {
      usersById.set(row.id, row);
    }
  }
  for (const id of ids) {
    const user = usersById.get(id) ?? null;
    use(user?.name);
    console.log(user?.teamId);
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const id of teamIds) {
    const team = await prisma.team.findFirst({ where: { id }, select: { id: true, name: true } });
    if (!team) {
      continue;
    }
    console.log(team.name);
  }
}
`,
      `export async function run() {
  const teamsById = new Map<string, { id: string; name: string; }>();
  for (let index = 0; index < teamIds.length; index += 500) {
    const part = teamIds.slice(index, index + 500);
    for (const row of await prisma.team.findMany({ where: { id: { in: part } }, select: { id: true, name: true } })) {
      teamsById.set(row.id, row);
    }
  }
  for (const id of teamIds) {
    const team = teamsById.get(id) ?? null;
    if (!team) {
      continue;
    }
    console.log(team.name);
  }
}
`,
    ),
    pair(
      `export async function run() {
  if (scope > 0) {
    ids.forEach(async (id) => {
      const user = await prisma.user.findUnique({ where: { id } });
      console.log(user?.email);
    });
  }
}
`,
      `export async function run() {
  if (scope > 0) {
    const usersById = new Map<number, { id: number; email: string; name: string; teamId: number; }>();
    for (let index = 0; index < ids.length; index += 500) {
      const part = ids.slice(index, index + 500);
      for (const row of await prisma.user.findMany({ where: { id: { in: part } } })) {
        usersById.set(row.id, row);
      }
    }
    ids.forEach(async (id) => {
      const user = usersById.get(id) ?? null;
      console.log(user?.email);
    });
  }
}
`,
    ),
  ],
});
