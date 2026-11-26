import * as orm from 'typeorm';
import { Entity as MEntity } from '@mikro-orm/core';
import { Model } from 'sequelize';
import { Document, type HydratedDocument } from 'mongoose';
import { Controller, Get } from '@nestjs/common';
@orm.Entity() export class A { x = 1; }
@MEntity() export class B { x = 1; }
export class M1 extends Model {}
export class M2 extends M1 {}
export class D1 extends Document {}
export interface Plain { a: string }
export type Doc = HydratedDocument<Plain>;
export type Doc2 = Document<unknown, {}, { a: 1 }>;
export type Doc3 = Document<unknown, {}, D1>;
export type Doc4 = HydratedDocument<D1>;
function Entity(): ClassDecorator { return () => {}; }
@Entity() export class Fake { x = 1; }
@Controller()
export class C {
  @Get() a(): A { return new A(); }
  @Get() b(): B { return new B(); }
  @Get() c(): M2 { return new M2(); }
  @Get() d(): D1 { return new D1(); }
  @Get() e(): Doc { return null as never; }
  @Get() f(): Doc2 { return null as never; }
  @Get() g(): Doc3 { return null as never; }
  @Get() h(): Doc4 { return null as never; }
  @Get() i(): Fake { return new Fake(); }
  @Get() j(): Plain { return null as never; }
}
