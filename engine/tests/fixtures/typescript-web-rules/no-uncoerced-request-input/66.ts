import { Controller, Get, Query, Param, Headers, Body, UseInterceptors, UploadedFile, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { IsInt, IsBoolean, IsDate, Min, IsString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PickType, OmitType, PartialType, IntersectionType } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
class BaseDto { @IsInt() page!: number; @IsBoolean() all!: boolean; @IsDate() at!: Date; @IsString() name!: string; @Type(() => Boolean) @IsBoolean() flag!: boolean; #secret = 1; @IsInt() 'quoted-key'!: number; @IsInt() 10!: number; @IsInt() [computed]!: number; }
class Picked extends PickType(BaseDto, ['page', 'all'] as const) {}
class Omitted extends OmitType(BaseDto, ['page']) {}
class Both extends IntersectionType(Picked, Omitted) {}
class Partial2 extends PartialType(BaseDto) { @IsInt() extra!: number; }
type Alias = BaseDto;
type Alias2 = (BaseDto);
const S = z.object({ limit: z.number(), nested: z.object({ deep: z.int() }), b: z.coerce.boolean(), lit: z.literal(5), big: z.literal(5n) });
class ZDto extends createZodDto(S) {}
@Controller('x')
export class C {
  @Get() a(@Query() q: Picked, @Param() p: Picked) { return q; }
  @Get() b(@Query() q: Omitted, @Headers() h: Both) { return q; }
  @Get() c(@Query() q: Partial2, @Query() r: Alias, @Query() s: Alias2) {}
  @Get() d(@Query() q: ZDto, @Query('x', new ZodValidationPipe(z.number())) x: number, @Query('y', (new ZodValidationPipe(z.number()))) y: number) {}
  @Get() e(@Query('b') b: number | undefined, @Query('c') c: number[], @Query('d') d: (number), @Query('e') e: number | null, @Query('f') f: 1 | 2, @Query('g') g: -1, @Query('h') h: true | false, @Query('i') i: Date, @Query('j') j: bigint, @Query('k', DefaultValuePipe) k: number, @Query('l', ParseIntPipe) l: number, @Query('a') a?: number) {}
  @Post() @UseInterceptors(FileInterceptor('f')) f(@Body() body: { n: number; s: string; b?: boolean; [k: string]: any }, @Body('count') count: number) {}
  @Get() g(@Query(('quoted')) q: number, @Query(`tpl`) t: number) {}
  @Get() h(@Query() { page }: BaseDto, @Query('z') z2: number = 1, @Query() ...rest: number[]) {}
  constructor(@Query('ctor') private readonly n: number) {}
  @Get() j(@Query('over') v: number) {}
  get k() { return 1; }
}
