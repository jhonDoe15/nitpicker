import { z } from 'zod';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { Controller, Get, Post, Query, Param, Headers, Body, UseInterceptors, UploadedFile, ParseIntPipe, ParseBoolPipe, DefaultValuePipe } from '@nestjs/common';
@Controller('items')
export class ItemsController {
@Get() list(@Query(new ZodValidationPipe(z.object({ since: z.date() }))) query: unknown) { return query; }
}