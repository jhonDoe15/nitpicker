import { z } from 'zod';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
const Base = z.object({ page: z.number(), size: z.number() });
const ListSchema = Base.extend({ size: z.coerce.number() }).strict();
class ListDto extends createZodDto(ListSchema) {}
import { Controller, Get, Post, Query, Param, Headers, Body, UseInterceptors, UploadedFile, ParseIntPipe, ParseBoolPipe, DefaultValuePipe } from '@nestjs/common';
@Controller('items')
export class ItemsController {
@Get() list(@Query() query: ListDto) { return query; }
}