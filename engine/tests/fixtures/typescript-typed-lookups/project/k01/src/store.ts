import { Repository } from 'typeorm';
export class Owner { id = ""; }
export class OwnerService {
  constructor(private readonly ownerRepository: Repository<Owner>) {}
  async ownerOf(id: string) { return this.ownerRepository.findOneBy({ id }); }
  label(id: string) { return `owner ${id}`; }
}
