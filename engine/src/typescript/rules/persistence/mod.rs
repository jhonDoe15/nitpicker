//! `no-eager-relation` and `no-many-to-many-cascade-remove`: ORM relation mappings (TypeORM, MikroORM, Sequelize)
//! that load or remove more rows than the caller asked for.
pub mod no_eager_relation;
pub mod no_many_to_many_cascade_remove;
mod orm_bindings;
mod relations;
mod sequelize_scopes;
