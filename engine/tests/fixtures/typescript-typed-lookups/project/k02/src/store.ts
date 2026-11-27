import { Repository } from 'typeorm';
import axios from 'axios';
export class Owner { id = ""; }
export class OwnerService {
  constructor(private readonly ownerRepository: Repository<Owner>) {}
  async ownerOf(id: string) { return this.ownerRepository.findOneBy({ id }); }
  async remote(id: string) { return axios.get(id); }
  label(id: string) { return `owner ${id}`; }
}
export const limitLocal = (n: number) => n;
export function chunk<T>(items: T[], size: number): T[][] { return [items.slice(0, size)]; }
