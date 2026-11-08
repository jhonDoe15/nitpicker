import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-uncoerced-request-input.mjs';
import { expectedError } from './test-support/expected-error.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-request-input-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
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
  }),
);
mkdirSync(path.join(root, 'src'));
writeFileSync(
  path.join(root, 'src/dto.ts'),
  [
    "import { IsInt, IsBoolean, IsString } from 'class-validator';",
    "import { Type } from 'class-transformer';",
    "import { z } from 'zod';",
    "import { createZodDto } from 'nestjs-zod';",
    'export class ListDto { @IsInt() limit!: number; @IsString() name!: string; }',
    'export class PageDto { @Type(() => Number) @IsInt() page!: number; @IsBoolean() all!: boolean; }',
    'export const UploadSchema = z.object({ duration: z.int32(), name: z.string() });',
    'export class UploadDto extends createZodDto(UploadSchema) {}',
    'export const CoercedSchema = z.object({ limit: z.coerce.number() });',
  ].join('\n'),
);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });
const NEST =
  "import { Controller, Get, Post, Query, Body, UseInterceptors } from '@nestjs/common';\nimport { FileInterceptor } from '@nestjs/platform-express';\n";

function typed(code, errors = []) {
  const file = path.join(root, `src/case-${randomUUID()}.ts`);
  writeFileSync(file, code);
  return {
    filename: file,
    code,
    ...(errors.length === 0
      ? {}
      : { errors: errors.map(([messageId, data]) => expectedError(messageId, data)) }),
  };
}

function controller(imports, body) {
  return `${NEST}${imports}\n@Controller('items')\nexport class ItemsController {\n${body}\n}`;
}

tester.run('no-uncoerced-request-input across files', rule, {
  valid: [
    typed(
      controller(
        "import { ListDto } from './dto';",
        '@Post() create(@Body() body: ListDto) { return body; }',
      ),
    ),
    typed(
      "import { CoercedSchema } from './dto';\nexport function list(req: { query: unknown }) { return CoercedSchema.parse(req.query); }",
    ),
  ],
  invalid: [
    typed(
      controller(
        "import * as dto from './dto';\ntype Listing = dto.ListDto;",
        '@Get() list(@Query() query: dto.ListDto, @Query() other: Listing) { return [query, other]; }',
      ),
      [
        ['rejected', { field: 'limit' }],
        ['rejected', { field: 'limit' }],
      ],
    ),
    typed(
      controller(
        "import { ListDto } from './dto';",
        '@Get() list(@Query() query: ListDto) { return query; }',
      ),
      [['rejected', { field: 'limit', form: '@IsInt()' }]],
    ),
    typed(
      controller(
        "import { PageDto } from './dto';",
        '@Get() list(@Query() query: PageDto) { return query; }',
      ),
      [['rejected', { field: 'all', form: '@IsBoolean()' }]],
    ),
    typed(
      controller(
        "import { UploadDto } from './dto';",
        "@Post() @UseInterceptors(FileInterceptor('file')) upload(@Body() body: UploadDto) { return body; }",
      ),
      [['rejected', { field: 'duration', source: 'multipart form', form: 'z.int32()' }]],
    ),
    typed(
      "import { UploadSchema } from './dto';\nexport function list(req: { query: unknown }) { return UploadSchema.parse(req.query); }",
      [['rejected', { field: 'duration' }]],
    ),
  ],
});
