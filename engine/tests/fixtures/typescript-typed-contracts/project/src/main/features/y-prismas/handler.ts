import type { User, Post, Prisma } from '@prisma/client';
import { Controller, Get } from '@nestjs/common';
import type { Account } from '../../../generated/prisma';
@Controller()
export class C {
  @Get() a(): User { return null as never; }
  @Get() b(): Prisma.PostGetPayload<{}> { return null as never; }
  @Get() c(): Prisma.UserDelegate { return null as never; }
  @Get() d(): Omit<User, 'id'> { return null as never; }
  @Get() e(): Pick<Post, 'id'>[] { return null as never; }
  @Get() f(): Account { return null as never; }
  @Get() g(): Prisma.$PostPayload { return null as never; }
  @Get() h(): Promise<Account | Post> { return null as never; }
}
