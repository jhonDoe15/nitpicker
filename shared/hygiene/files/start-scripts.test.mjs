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
        prestart: 'npm run db:sync',
        'db:sync': 'typeorm-ts-node-commonjs schema:sync -d src/data-source.ts',
      }),
      'api/package.json': manifest({ 'start:prod': 'drizzle-kit  push && node server.js' }),
      'worker/package.json': manifest({ serve: 'prisma migrate dev --name init; node .' }),
      'jobs/package.json': manifest({ start: 'mikro-orm schema:update --run && node .' }),
    });

    expect(found.map(({ path, identity }) => `${path} ${identity}`)).toEqual([
      'api/package.json api/package.json|start:prod|start-schema-push',
      'jobs/package.json jobs/package.json|start|start-schema-push',
      'package.json package.json|start|start-schema-push',
      'package.json package.json|prestart|start-schema-push',
      'worker/package.json worker/package.json|serve|start-schema-push',
    ]);
    expect(found[0].message).toContain('runs `drizzle-kit push`');
    expect(found[2].message).toContain('runs `prisma db push`');
    expect(found[2].message).toContain('`prisma migrate deploy`');
    expect(found[2].message).toContain('"rule":"start-schema-push"');
  });

  it('leaves migrations, development scripts and broken manifests alone', () => {
    const found = pushes({
      'package.json': manifest({
        start: 'prisma migrate deploy && node dist/main.js',
        dev: 'prisma db push && tsx watch src/main.ts',
        'start:dev': 'prisma migrate dev && nest start --watch',
        'db:push': 'prisma db push',
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
