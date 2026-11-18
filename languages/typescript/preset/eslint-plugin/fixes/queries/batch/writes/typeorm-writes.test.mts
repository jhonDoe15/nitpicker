import { rule as ioInLoop } from '../../../../rules/loops/no-io-in-loop.mts';
import { ormProject } from '../../../../test-support/projects/orm-project.mts';
import { writeCases } from '../../../../test-support/queries/write-cases.mts';

const { project, pair, clean } = writeCases(ormProject('typeorm-writes'));

project.tester.run('typeorm deletes and updates per item', ioInLoop, {
  valid: [
    clean(`export async function run() {
  for (const id of ids) {
    await repo.softDelete(id);
  }
}
`),
    clean(`export async function run() {
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    await repo.delete({ id: In(part) });
  }
}
`),
  ],
  invalid: [
    pair(
      `import { Stamped } from './entities';
declare const stamped: Repository<Stamped>;
export async function run() {
  const unique = [...new Set(ids)];
  for (const id of unique) {
    await stamped.update(id, { id: 1 });
  }
}
`,
      `import { Stamped } from './entities';
declare const stamped: Repository<Stamped>;
export async function run() {
  const unique = [...new Set(ids)];
  for (let index = 0; index < unique.length; index += 500) {
    const part = unique.slice(index, index + 500);
    await stamped.update({ id: In(part) }, { id: 1 });
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const id of ids) {
    await repo.delete(id);
  }
}
`,
      `export async function run() {
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    await repo.delete({ id: In(part) });
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const id of ids) await repo.delete(id);
}
`,
      `export async function run() {
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    await repo.delete({ id: In(part) });
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const row of rows) {
    await repo.delete(row.id);
  }
}
`,
      `export async function run() {
  const keys = rows.map((row) => row.id);
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    await repo.delete({ id: In(part) });
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const id of ids) {
    await repo.delete({ id });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    await repo.delete({ id: In(part) });
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const id of ids) {
    await repo.delete({ id, workspaceId });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    await repo.delete({ id: In(part), workspaceId });
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const slug of slugs) {
    await codes.delete(slug);
  }
}
`,
      `export async function run() {
  for (let index = 0; index < slugs.length; index += 500) {
    const part = slugs.slice(index, index + 500);
    await codes.delete({ slug: In(part) });
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const id of ids) {
    await repo.update(id, { status: 'archived' });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    await repo.update({ id: In(part) }, { status: 'archived' });
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const row of rows) {
    await repo.update({ id: row.id }, { status: 'archived', nickname: null });
  }
}
`,
      `export async function run() {
  const keys = rows.map((row) => row.id);
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    await repo.update({ id: In(part) }, { status: 'archived', nickname: null });
  }
}
`,
    ),
    pair(
      `export async function run() {
  const patch = { status: 'on' };
  for (const id of ids) {
    await repo.update(id, patch);
  }
}
`,
      `export async function run() {
  const patch = { status: 'on' };
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    await repo.update({ id: In(part) }, patch);
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const id of ids) {
    await repo.update({ teamId: id, workspaceId }, { status: \`team:\${workspaceId}\` });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    await repo.update({ teamId: In(part), workspaceId }, { status: \`team:\${workspaceId}\` });
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const row of rows) {
    await repo.delete({ teamId: row.teamId });
  }
}
`,
      `export async function run() {
  const keys = rows.map((row) => row.teamId);
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    await repo.delete({ teamId: In(part) });
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const id of ids) {
    await notes.delete({ ownerId: id });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    await notes.delete({ ownerId: In(part) });
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const id of ids) {
    await members.delete({ teamId: id });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < ids.length; index += 500) {
    const part = ids.slice(index, index + 500);
    await members.delete({ teamId: In(part) });
  }
}
`,
    ),
  ],
});
