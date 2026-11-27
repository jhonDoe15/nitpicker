import { Controller, Get, Query, Body } from '@nestjs/common';
import { Like } from 'typeorm';
import { SearchDto } from './dto';
@Controller() class A { @Get() f(@Query() dto: SearchDto, repo) { return repo.find({ where: { age: dto.limit } }); } }