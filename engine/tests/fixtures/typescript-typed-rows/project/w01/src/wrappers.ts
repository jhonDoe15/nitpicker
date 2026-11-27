import { Order } from './store';
export declare class Wrapper {
  findOne(workspaceId: string, options?: { where?: object }): Promise<Order | null>;
  findOneBy(where: object): Promise<Order | null>;
  count(options?: object): Promise<number>;
}
