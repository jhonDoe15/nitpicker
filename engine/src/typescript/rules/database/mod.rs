//! `no-orm-schema-sync` and `no-orm-query-logging`: ORM and query-builder options (TypeORM, Sequelize, MikroORM,
//! Knex, Prisma, Drizzle) that change the schema at start-up or log every query.
mod modules;
pub mod no_orm_query_logging;
pub mod no_orm_schema_sync;
mod options;
