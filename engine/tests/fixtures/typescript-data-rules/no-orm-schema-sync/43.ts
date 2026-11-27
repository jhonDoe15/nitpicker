import { MikroORM } from "@mikro-orm/postgresql"; export async function start(orm) { await orm.getSchemaGenerator().createSchema(); }
