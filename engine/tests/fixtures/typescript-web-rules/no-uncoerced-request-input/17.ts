import { IsInt, IsBoolean, IsDate, IsOptional, IsString, Min } from 'class-validator';
import { PickType } from '@nestjs/swagger';
class BaseDto { @IsInt() page!: number; @IsString() name!: string; }
class ListDto extends PickType(BaseDto, ['page'] as const) {}
import { Controller, Get, Post, Query, Param, Headers, Body, UseInterceptors, UploadedFile, ParseIntPipe, ParseBoolPipe, DefaultValuePipe } from '@nestjs/common';
@Controller('items')
export class ItemsController {
@Get() list(@Query() query: ListDto) { return query; }
}