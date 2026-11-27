import { Entity, Column, ManyToOne, OneToMany } from 'typeorm';
@Entity()
export class Customer {
  @Column() name = "";
}
@Entity()
export class Order {
  @Column() total = 0;
  @ManyToOne(() => Customer, { lazy: true }) customer!: Promise<Customer>;
  @ManyToOne(() => Customer) buyer!: Customer;
  @OneToMany(() => Customer, (customer: Customer) => customer) lines!: Promise<Customer[]>;
}
