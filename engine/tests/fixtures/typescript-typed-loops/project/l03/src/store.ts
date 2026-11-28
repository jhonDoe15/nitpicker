import { Entity, Column, ManyToOne, OneToMany, OneToOne, ManyToMany } from 'typeorm';
import * as orm from 'typeorm';
import { ManyToOne as Rel } from 'typeorm';
function Fake(_t: () => Function, _o?: object): PropertyDecorator { return () => undefined; }
@Entity()
export class Customer {
  @Column() name = "";
  @ManyToOne(() => Customer, { lazy: true }) parent!: Promise<Customer>;
}
@Entity()
export class Order {
  @Column() total = 0;
  @ManyToOne(() => Customer, { lazy: true }) customer!: Promise<Customer>;
  @ManyToOne(() => Customer) buyer!: Customer;
  @OneToMany(() => Customer, (customer: Customer) => customer) lines!: Promise<Customer[]>;
  @OneToOne(() => Customer, { 'lazy': true }) quoted!: Promise<Customer>;
  @OneToOne(() => Customer, { lazy: false }) notLazy!: Customer;
  @ManyToMany(() => Customer, { eager: true, lazy: true }) tags!: Promise<Customer[]>;
  @Fake(() => Customer, { lazy: true }) fake!: Promise<Customer>;
  @orm.ManyToOne(() => Customer, { lazy: true }) dotted!: Promise<Customer>;
  @Rel(() => Customer, { lazy: true }) renamed!: Promise<Customer>;
  @ManyToOne(() => Customer) promised!: globalThis.Promise<Customer>;
  @ManyToOne(() => Customer) plainPromise!: Promise<Customer>;
  @ManyToOne(() => Customer) @Column() stacked!: Promise<Customer>;
  @Column() @ManyToOne(() => Customer, { lazy: true }) second!: Promise<Customer>;
  @ManyToOne(() => Customer) __under!: Promise<Customer>;
  lazyMethod(): Promise<Customer> { return Promise.resolve(new Customer()); }
}
export class Plain { customer!: Promise<Customer>; payer!: Promise<object>; }
export type Alias = { payer: Promise<object>; carrier: Promise<object> };
export const Expr = class Named { @ManyToOne(() => Customer, { lazy: true }) rel!: Promise<Customer>; };
