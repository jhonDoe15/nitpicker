import { z } from 'zod';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { Controller, Get, Post, Query, Param, Headers, Body, UseInterceptors, UploadedFile, ParseIntPipe, ParseBoolPipe, DefaultValuePipe } from '@nestjs/common';
@Controller('items')
export class ItemsController {
@Get() list(@Query('limit', new ZodValidationPipe(z.coerce.number())) limit: number) { return limit; }
}