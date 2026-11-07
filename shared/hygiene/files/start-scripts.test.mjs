import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mjs';
import { trackedFiles } from '../tracked-files.mjs';
import { withoutExcepted } from '../rules.mjs';
import { collectRepositoryFindings } from './repository-files.mjs';

const { createGitRepository } = useGitFixtures();

function pushes(files) {
  const { root } = createGitRepository(files);
  return collectRepositoryFindings({ projectRoot: root, files: trackedFiles(root) }).filter(
    ({ rule }) => rule === 'start-schema-push',
  );
}

const manifest = (scripts) => `${JSON.stringify({ name: 'app', scripts })}\n`;

describe('start-schema-push', () => {
  it('flags start scripts that push the ORM schema, directly or through a called script', () => {
    const found = pushes({
      'package.json': manifest({
        start: 'prisma db push && node dist/main.js',
        prestart: 'yarn db:prepare',
        'db:prepare': 'pnpm run db:sync',
        'db:sync': 'typeorm-ts-node-commonjs -d src/data-source.ts schema:sync',
      }),
      'api/package.json': manifest({
        'start:prod': 'drizzle-kit --config=db.ts push && node server.js',
      }),
      'worker/package.json': manifest({ serve: 'npx prisma migrate dev --name init; node .' }),
      'jobs/package.json': manifest({
        'start:docker': 'npm run boot',
        preboot: 'mikro-orm schema:update --run',
        boot: 'node .',
      }),
    });

    expect(found.map(({ path, identity }) => `${path} ${identity}`)).toEqual([
      'api/package.json api/package.json|start:prod|start-schema-push',
      'jobs/package.json jobs/package.json|start:docker|start-schema-push',
      'package.json package.json|start|start-schema-push',
      'package.json package.json|prestart|start-schema-push',
      'worker/package.json worker/package.json|serve|start-schema-push',
    ]);
    expect(found.map(({ message }) => message.split('`')[1])).toEqual([
      'drizzle-kit --config=db.ts push',
      'mikro-orm schema:update',
      'prisma db push',
      'typeorm-ts-node-commonjs -d src/data-source.ts schema:sync',
      'prisma migrate dev',
    ]);
    expect(found[2].message).toBe(
      'The "start" script in package.json runs `prisma db push`, which changes the database schema on every start without a migration: a deploy can drop columns and their data, and instances race to change the schema. Apply migrations in the deploy step instead (`prisma migrate deploy`, `drizzle-kit migrate`, `typeorm migration:run`, `mikro-orm migration:up`) and keep schema pushes for local development scripts. If this is intended, add {"rule":"start-schema-push","paths":["package.json"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('leaves migrations, development scripts and broken manifests alone', () => {
    const found = pushes({
      'package.json': manifest({
        start: 'prisma migrate deploy && node dist/main.js',
        dev: 'prisma db push && tsx watch src/main.ts',
        'start:dev': 'prisma migrate dev && nest start --watch',
        'db:push': 'prisma db push',
        serve: 'echo "never run prisma db push here" && node .',
        'start:local': 'npm run db:push && node .',
      }),
      'broken/package.json': '{ "scripts": ',
      'list/package.json': '{ "scripts": ["prisma db push"] }\n',
      'node_modules/lib/package.json': manifest({ start: 'prisma db push' }),
    });

    expect(found).toEqual([]);
  });

  it('takes an exception for the manifest', () => {
    const found = pushes({ 'tools/package.json': manifest({ start: 'prisma db push' }) });

    expect(
      withoutExcepted(found, [{ rule: 'start-schema-push', paths: ['tools/package.json'] }]),
    ).toEqual([]);
  });
});
