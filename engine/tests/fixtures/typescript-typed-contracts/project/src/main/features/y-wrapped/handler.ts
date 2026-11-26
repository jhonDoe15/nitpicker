import { UserEntity, AdminEntity, Audit, UserView } from '../users/user.entity';
import { Invoice, type CatDocument, type ProfileDocument } from '../users/models';
import { Body, Controller, Get, Post as PostRoute, Put } from '@nestjs/common';
@Controller()
export class C {
  @Get() a(): Promise<UserEntity | Audit> { return null as never; }
  @Get() b(): Map<string, UserEntity> { return null as never; }
  @Get() c(): { x: Audit; y: () => AdminEntity } { return null as never; }
  @Get() d(): [Audit, UserView] { return null as never; }
  @Get() e(): Readonly<Partial<Audit>> { return null as never; }
  @Get() f(): UserEntity & { extra: string } { return null as never; }
  @Get() g(x: Audit, y: Audit): UserEntity { return null as never; }
  @Get() h(): Array<Array<Array<Array<Array<Array<Array<Array<Array<Audit>>>>>>>>> { return null as never; }
  @Get() i(): UserEntity | undefined | null { return null as never; }
}
