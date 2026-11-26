//! `no-whole-rows-for-one-value`: loading whole rows only to read one column of them, or only to test whether a
//! row exists.
use super::column_uses::{ColumnUse, Uses};
use crate::typescript::rules::Context;
use crate::typescript::rules::contracts::infrastructure::interpolate;
use crate::typescript::rules::query_rows::calls::query_scope;
use crate::typescript::rules::query_rows::writes::Rows;

const RULE: &str = "no-whole-rows-for-one-value";
const COLUMN: &str = "These rows are loaded only to read their `{{field}}` column. Select the column in the query: select: { {{field}}: true } (TypeORM, Prisma), attributes (Sequelize), fields (MikroORM), or db.select({ {{field}}: table.{{field}} }) (Drizzle). An exception fits only when the rows are used elsewhere too or the model has no cheaper query.";
const EXISTENCE: &str = "This loads or counts rows only to test whether one exists. Ask the database for existence: exists or existsBy (TypeORM), findFirst({ where, select: { id: true } }) (Prisma), findOne with attributes: ['id'] (Sequelize), findOne with fields (MikroORM). An exception fits only when the rows are used elsewhere too or the model has no cheaper query.";

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    if types.borrow().refused.is_some() {
        return;
    }
    let uses = Uses { rows: Rows { scopes, source: context.file.text }, scope: query_scope(view.program()), types };
    let mut found: Vec<ColumnUse> = Vec::new();
    for node in view.nodes().filter(|node| node.is("AwaitExpression")) {
        found.extend(uses.column_use(node).or_else(|| uses.existence_use(node)));
        if types.borrow().refused.is_some() {
            return;
        }
    }
    for each in found {
        let message = match &each.field {
            Some(field) => interpolate(COLUMN, &[("field", field)]),
            None => EXISTENCE.to_string(),
        };
        context.report_range(RULE, each.node.start(), Some(each.node.end()), message);
    }
}
