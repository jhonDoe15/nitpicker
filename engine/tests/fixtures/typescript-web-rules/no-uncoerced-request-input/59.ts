import { Controller, Get, Post, Query, Body, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ListDto } from './dto';
@Controller('items')
export class ItemsController {
@Post() create(@Body() body: ListDto) { return body; }
}