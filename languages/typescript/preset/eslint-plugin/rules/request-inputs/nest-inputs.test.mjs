import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-uncoerced-request-input.mjs';
import { expectedError } from './test-support/expected-error.mjs';

const tester = typescriptRuleTester();
const NEST =
  "import { Controller, Get, Post, Query, Param, Headers, Body, UseInterceptors, UploadedFile, ParseIntPipe, ParseBoolPipe, DefaultValuePipe } from '@nestjs/common';\n";
const VALIDATOR =
  "import { IsInt, IsBoolean, IsDate, IsOptional, IsString, Min } from 'class-validator';\n";
const TRANSFORMER = "import { Type, Transform, Expose } from 'class-transformer';\n";
const ZOD =
  "import { z } from 'zod';\nimport { createZodDto, ZodValidationPipe } from 'nestjs-zod';\n";
const FILES = "import { FileInterceptor } from '@nestjs/platform-express';\n";

function controller(body) {
  return `${NEST}@Controller('items')\nexport class ItemsController {\n${body}\n}`;
}

function invalid(code, errors) {
  return { code, errors: errors.map(([messageId, data]) => expectedError(messageId, data)) };
}

tester.run('no-uncoerced-request-input on NestJS handlers', rule, {
  valid: [
    `${VALIDATOR}import { PickType } from '@nestjs/swagger';\nclass BaseDto { @IsInt() page!: number; @IsString() name!: string; }\nclass ListDto extends PickType(BaseDto, ['name'] as const) {}\n` +
      controller('@Get() list(@Query() query: ListDto) { return query; }'),
    `${VALIDATOR}import { Type as As } from 'class-transformer';\nclass ListDto { @As(() => Number) @IsInt() page!: number; }\n` +
      controller('@Get() list(@Query() query: ListDto) { return query; }'),
    controller("@Get() list(@Query('limit', ParseIntPipe) limit: number) { return limit; }"),
    controller(
      "@Get() list(@Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number) { return limit; }",
    ),
    controller("@Get() list(@Query('all', new ParseBoolPipe()) all: boolean) { return all; }"),
    controller("@Get() list(@Query('name') name: string) { return name; }"),
    controller("@Get() list(@Query('limit', LimitPipe) limit: number) { return limit; }"),
    controller("@Get(':id') get(@Param('id') id: string | undefined) { return id; }"),
    controller('@Post() create(@Body() body: { count: number }) { return body; }'),
    `${VALIDATOR}${TRANSFORMER}class ListDto { @Type(() => Number) @IsInt() @Min(1) limit!: number; @Transform(({ value }) => value === 'true') @IsBoolean() all!: boolean; @IsString() name!: string; }\n${controller('@Get() list(@Query() query: ListDto) { return query; }')}`,
    `${VALIDATOR}import { ToNumber } from './transforms';\nclass ListDto { @ToNumber() @IsInt() limit!: number; }\n${controller('@Get() list(@Query() query: ListDto) { return query; }')}`,
    `${VALIDATOR}class CreateDto { @IsInt() count!: number; }\n${controller('@Post() create(@Body() body: CreateDto) { return body; }')}`,
    `${ZOD}const ListSchema = z.object({ limit: z.coerce.number().int(), all: z.stringbool(), name: z.string() });\nclass ListDto extends createZodDto(ListSchema) {}\n${controller('@Get() list(@Query() query: ListDto) { return query; }')}`,
    ZOD +
      controller(
        "@Get() list(@Query('limit', new ZodValidationPipe(z.coerce.number())) limit: number) { return limit; }",
      ),
  ],
  invalid: [
    invalid(
      "import { Controller, Query as Q } from '@nestjs/common';\n@Controller() export class A { list(@Q('page') page: number) { return page; } }",
      [['unconverted', { field: 'page' }]],
    ),
    invalid(controller("@Get() list(@Query('ids') ids: number[]) { return ids; }"), [
      ['unconverted', { field: 'ids', fix: 'new ParseArrayPipe({ items: Number })' }],
    ]),
    invalid(
      `${VALIDATOR}import { PickType } from '@nestjs/swagger';\nclass BaseDto { @IsInt() page!: number; @IsString() name!: string; }\nclass ListDto extends PickType(BaseDto, ['page'] as const) {}\n` +
        controller('@Get() list(@Query() query: ListDto) { return query; }'),
      [['rejected', { field: 'page' }]],
    ),
    invalid(controller("@Get() list(@Query('limit') limit: number) { return limit; }"), [
      [
        'unconverted',
        {
          field: 'limit',
          source: 'query string',
          form: 'the type number',
          fix: 'ParseIntPipe or ParseFloatPipe',
        },
      ],
    ]),
    invalid(
      controller(
        "@Get() list(@Query('limit', new DefaultValuePipe(10)) limit?: number) { return limit; }",
      ),
      [['unconverted', { field: 'limit' }]],
    ),
    invalid(controller("@Get(':id') get(@Param('id') id: number) { return id; }"), [
      ['unconverted', { field: 'id', source: 'path' }],
    ]),
    invalid(controller("@Get() list(@Headers('x-all') all: boolean | undefined) { return all; }"), [
      [
        'unconverted',
        { field: 'x-all', source: 'headers', fix: 'new ParseBoolPipe({ optional: true })' },
      ],
    ]),
    invalid(
      controller('@Get() list(@Query() query: { limit: number; name: string }) { return query; }'),
      [['unconverted', { field: 'limit', fix: 'a DTO or schema that converts it' }]],
    ),
    invalid(
      `${VALIDATOR}${TRANSFORMER}class ListDto { @IsOptional() @IsInt() @Min(1) limit?: number; @Expose() @IsBoolean() all!: boolean; @IsDate() since!: Date; @IsString() name!: string; }\n${controller('@Get() list(@Query() query: ListDto) { return query; }')}`,
      [
        [
          'rejected',
          { field: 'limit', source: 'query string', form: '@IsInt()', fix: '@Type(() => Number)' },
        ],
        ['rejected', { field: 'all', form: '@IsBoolean()' }],
        ['rejected', { field: 'since', form: '@IsDate()', fix: '@Type(() => Date)' }],
      ],
    ),
    invalid(
      `${VALIDATOR}${TRANSFORMER}class ListDto { @Type(() => Boolean) @IsBoolean() all!: boolean; }\n${controller('@Get() list(@Query() query: ListDto) { return query; }')}`,
      [['booleanCast', { field: 'all', form: '@Type(() => Boolean)' }]],
    ),
    invalid(
      `${VALIDATOR}import { PartialType, OmitType } from '@nestjs/swagger';\nclass BaseDto { @IsInt() page!: number; @IsInt() size!: number; }\nclass ListDto extends OmitType(BaseDto, ['size']) {}\n${controller('@Get() list(@Query() query: ListDto) { return query; }')}`,
      [['rejected', { field: 'page' }]],
    ),
    invalid(
      `${VALIDATOR}${TRANSFORMER}class BaseDto { @IsInt() page!: number; @IsInt() size!: number; }\nclass ListDto extends BaseDto { @Type(() => Number) @IsInt() size!: number; }\n${controller('@Get() list(@Query() query: ListDto) { return query; }')}`,
      [['rejected', { field: 'page' }]],
    ),
    invalid(
      `${VALIDATOR}${FILES}class UploadDto { @IsInt() duration!: number; }\n` +
        controller(
          "@Post() @UseInterceptors(FileInterceptor('file')) upload(@UploadedFile() file: unknown, @Body() body: UploadDto) { return body; }",
        ),
      [['rejected', { field: 'duration', source: 'multipart form' }]],
    ),
    invalid(
      `${ZOD}const ListSchema = z.object({ limit: z.int().optional(), all: z.coerce.boolean(), ids: z.array(z.number()), name: z.string() });\nclass ListDto extends createZodDto(ListSchema) {}\n${controller('@Get() list(@Query() query: ListDto) { return query; }')}`,
      [
        ['rejected', { field: 'limit', form: 'z.int()', fix: 'z.coerce.number().int()' }],
        ['booleanCast', { field: 'all', form: 'z.coerce.boolean()' }],
        ['rejected', { field: 'ids', form: 'z.number()' }],
      ],
    ),
    invalid(
      `${ZOD}const Base = z.object({ page: z.number(), size: z.number() });\nconst ListSchema = Base.extend({ size: z.coerce.number() }).strict();\nclass ListDto extends createZodDto(ListSchema) {}\n${controller('@Get() list(@Query() query: ListDto) { return query; }')}`,
      [['rejected', { field: 'page' }]],
    ),
    invalid(
      ZOD +
        controller(
          "@Get() list(@Query('limit', new ZodValidationPipe(z.number().int())) limit: number) { return limit; }",
        ),
      [['rejected', { field: 'limit', form: 'z.number()' }]],
    ),
    invalid(
      `${ZOD}${controller('@Get() list(@Query(new ZodValidationPipe(z.object({ since: z.date() }))) query: unknown) { return query; }')}`,
      [['rejected', { field: 'since', fix: 'z.coerce.date()' }]],
    ),
  ],
});
