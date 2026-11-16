import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-untrimmed-request-text.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-request-text-')));
const trimmed = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-request-text-trimmed-')));
for (const directory of [root, trimmed]) {
  mkdirSync(path.join(directory, 'src'), { recursive: true });
  writeFileSync(path.join(directory, 'package.json'), '{}');
}
const TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    experimentalDecorators: true,
    module: 'esnext',
    moduleResolution: 'bundler',
    noEmit: true,
    types: [],
    lib: ['ES2022'],
  },
  include: ['src'],
});
for (const directory of [root, trimmed]) {
  writeFileSync(path.join(directory, 'tsconfig.json'), TSCONFIG);
}
writeFileSync(
  path.join(root, 'src/dto.ts'),
  [
    "import { Transform } from 'class-transformer';",
    'export class SearchDto {',
    '  name!: string;',
    '  limit!: number;',
    '  @Transform(({ value }) => value.trim()) city!: string;',
    '}',
  ].join('\n'),
);
writeFileSync(
  path.join(trimmed, 'src/trim.pipe.ts'),
  'export class TrimPipe {}\napp.useGlobalPipes(new TrimPipe());\n',
);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(trimmed, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });
type Typed = { code: string; filename: string };

function at(
  directory: string,
  code: string,
  count = 0,
): Typed & { errors?: { messageId: string }[] } {
  const filename = path.join(directory, `src/case-${randomUUID()}.ts`);
  writeFileSync(filename, code);
  return {
    code,
    filename,
    ...(count === 0
      ? {}
      : { errors: Array.from({ length: count }, () => ({ messageId: 'untrimmed' })) }),
  };
}
function valid(code: string): Typed {
  return at(root, code);
}
function invalid(code: string, count = 1): Typed & { errors: { messageId: string }[] } {
  const found = at(root, code, count);
  return { ...found, errors: found.errors ?? [] };
}
const NEST =
  "import { Controller, Get, Query, Body } from '@nestjs/common';\nimport { Like } from 'typeorm';\n";
const DTO = "import { SearchDto } from './dto';\n";

tester.run('no-untrimmed-request-text', rule, {
  valid: [
    valid(
      'export function find(req, repo) { const q = req.query.q.trim(); return repo.findByNameContaining(q); }',
    ),
    valid(
      'export function find(req, repo) { let q = req.query.q; q = q.trim(); return repo.findByName(q); }',
    ),
    valid('export function find(req, repo) { return repo.findById(req.query.id); }'),
    valid(
      'export function find(req, repo) { const id = req.query.id; return repo.findByName(id); }',
    ),
    valid('export function show(req, log) { const q = req.query.q; log.info(q); }'),
    valid(
      "export function find(c, db) { const q = c.req.query('q')?.trim(); return db.where('name', q); }",
    ),
    valid(
      `${NEST}@Controller() class A { @Get() f(@Query('page') page: number, repo) { return repo.findByName(page); } }`,
    ),
    valid(
      `${NEST}@Controller() class A { @Get() f(@Query('q') q: string, log) { return log.info(q); } }`,
    ),
    valid(
      `${NEST}${DTO}@Controller() class A { @Get() f(@Query() dto: SearchDto, repo) { return repo.find({ where: { name: dto.city } }); } }`,
    ),
    valid(
      `${NEST}${DTO}@Controller() class A { @Get() f(@Query() dto: SearchDto, repo) { return repo.find({ where: { age: dto.limit } }); } }`,
    ),
  ],
  invalid: [
    invalid(
      `${NEST}${DTO}@Controller() class A { @Post() f(@Body() dto: SearchDto, repo) { return repo.find({ where: { name: dto.name } }); } }`,
    ),
    invalid(
      'export function find(req, repo) { const q = req.query.q; return repo.findByNameStartingWith(q); }',
    ),
    invalid('export function find(req, repo) { return repo.findByEmail(req.query.email); }'),
    invalid(
      "export function find(req, db) { const { q } = req.query; return db.where({ name: Like('%' + q + '%') }); }",
    ),
    invalid(
      "export function find(c, db) { const q = c.req.query('q'); return db.select().from(t).where(ilike(t.name, q)); }",
    ),
    invalid(
      "export function find(req, db) { const q = req.query.q; return db.query('select * from t where name = $1', [q]); }",
    ),
    invalid(
      'export function find(req, prisma) { const q = req.query.q as string; return prisma.user.findMany({ where: { name: { contains: q } } }); }',
    ),
    invalid(
      `${NEST}@Controller() class A { @Get() f(@Query('q') q: string, repo) { return repo.find({ where: { name: Like(q) } }); } }`,
    ),
    invalid(
      `${NEST}${DTO}@Controller() class A { @Get() f(@Query() dto: SearchDto, repo) { return repo.find({ where: { name: dto.name } }); } }`,
    ),
  ],
});

typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: trimmed }).run(
  'no-untrimmed-request-text with a global trimmer',
  rule,
  {
    valid: [
      at(
        trimmed,
        `${NEST}@Controller() class A { @Get() f(@Query('q') q: string, repo) { return repo.findByNameContaining(q); } }`,
      ),
    ],
    invalid: [],
  },
);
