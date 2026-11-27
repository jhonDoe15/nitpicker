import { IsInt, IsBoolean, IsDate, IsOptional, IsString, Min } from 'class-validator';
import { ToNumber } from './transforms';
class ListDto { @ToNumber() @IsInt() limit!: number; }
import { Controller, Get, Post, Query, Param, Headers, Body, UseInterceptors, UploadedFile, ParseIntPipe, ParseBoolPipe, DefaultValuePipe } from '@nestjs/common';
@Controller('items')
export class ItemsController {
@Get() list(@Query() query: ListDto) { return query; }
}