import { IsInt, IsBoolean, IsDate, IsOptional, IsString, Min } from 'class-validator';
import { Type, Transform, Expose } from 'class-transformer';
class ListDto { @IsOptional() @IsInt() @Min(1) limit?: number; @Expose() @IsBoolean() all!: boolean; @IsDate() since!: Date; @IsString() name!: string; }
import { Controller, Get, Post, Query, Param, Headers, Body, UseInterceptors, UploadedFile, ParseIntPipe, ParseBoolPipe, DefaultValuePipe } from '@nestjs/common';
@Controller('items')
export class ItemsController {
@Get() list(@Query() query: ListDto) { return query; }
}