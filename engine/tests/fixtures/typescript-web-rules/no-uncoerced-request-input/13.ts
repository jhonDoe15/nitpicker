import { z } from 'zod';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
const ListSchema = z.object({ limit: z.coerce.number().int(), all: z.stringbool(), name: z.string() });
class ListDto extends createZodDto(ListSchema) {}
import { Controller, Get, Post, Query, Param, Headers, Body, UseInterceptors, UploadedFile, ParseIntPipe, ParseBoolPipe, DefaultValuePipe } from '@nestjs/common';
@Controller('items')
export class ItemsController {
@Get() list(@Query() query: ListDto) { return query; }
}