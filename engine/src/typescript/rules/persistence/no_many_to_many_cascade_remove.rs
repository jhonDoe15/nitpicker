//! `no-many-to-many-cascade-remove`: a cascade that removes on a many-to-many relation (TypeORM and MikroORM).
use super::orm_bindings::Orm;
use super::relations::{Cascade, RelationKind, cascade_name, relations_at};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::Scopes;

const RULE: &str = "no-many-to-many-cascade-remove";
const TYPEORM_CASCADE: &str = "A cascade that removes (cascade: true, 'remove' or 'soft-remove') on a many-to-many relation removes the related rows when one owner is removed, although other owners still share them. Cascade only ['insert', 'update']; removing the owner already deletes its join rows (the join table's onDelete: 'CASCADE', the default).";
const MIKRO_ORM_CASCADE: &str = "Cascade.ALL or Cascade.REMOVE on a many-to-many relation removes the related rows when one owner is removed, although other owners still share them. Cascade only [Cascade.PERSIST]; removing the owner already deletes its pivot rows.";

fn removes(scopes: &Scopes, orm: Orm, cascade: &Cascade) -> bool {
    let removing: &[&str] = match orm {
        Orm::TypeOrm => &["true", "remove", "soft-remove"],
        Orm::MikroOrm => &["all", "remove"],
        Orm::Sequelize => return false,
    };
    cascade.values.iter().any(|value| cascade_name(scopes, *value).is_some_and(|name| removing.contains(&name.as_str())))
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let program = view.program();
    let mut reported: Vec<(u32, u32, u32, &str)> = Vec::new();
    for node in view.nodes().filter(|node| node.is("CallExpression") || node.is("NewExpression")) {
        for relation in relations_at(scopes, program, node) {
            let Some(cascade) = relation.cascade.as_ref().filter(|_| relation.kind == RelationKind::ManyToMany) else { continue };
            if reported.iter().any(|(index, ..)| *index == cascade.node.index) || !removes(scopes, relation.orm, cascade) {
                continue;
            }
            reported.push((cascade.node.index, cascade.node.start(), cascade.node.end(), if relation.orm == Orm::MikroOrm { MIKRO_ORM_CASCADE } else { TYPEORM_CASCADE }));
        }
    }
    for (_, start, end, message) in reported {
        context.report_range(RULE, start, Some(end), message.to_string());
    }
}
