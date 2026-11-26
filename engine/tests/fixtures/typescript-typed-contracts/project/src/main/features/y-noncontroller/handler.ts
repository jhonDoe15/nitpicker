import { UserEntity, AdminEntity, Audit, UserView } from '../users/user.entity';
import { Invoice, type CatDocument, type ProfileDocument } from '../users/models';
import { Body, Controller, Get, Post as PostRoute, Put } from '@nestjs/common';
export class C { @Get() m(): Audit { return new Audit(); } }
@Controller() class D { @Get() m(): Audit { return new Audit(); } }
export { D };
