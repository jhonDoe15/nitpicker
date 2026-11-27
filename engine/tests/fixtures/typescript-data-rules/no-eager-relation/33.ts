import { ManyToOne } from '@mikro-orm/decorators/legacy';
class Order { @ManyToOne(() => Customer, { eager: true }) customer!: Customer; }