import { Controller, Get, Post, Query, Body, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as dto from './dto';
type Listing = dto.ListDto;
@Controller('items')
export class ItemsController {
@Get() list(@Query() query: dto.ListDto, @Query() other: Listing) { return [query, other]; }
}