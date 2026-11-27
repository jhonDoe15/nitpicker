import { from, of, defer, mergeMap, concatMap, switchMap, flatMap, bufferCount, toArray, map, take, tap, filter } from "rxjs";
import { Repository } from "typeorm";
import { Owner, OwnerService } from "./store";
declare const owners: Repository<Owner>;
declare const service: OwnerService;
declare const ids: string[];
from(ids).pipe(bufferCount(50), mergeMap((batch) => owners.findBy({ id: batch })));