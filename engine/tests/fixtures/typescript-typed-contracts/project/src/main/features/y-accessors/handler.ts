import { UserEntity, AdminEntity, Audit, UserView } from '../users/user.entity';
import { Invoice, type CatDocument, type ProfileDocument } from '../users/models';
import { Body, Controller, Get, Post as PostRoute, Put } from '@nestjs/common';
@Controller()
export class C {
  @Get() get a(): UserEntity { return new UserEntity(); }
  @Put() set b(v: Audit) { void v; }
  @Get() ['computed'](): Audit { return new Audit(); }
  @Get() 'quoted'(): Audit { return new Audit(); }
  @Get() 123(): Audit { return new Audit(); }
  constructor(@Body() a: Audit) { void a; }
  @Get() static st(): Audit { return new Audit(); }
  ov(a: string): Audit;
  @Get() ov(a: unknown): Audit { return new Audit(); }
  @Get() async *gen(): AsyncGenerator<Audit> { yield new Audit(); }
  plain(): Audit { return new Audit(); }
}
export const K = @Controller() class { @Get() m(): Audit { return new Audit(); } };
