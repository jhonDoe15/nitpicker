import { Entity, Column } from 'typeorm';
@Entity() export class Order {
  @Column() status = "";
  @Column() total = 0;
  get label() { return this.status; }
  describe() { return this.status; }
}
