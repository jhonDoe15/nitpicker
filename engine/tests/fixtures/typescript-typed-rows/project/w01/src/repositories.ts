import { Repository } from 'typeorm';
import { Order } from './store';
export class Inheriting extends Repository<Order> {}
export class Overriding extends Repository<Order> {
  findOneBy(where: object): Promise<Order | null> { return super.findOneBy(where); }
}
