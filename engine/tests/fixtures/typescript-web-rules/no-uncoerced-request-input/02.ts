import { IsInt, IsBoolean, IsDate, IsOptional, IsString, Min } from 'class-validator';
import { Type as As } from 'class-transformer';
class ListDto { @As(() => Number) @IsInt() page!: number; }
import { Controller, Get, Post, Query, Param, Headers, Body, UseInterceptors, UploadedFile, ParseIntPipe, ParseBoolPipe, DefaultValuePipe } from '@nestjs/common';
@Controller('items')
export class ItemsController {
@Get() list(@Query() query: ListDto) { return query; }
}