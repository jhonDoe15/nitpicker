//! `no-in-memory-query`: an awaited list query whose rows are loaded only to count, filter, sort or aggregate them
//! in memory. The count suggestion stays with the ESLint rule.
use super::locked_reads::is_locked_read;
use super::query_calls::{QueryScope, is_query_result};
use super::result_uses::{Shape, result_site, use_of};
use crate::typescript::rules::Context;
use crate::typescript::rules::database::modules::ModuleScope;
use crate::typescript::rules::security_values::unwrapped;

const RULE: &str = "no-in-memory-query";
const EXCEPTION: &str = "An exception fits only for a small fixed lookup list that is meant to be loaded whole.";

fn message(shape: Shape) -> String {
    let text = match shape {
        Shape::Count => "These rows are loaded only to count them or to check that there are none. Ask the database instead: count (TypeORM, Prisma, Sequelize, MikroORM), exists or existsBy (TypeORM), findFirst (Prisma), or select({ value: count() }) in Drizzle.",
        Shape::Filter => "These rows are loaded and then filtered on their columns in memory. Put the condition in the query: where (TypeORM, Prisma, Sequelize), the filter argument of MikroORM find, or .where() in Drizzle; for some, every or find, an exists, count or findFirst query.",
        Shape::Sort => "These rows are sorted in memory by their columns. Sort in the query: order (TypeORM, Sequelize), orderBy (Prisma, MikroORM), or .orderBy() in Drizzle.",
        Shape::Aggregate => "These rows are loaded only to sum, find the largest or smallest, or group them in memory. Let the database aggregate: sum, maximum or minimum (TypeORM), aggregate or groupBy (Prisma), sum, max, min or group (Sequelize), a query builder with groupBy (MikroORM), or sum(), max() and groupBy() in Drizzle.",
    };
    format!("{text} {EXCEPTION}")
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let module = ModuleScope::of(view, scopes, context.file.text);
    let scope = QueryScope::of(&module);
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("AwaitExpression")) {
        let Some(query) = node.node("argument").map(unwrapped).filter(|call| call.is("CallExpression")) else { continue };
        if is_locked_read(query) || !is_query_result(&scope, node) {
            continue;
        }
        let Some(site) = result_site(scopes, node) else { continue };
        if let Some(found_use) = use_of(scopes, site) {
            found.push((found_use.node.start(), found_use.node.end(), message(found_use.shape)));
        }
    }
    for (start, end, text) in found {
        context.report_range(RULE, start, Some(end), text);
    }
}
