import * as orm from 'typeorm';
class Order { @orm.ManyToOne(() => Customer, { eager: true }) customer: Customer; }