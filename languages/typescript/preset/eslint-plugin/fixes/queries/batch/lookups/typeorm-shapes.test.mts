import { rule as ioInLoop } from '../../../../rules/loops/no-io-in-loop.mts';
import { ormProject } from '../../../../test-support/projects/orm-project.mts';
import { typeormCases } from '../../../../test-support/queries/batch-cases.mts';

const { project, pair, fixes } = typeormCases(ormProject('typeorm-shapes'));

project.tester.run('typeorm lookups in other shapes', ioInLoop, {
  valid: [],
  invalid: [
    pair(
      `export class Service {
  private readonly repo!: Repository<User>;
  async run() {
    for (const id of ids) {
      const user = await this.repo.findOneBy({ id });
      console.log(user);
    }
  }
}
`,
      `export class Service {
  private readonly repo!: Repository<User>;
  async run() {
    const usersById = new Map<number, User>();
    for (let index = 0; index < ids.length; index += 500) {
      const part = ids.slice(index, index + 500);
      for (const row of await this.repo.findBy({ id: In(part) })) {
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
  const rows = await Promise.all(
    ids.map(async (id) => {
      const user = await repo.findOneBy({ id });
      return user ?? { id };
    }),
  );
  use(rows);
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
  const rows = await Promise.all(
    ids.map(async (id) => {
      const user = usersById.get(id) ?? null;
      return user ?? { id };
    }),
  );
  use(rows);
}
`,
      { report: 'concurrentQuery' },
    ),
    pair(
      `export async function run() {
  ids.forEach(async (id) => {
    const user = await repo.findOneBy({ id });
    console.log(user);
  });
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
  ids.forEach(async (id) => {
    const user = usersById.get(id) ?? null;
    console.log(user);
  });
}
`,
    ),
    pair(
      `export async function run() {
  if (workspaceId) {
    for (const id of ids) {
      const user = await repo.findOneBy({ id });
      console.log(user);
    }
  }
}
`,
      `export async function run() {
  if (workspaceId) {
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
}
`,
    ),
    fixes(
      `import { Repository, In } from 'typeorm';
import { User } from './entities';
declare const repo: Repository<User>;
declare const ids: number[];
declare const out: unknown[];
export async function run() {
  const usersById = 1;
  console.log(usersById);
  for (const id of ids) {
    const user = await repo.findOneBy({ id });
    console.log(user);
  }
}
`,
      `import { Repository, In } from 'typeorm';
import { User } from './entities';
declare const repo: Repository<User>;
declare const ids: number[];
declare const out: unknown[];
export async function run() {
  const usersById = 1;
  console.log(usersById);
  const usersById2 = new Map<number, User>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    for (const row of await repo.findBy({ id: In(part) })) {
      usersById2.set(row.id, row);
    }
  }
  for (const id of ids) {
    const user = usersById2.get(id) ?? null;
    console.log(user);
  }
}
`,
    ),
    fixes(
      `import type { Repository } from 'typeorm';
import { User } from './entities';
declare const repo: Repository<User>;
declare const ids: number[];
declare const out: unknown[];
export async function run() {
  for (const id of ids) {
    const user = await repo.findOneBy({ id });
    console.log(user);
  }
}
`,
      `import type { Repository } from 'typeorm';
import { User } from './entities';
import { In } from 'typeorm';
declare const repo: Repository<User>;
declare const ids: number[];
declare const out: unknown[];
export async function run() {
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
    const user = await repo.findOne({ where: { id }, select: { id: true, name: true } });
    console.log(user?.name);
  }
}
`,
      `export async function run() {
  const usersById = new Map<number, User>();
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    for (const row of await repo.find({ where: { id: In(part) }, select: { id: true, name: true } })) {
      usersById.set(row.id, row);
    }
  }
  for (const id of ids) {
    const user = usersById.get(id) ?? null;
    console.log(user?.name);
  }
}
`,
    ),
    fixes(
      `import { Repository, In } from 'typeorm';
import { User } from './entities';
declare const repo: Repository<User>;
declare const ids: number[];
declare const out: unknown[];
declare function use(value: unknown): void;
export async function run() {
  for (const id of ids) {
    const user = await repo.findOneBy({ id });
    console.log(user);
  }
  use(In([1]));
}
`,
      `import { Repository, In } from 'typeorm';
import { User } from './entities';
declare const repo: Repository<User>;
declare const ids: number[];
declare const out: unknown[];
declare function use(value: unknown): void;
export async function run() {
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
  use(In([1]));
}
`,
    ),
    pair(
      `export async function run() {
  for (const id of ids) {
    const user = await repo.findOneBy({ id });
    if (!user) {
      continue;
    }
    const name = user.name.trim();
    use(name);
    console.log(user.teamId, user.nickname);
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
    if (!user) {
      continue;
    }
    const name = user.name.trim();
    use(name);
    console.log(user.teamId, user.nickname);
  }
}
`,
    ),
  ],
});
