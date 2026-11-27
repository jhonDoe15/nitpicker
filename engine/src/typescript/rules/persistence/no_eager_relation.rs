//! `no-eager-relation`: relations mapped to load on every query (TypeORM and MikroORM `eager`, an include in a
//! Sequelize default scope).
use super::orm_bindings::Orm;
use super::relations::relations_at;
use super::sequelize_scopes::{default_scope_of, eager_include};
use crate::typescript::rules::Context;

const RULE: &str = "no-eager-relation";
const EXCEPTION: &str = "An exception fits only for a small lookup relation that every read needs.";
const TYPEORM_EAGER: &str = "eager: true makes TypeORM load this relation with every find of the entity, whether the caller needs it or not. Leave it out and load the relation on the queries that need it: relations: { customer: true } in that find, or leftJoinAndSelect in a query builder.";
const MIKRO_ORM_EAGER: &str = "eager makes MikroORM populate this relation on every load of the entity, whether the caller needs it or not. Leave it out and populate the relation on the queries that need it: em.find(Order, where, { populate: ['customer'] }).";
const SEQUELIZE_DEFAULT_SCOPE: &str = "An include in the defaultScope joins these associations into every query of the model, whether the caller needs them or not. Put the include in a named scope (Order.scope('withCustomer')) or pass include on the queries that need it.";

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let program = view.program();
    let mut reported: Vec<(u32, u32, u32, &str)> = Vec::new();
    let mut report = |node: crate::typescript::rules::support::view::Node, message: &'static str| {
        if !reported.iter().any(|(index, ..)| *index == node.index) {
            reported.push((node.index, node.start(), node.end(), message));
        }
    };
    for node in view.nodes() {
        let kind = node.kind();
        if kind == "CallExpression" || kind == "NewExpression" {
            for relation in relations_at(scopes, program, node) {
                if let Some(eager) = relation.eager {
                    report(eager, if relation.orm == Orm::MikroOrm { MIKRO_ORM_EAGER } else { TYPEORM_EAGER });
                }
            }
        }
        if kind == "CallExpression" || kind == "Property" {
            let scope = default_scope_of(scopes, program, node);
            if let Some(include) = scope.and_then(|scope| eager_include(scopes, Some(scope))) {
                report(include, SEQUELIZE_DEFAULT_SCOPE);
            }
        }
    }
    for (_, start, end, message) in reported {
        context.report_range(RULE, start, Some(end), format!("{message} {EXCEPTION}"));
    }
}
