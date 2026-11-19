import { rule as ioInLoop } from '../../../../../rules/loops/no-io-in-loop.mts';
import { ormProject } from '../../../../../test-support/projects/orm-project.mts';
import { INSERT_HEAD, insertCases } from '../../../../../test-support/queries/write-cases.mts';

const { project, pair, clean } = insertCases(
  ormProject('typeorm-inserts', { dependencies: ['typeorm', 'pg'] }),
  INSERT_HEAD,
);

project.tester.run('typeorm inserts per item', ioInLoop, {
  valid: [
    clean(`export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await notes.insert(part.map((row) => ({ email: row.slug, ownerId: 1 })));
  }
}
`),
  ],
  invalid: [
    pair(
      `export async function run() {
  for (const row of rows) {
    await repo.insert({ name: row.name, workspaceId, teamId: row.teamId, email: row.slug });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await repo.insert(part.map((row) => ({ name: row.name, workspaceId, teamId: row.teamId, email: row.slug })));
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const entry of noteRows) await notes.insert(entry);
}
`,
      `export async function run() {
  for (let index = 0; index < noteRows.length; index += 100) {
    const part = noteRows.slice(index, index + 100);
    await notes.insert(part);
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const entity of entities) {
    await repo.insert(toEntity(entity));
  }
}
`,
      `export async function run() {
  for (let index = 0; index < entities.length; index += 100) {
    const part = entities.slice(index, index + 100);
    await repo.insert(part.map((entity) => toEntity(entity)));
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const row of rows) {
    await repo.insert({ name: \`\${row.name}!\`, teamId: row.owner.id * 2, tags: [row.name] });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await repo.insert(part.map((row) => ({ name: \`\${row.name}!\`, teamId: row.owner.id * 2, tags: [row.name] })));
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const row of rows) {
    await notes.insert({ email: row.slug, ownerId: row.teamId });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await notes.insert(part.map((row) => ({ email: row.slug, ownerId: row.teamId })));
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const row of rows) {
    await notes.insert({ email: row.slug.toLowerCase(), ownerId: row.teamId + 1 });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await notes.insert(part.map((row) => ({ email: row.slug.toLowerCase(), ownerId: row.teamId + 1 })));
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const row of rows) {
    await codes.insert({ slug: row.slug, label: workspaceId || row.name });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await codes.insert(part.map((row) => ({ slug: row.slug, label: workspaceId || row.name })));
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const row of rows) {
    await notes.insert({ email: row.slug, ownerId: ids[0] ?? 0 });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await notes.insert(part.map((row) => ({ email: row.slug, ownerId: ids[0] ?? 0 })));
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const row of rows) {
    await notes.insert({ email: row.slug, ownerId: stamp.length });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await notes.insert(part.map((row) => ({ email: row.slug, ownerId: stamp.length })));
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const row of rows) {
    await notes.insert({ email: row.slug, ownerId: row.owner?.id ?? 0 });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await notes.insert(part.map((row) => ({ email: row.slug, ownerId: row.owner?.id ?? 0 })));
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const row of rows) await codes.insert({ slug: stamp(), label: row.name });
}
`,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await codes.insert(part.map((row) => ({ slug: stamp(), label: row.name })));
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const row of rows) {
    await notes.insert({ email: row.name, ownerId: 1 });
  }
}
`,
      `export async function run() {
  for (let index = 0; index < rows.length; index += 100) {
    const part = rows.slice(index, index + 100);
    await notes.insert(part.map((row) => ({ email: row.name, ownerId: 1 })));
  }
}
`,
    ),
  ],
});
