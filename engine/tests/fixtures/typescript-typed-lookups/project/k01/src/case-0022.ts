import { from, of, defer, mergeMap, concatMap, switchMap, flatMap, bufferCount, toArray, map, take, tap, filter } from "rxjs";
import { Repository } from "typeorm";
import { Owner, OwnerService } from "./store";
declare const owners: Repository<Owner>;
declare const service: OwnerService;
declare const ids: string[];
const lookup = (id: string) => from(service.ownerOf(id)); from(ids).pipe(concatMap(lookup));