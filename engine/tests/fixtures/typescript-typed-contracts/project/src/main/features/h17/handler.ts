import { Body, Controller, Get, Post } from '@nestjs/common';
import type { Account } from '../../../generated/prisma';
@Controller('accounts')
export class AccountsController { @Get() list(): Promise<Account[]> { return Promise.resolve([]); } }