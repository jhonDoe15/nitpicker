import { Controller, Query as Q } from '@nestjs/common';
@Controller() export class A { list(@Q('page') page: number) { return page; } }