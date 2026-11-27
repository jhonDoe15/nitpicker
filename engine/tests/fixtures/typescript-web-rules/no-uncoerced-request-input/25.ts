import { IsInt, IsBoolean, IsDate, IsOptional, IsString, Min } from 'class-validator';
import { PartialType, OmitType } from '@nestjs/swagger';
class BaseDto { @IsInt() page!: number; @IsInt() size!: number; }
class ListDto extends OmitType(BaseDto, ['size']) {}
import { Controller, Get, Post, Query, Param, Headers, Body, UseInterceptors, UploadedFile, ParseIntPipe, ParseBoolPipe, DefaultValuePipe } from '@nestjs/common';
@Controller('items')
export class ItemsController {
@Get() list(@Query() query: ListDto) { return query; }
}