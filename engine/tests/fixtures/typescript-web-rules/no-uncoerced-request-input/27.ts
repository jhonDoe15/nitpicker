import { IsInt, IsBoolean, IsDate, IsOptional, IsString, Min } from 'class-validator';
import { FileInterceptor } from '@nestjs/platform-express';
class UploadDto { @IsInt() duration!: number; }
import { Controller, Get, Post, Query, Param, Headers, Body, UseInterceptors, UploadedFile, ParseIntPipe, ParseBoolPipe, DefaultValuePipe } from '@nestjs/common';
@Controller('items')
export class ItemsController {
@Post() @UseInterceptors(FileInterceptor('file')) upload(@UploadedFile() file: unknown, @Body() body: UploadDto) { return body; }
}