import { rule as ioInLoop } from '../../../../rules/loops/no-io-in-loop.mts';
import { typescriptRuleTester } from '../../../../test-support/rule-tester.mts';
import { ormProject } from '../../../../test-support/projects/orm-project.mts';
import { WRITE_HEAD, writeCases } from '../../../../test-support/queries/write-cases.mts';

const { project, declines } = writeCases(ormProject('typeorm-write-declines'));

const HOOKED_ENTITIES: readonly (readonly [string, string])[] = [
  ['Versioned', 'versioned'],
  ['Hooked', 'hooked'],
  ['Cleaned', 'cleaned'],
  ['Loaded', 'loaded'],
  ['Stamped', 'stamped'],
];

project.tester.run('typeorm deletes and updates that stay as they are', ioInLoop, {
  valid: [],
  invalid: [
    ...HOOKED_ENTITIES.flatMap(([entity, name]) =>
      ['delete(id)', 'update(id, { id: 1 })'].map((statement) =>
        declines(`import { ${entity} } from './entities';
declare const ${name}: Repository<${entity}>;
export async function run() {
  for (const id of ids) {
    await ${name}.${statement};
  }
}
`),
      ),
    ),
    declines(
      `export async function run() {
  for (const id of ids) {
    await repo.remove(await repo.findOneByOrFail({ id }));
  }
}
`,
      ['query', 'query'],
    ),
    declines(`export async function run() {
  for (const id of ids) {
    await categories.delete(id);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    await repo.update(id, { status: stamp() });
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    await repo.update(id, { status: String(id) });
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    const result = await repo.delete(id);
    out.push(result);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    out.push(await repo.delete(id));
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    await repo.delete(id);
    use(id);
  }
}
`),
    declines(
      `export async function run() {
  for (const id of ids) {
    await repo.update(id, { status: 'x' });
    await repo.delete(id);
  }
}
`,
      ['query', 'query'],
    ),
    declines(`export async function run() {
  for (const id of ids) {
    // keep
    await repo.delete(id);
  }
}
`),
    declines(
      `export async function run() {
  await Promise.all(ids.map(async (id) => {
    await repo.delete(id);
  }));
}
`,
      ['concurrentQuery'],
    ),
    declines(`export async function run() {
  for (const id of ids) {
    await repo.delete({ email: String(id) });
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    await repo.delete({ id, status: stamp() });
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    if (id > 3) {
      await repo.delete(id);
    }
  }
}
`),
    declines(
      `export async function run() {
  for (const id of ids) {
    await repo.delete({ name: workspaceId, id: In(ids) } as never);
  }
}
`,
      ['setQuery'],
    ),
    declines(`export async function run() {
  for (const id of ids) {
    await repo.delete([id]);
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    await repo.update(id, { teamId: id });
  }
}
`),
    declines(`export async function run() {
  for (const id of ids) {
    await repo.delete(id.toString());
  }
}
`),
    declines(`export async function run() {
  for (let index = 0; index < ids.length; index += 1) {
    await repo.delete(ids[index]!);
  }
}
`),
  ],
});

typescriptRuleTester().run('typeorm deletes without type information', ioInLoop, {
  valid: [],
  invalid: [
    {
      code: `${WRITE_HEAD}export async function run() {
  for (const id of ids) {
    await repo.delete(id);
  }
}
`,
      errors: [{ messageId: 'query' }],
    },
    ...['row.id += 1;', 'row.id = stamp().length;', 'row.owner.id++;', 'use(row);'].map(
      (statement) =>
        declines(`export async function run() {
  for (const row of rows) {
    ${statement}
    await repo.delete(row.id);
  }
}
`),
    ),
  ],
});
