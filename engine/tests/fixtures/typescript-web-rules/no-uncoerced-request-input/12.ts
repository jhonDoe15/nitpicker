import { IsInt, IsBoolean, IsDate, IsOptional, IsString, Min } from 'class-validator';
class CreateDto { @IsInt() count!: number; }
import { Controller, Get, Post, Query, Param, Headers, Body, UseInterceptors, UploadedFile, ParseIntPipe, ParseBoolPipe, DefaultValuePipe } from '@nestjs/common';
@Controller('items')
export class ItemsController {
@Post() create(@Body() body: CreateDto) { return body; }
}