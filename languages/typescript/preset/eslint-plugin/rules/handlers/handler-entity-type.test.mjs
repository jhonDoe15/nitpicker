import { rule } from './handler-entity-type.mjs';
import { typedProject } from '../contracts/test-support/typed-project.mjs';

const { write, tester, folder } = typedProject('nitpicker-handler-entity-');

write(
  'src/main/features/users/user.entity.ts',
  [
    "import { BaseEntity, Column, Entity } from 'typeorm';",
    '@Entity()',
    'export class UserEntity extends BaseEntity { @Column() email = ""; }',
    'export class AdminEntity extends UserEntity {}',
    '@Entity()',
    'export class Audit { @Column() at = 0; }',
    'export class UserView { email = ""; }',
    '',
  ].join('\n'),
);
write(
  'src/main/features/users/models.ts',
  [
    "import { Model } from 'sequelize';",
    "import type { HydratedDocument } from 'mongoose';",
    'export class Invoice extends Model {}',
    'export type ProfileDocument = HydratedDocument<{ name: string }>;',
    '',
  ].join('\n'),
);

const ENTITIES =
  "import { UserEntity, AdminEntity, Audit, UserView } from '../users/user.entity';\nimport { Invoice, type ProfileDocument } from '../users/models';\n";
const NEST = "import { Body, Controller, Get, Post } from '@nestjs/common';\n";
const EXPRESS = "import type { Request, Response } from 'express';\n";

function source(code, { file = 'handler.ts', errors } = {}) {
  const filename = write(`src/main/features/${folder('h')}/${file}`, code);
  return { filename, code, ...(errors === undefined ? {} : { errors }) };
}

function entity(site, name, orm) {
  return { messageId: 'entity', data: { site, entity: name, orm } };
}

tester.run('handler-entity-type', rule, {
  valid: [
    source(
      `${ENTITIES}${NEST}@Controller('users')\nexport class UsersController { @Get() list(): Promise<UserView[]> { return Promise.resolve([]); } helper(): UserEntity { return new UserEntity(); } }`,
    ),
    source(
      `${ENTITIES}${EXPRESS}export function show(req: Request, res: Response): void { res.json({ email: String(req.body) }); }`,
    ),
    source(`${ENTITIES}export function load(): UserEntity { return new UserEntity(); }`),
    source(
      `${ENTITIES}import { NextResponse } from 'next/server';\nexport async function GET(): Promise<NextResponse<UserView>> { return NextResponse.json(new UserView()); }`,
      { file: 'route.ts' },
    ),
    source(`${ENTITIES}export function GET(): UserEntity { return new UserEntity(); }`),
    source(
      `${ENTITIES}import type { User } from '@prisma/client';\nexport function view(user: User): { email: string } { return { email: user.email }; }`,
    ),
  ],
  invalid: [
    source(
      `${ENTITIES}${NEST}@Controller('users')\nexport class UsersController {\n  @Get() list(): Promise<UserEntity[]> { return Promise.resolve([]); }\n  @Post() create(@Body() body: Audit): void { void body; }\n}`,
      {
        errors: [
          entity('UsersController.list', 'UserEntity', 'TypeORM'),
          entity('UsersController.create', 'Audit', 'TypeORM'),
        ],
      },
    ),
    source(
      `${ENTITIES}${EXPRESS}export function show(req: Request, res: Response): void { res.json(new AdminEntity()); }`,
      { errors: [entity('res.json(...)', 'AdminEntity', 'TypeORM')] },
    ),
    source(
      `${ENTITIES}import { NextResponse } from 'next/server';\nexport async function GET(): Promise<NextResponse<Invoice[]>> { return NextResponse.json([new Invoice()]); }`,
      {
        file: 'route.ts',
        errors: [
          entity('GET', 'Invoice', 'Sequelize'),
          entity('NextResponse.json(...)', 'Invoice', 'Sequelize'),
        ],
      },
    ),
    source(
      `${ENTITIES}import type { Context } from 'koa';\nexport function show(ctx: Context, profile: ProfileDocument): void { ctx.body = profile; }`,
      { errors: [entity('ctx.body =', 'Document', 'Mongoose')] },
    ),
    source(
      `${ENTITIES}import type { User } from '@prisma/client';\nexport const POST = async (): Promise<Response> => Response.json([] as User[]);`,
      { file: 'route.ts', errors: [entity('Response.json(...)', 'User', 'Prisma')] },
    ),
  ],
});
