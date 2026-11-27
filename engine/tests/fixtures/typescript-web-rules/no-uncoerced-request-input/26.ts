import { IsInt, IsBoolean, IsDate, IsOptional, IsString, Min } from 'class-validator';
import { Type, Transform, Expose } from 'class-transformer';
class BaseDto { @IsInt() page!: number; @IsInt() size!: number; }
class ListDto extends BaseDto { @Type(() => Number) @IsInt() size!: number; }
import { Controller, Get, Post, Query, Param, Headers, Body, UseInterceptors, UploadedFile, ParseIntPipe, ParseBoolPipe, DefaultValuePipe } from '@nestjs/common';
@Controller('items')
export class ItemsController {
@Get() list(@Query() query: ListDto) { return query; }
}