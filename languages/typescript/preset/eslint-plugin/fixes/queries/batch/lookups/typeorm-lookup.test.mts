import { rule as ioInLoop } from '../../../../rules/loops/no-io-in-loop.mts';
import { ormProject } from '../../../../test-support/projects/orm-project.mts';
import {
  TYPEORM_HEAD_WITH_IN,
  typeormCases,
} from '../../../../test-support/queries/batch-cases.mts';

const { project, pair, clean } = typeormCases(ormProject('typeorm-lookup'));

const REWRITTEN = [
  `${TYPEORM_HEAD_WITH_IN}export async function run() {
  const usersById = new Map<number, User>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    for (const row of await repo.findBy({ id: In(part) })) {
      usersById.set(row.id, row);
    }
  }
  for (const id of ids) {
    const user = usersById.get(id) ?? null;
    console.log(user);
  }
}
`,
  `${TYPEORM_HEAD_WITH_IN}export async function run() {
  const usersById = new Map<number, User>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    for (const row of await repo.findBy({ id: In(part) })) {
      usersById.set(row.id, row);
    }
  }
  const rows = await Promise.all(
    ids.map(async (id) => {
      const user = usersById.get(id) ?? null;
      return user ?? { id };
    }),
  );
  use(rows);
}
`,
];

project.tester.run('typeorm lookups', ioInLoop, {
  valid: REWRITTEN.map((code) => clean(code)),
  invalid: [
    ...[
      '[...new Set(ids)]',
      'Array.from(new Set(ids))',
      '[...new Map(ids.map((id) => [id, id])).keys()]',
    ].map((source) =>
      pair(
        `export async function run() {
  const unique = ${source};
  for (const id of unique) {
    const user = await repo.findOneBy({ id });
    out.push(user);
  }
}
`,
        `export async function run() {
  const unique = ${source};
  const usersById = new Map<number, User>();
  for (let index = 0; index < unique.length; index += 500) {
    const part = unique.slice(index, index + 500);
    for (const row of await repo.findBy({ id: In(part) })) {
      usersById.set(row.id, row);
    }
  }
  for (const id of unique) {
    const user = usersById.get(id) ?? null;
    out.push(user);
  }
}
`,
      ),
    ),
    pair(
      `export async function run() {
  for (const id of ids) {
    const user = await repo.findOneBy({ id });
    console.log(user);
  }
}
`,
      `export async function run() {
  const usersById = new Map<number, User>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    for (const row of await repo.findBy({ id: In(part) })) {
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
  for (const id of ids) {
    const user = await repo.findOne({ select: ['id', 'name'], where: { id, workspaceId } });
    if (!user) {
      continue;
    }
    console.log(user.name);
  }
}
`,
      `export async function run() {
  const usersById = new Map<number, User>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    for (const row of await repo.find({ select: ['id', 'name'], where: { id: In(part), workspaceId } })) {
      usersById.set(row.id, row);
    }
  }
  for (const id of ids) {
    const user = usersById.get(id) ?? null;
    if (!user) {
      continue;
    }
    console.log(user.name);
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const event of events) {
    const user = await repo.findOneBy({ email: event.workspaceId });
    if (user) {
      console.log(user);
    }
  }
}
`,
      `export async function run() {
  const keys = events.map((event) => event.workspaceId);
  const usersByEmail = new Map<string, User>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await repo.findBy({ email: In(part) })) {
      usersByEmail.set(row.email, row);
    }
  }
  for (const event of events) {
    const user = usersByEmail.get(event.workspaceId) ?? null;
    if (user) {
      console.log(user);
    }
  }
}
`,
      { report: 'foreignKeyQuery' },
    ),
    pair(
      `export async function run() {
  for (const event of events) {
    const user = await repo.findOneBy({ id: event.owner.id });
    console.log(user?.name);
  }
}
`,
      `export async function run() {
  const keys = events.map((event) => event.owner.id);
  const usersById = new Map<number, User>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await repo.findBy({ id: In(part) })) {
      usersById.set(row.id, row);
    }
  }
  for (const event of events) {
    const user = usersById.get(event.owner.id) ?? null;
    console.log(user?.name);
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const email of emails) {
    const user = await repo.findOneBy({ email });
    console.log(user);
  }
}
`,
      `export async function run() {
  const usersByEmail = new Map<string, User>();
  for (let index = 0; index < emails.length; index += 500) {
    const part = emails.slice(index, index + 500);
    for (const row of await repo.findBy({ email: In(part) })) {
      usersByEmail.set(row.email, row);
    }
  }
  for (const email of emails) {
    const user = usersByEmail.get(email) ?? null;
    console.log(user);
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const slug of slugs) {
    const code = await codes.findOneBy({ slug });
    console.log(code);
  }
}
`,
      `export async function run() {
  const codesBySlug = new Map<string, Code>();
  for (let index = 0; index < slugs.length; index += 500) {
    const part = slugs.slice(index, index + 500);
    for (const row of await codes.findBy({ slug: In(part) })) {
      codesBySlug.set(row.slug, row);
    }
  }
  for (const slug of slugs) {
    const code = codesBySlug.get(slug) ?? null;
    console.log(code);
  }
}
`,
    ),
  ],
});
