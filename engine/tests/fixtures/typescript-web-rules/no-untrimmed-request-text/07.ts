import { Controller, Get, Query, Body } from '@nestjs/common';
import { Like } from 'typeorm';
@Controller() class A { @Get() f(@Query('page') page: number, repo) { return repo.findByName(page); } }