import { Controller, Get } from '@nestjs/common';
import { Entity } from 'typeorm';
@Entity() export class E { x = 1; }
@Controller()
export class C { @Get() '{{entity}} {{orm}}'(): E { return new E(); } }
