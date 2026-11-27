import { Controller, Get, Query, Body } from '@nestjs/common';
import { Like } from 'typeorm';
import { SearchDto } from './dto';
@Controller() class A { @Post() f(@Body() dto: SearchDto, repo) { return repo.find({ where: { name: dto.name } }); } }