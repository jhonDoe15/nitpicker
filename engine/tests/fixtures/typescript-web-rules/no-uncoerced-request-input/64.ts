import { Controller, Get, Post, Query, Body, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadDto } from './dto';
@Controller('items')
export class ItemsController {
@Post() @UseInterceptors(FileInterceptor('file')) upload(@Body() body: UploadDto) { return body; }
}