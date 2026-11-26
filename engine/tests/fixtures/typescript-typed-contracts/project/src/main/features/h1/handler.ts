import { UserEntity, AdminEntity, Audit, UserView } from '../users/user.entity';
import { Invoice, type CatDocument, type ProfileDocument } from '../users/models';
import { Body, Controller, Get, Post } from '@nestjs/common';
@Controller('users')
export class UsersController { @Get() list(): Promise<UserView[]> { return Promise.resolve([]); } helper(): UserEntity { return new UserEntity(); } }