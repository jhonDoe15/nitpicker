import { ManyToOne as Parent } from 'typeorm';
class Order { @Parent(() => Customer, { eager: true }) customer: Customer; }