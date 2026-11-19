import { rule as ioInLoop } from '../../../../rules/loops/no-io-in-loop.mts';
import { ormProject } from '../../../../test-support/projects/orm-project.mts';
import { typeormCases } from '../../../../test-support/queries/batch-cases.mts';

const { project, declines } = typeormCases(ormProject('typeorm-declines'));

project.tester.run('typeorm lookups that stay as they are', ioInLoop, {
  valid: [],
  invalid: [
    declines(`export async function run() {
  for (const id of ids) {
    const user = await repo.findOneBy({ id });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  const byId = new Map<number, unknown>();
  for (const id of ids) {
    const user = await repo.findOneBy({ id });
    byId.set(id, user);
  }
}
`),
    declines(`export async function run() {
  const found = new Set<unknown>();
  for (const id of ids.filter((each) => each > 0)) {
    const user = await repo.findOneBy({ id });
    found.add(user);
  }
}
`),
    declines(`export async function run() {
  let unique = [...new Set(ids)];
  for (const id of unique) {
    const user = await repo.findOneBy({ id });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    if (skip.has(id)) {
      continue;
    }
    const user = await repo.findOne({ where: { id }, relations: ['team'], withDeleted: true });
    out.push(user);
  }
}
`),
    ...[
      'event.teamId += 1;',
      'event.teamId = Number(workspaceId);',
      'event.owner.id++;',
      'use(event);',
    ].map((statement) =>
      declines(
        `export async function run() {
  for (const event of events) {
    ${statement}
    const user = await repo.findOneBy({ id: event.teamId });
    out.push(user);
  }
}
`,
        ['foreignKeyQuery'],
      ),
    ),
    declines(
      `export async function run() {
  for (const id of ids) {
    const user = await repo.findOneBy({ id });
    if (user) {
      user.name = 'x';
      await repo.save(user);
    }
  }
}
`,
      ['query', 'query'],
    ),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await repo.findOneBy({ id });
    use(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await repo.findOneBy({ id });
    if (user?.status === 'x') {
      return user;
    }
  }
}
`),
    declines(`export async function run() {
  for (const name of emails) {
    const user = await repo.findOneBy({ name });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await repo.findOne({ where: { id }, select: ['name'] });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await repo.findOne({ where: { id }, cache: true });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await repo.findOneBy({ id: id + 1 });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    try {
      const user = await repo.findOneBy({ id });
      out.push(user);
    } catch (error) {
      out.push(error);
    }
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = id ? await repo.findOneBy({ id }) : null;
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    if (id) {
      const user = await repo.findOneBy({ id });
      out.push(user);
    }
  }
}
`),
    declines(
      `export async function run() {
  for (const id of ids) {
    const user = await repo.findOneBy({ id });
    await repo.update(id, { status: 'seen' });
    out.push(user);
  }
}
`,
      ['query', 'query'],
    ),
    declines(
      `export async function run() {
  for (const id of ids) {
    const user = await repo.findOneBy({ id });
    await fetch(\`/x/\${id}\`);
    out.push(user);
  }
}
`,
      ['query', 'request'],
    ),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await repo.findOneBy({ id });
    if (!user) {
      break;
    }
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of skip) {
    const user = await repo.findOneBy({ id });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (let i = 0; i < ids.length; i += 1) {
    const user = await repo.findOneBy({ id: ids[i] });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await repo.findOneBy({ id /* the key */ });
    out.push(user);
  }
}
`),
    declines(
      `export async function run() {
  for (const event of events) {
    const user = await repo.findOneBy({ id: event.teamId, email: event.workspaceId });
    out.push(user);
  }
}
`,
      ['foreignKeyQuery'],
    ),
    declines(`export async function run() {
  let scope = workspaceId;
  for (const id of ids) {
    const user = await repo.findOneBy({ id, workspaceId: scope });
    scope = user?.workspaceId ?? scope;
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await repo.findOneBy({ id });
    const copy = user;
    out.push(copy);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await repo.findOneBy({ id });
    out.push(user?.tags.sort());
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const [user] = await repo.findBy({ id });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const user = await repo.findOneOrFail({ where: { id } });
    out.push(user);
  }
}
`),
    declines(`export async function run() {
  for (const event of events) {
    if (!event.owner) {
      continue;
    }
    const user = await repo.findOneBy({ id: event.owner.id });
    out.push(user);
  }
}
`),
    declines(
      `export async function run() {
  await Promise.all(
    events.map(async (event) => {
      if (event.teamId < 0) {
        return null;
      }
      const user = await repo.findOneBy({ id: event.teamId });
      return user;
    }),
  );
}
`,
      ['foreignKeyQuery'],
    ),
  ],
});
