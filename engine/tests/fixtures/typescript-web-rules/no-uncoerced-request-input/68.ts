import { Controller, Query } from '@nestjs/common';
class C { list(@Query('d') d: (number)) {} list2(@Query('e') e: number) {} }
