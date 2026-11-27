import { Controller, Get, Query, Body } from '@nestjs/common';
import { Like } from 'typeorm';
@Controller() class A { @Get() f(@Query('q') q: string, repo) { return repo.findByNameContaining(q); } }