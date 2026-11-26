import { Controller, Get } from '@nestjs/common';
import { Entity } from 'typeorm';
@Entity() export class Ａ { x = 1; }
@Entity() export class 𠮷 { x = 1; }
@Controller()
export class C { @Get() all(): Ａ | 𠮷 { return null as never; } }
