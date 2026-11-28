//! `written-values.mts`: the ORM write, inside the transaction body, that a value stored in a map comes from,
//! through the variables it is built from.
use crate::typescript::rules::orm_sites::{OrmKind, orm_site};
use crate::typescript::rules::security_values::defs;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use std::collections::HashSet;

const ORMS: [&str; 7] = ["prisma", "typeorm", "kysely", "knex", "drizzle", "sequelize", "mikro"];
const MAX_DEPTH: usize = 3;

fn init_of<'v>(scopes: &Scopes<'_, 'v>, identifier: Node<'v>) -> Option<Node<'v>> {
    let definition = defs(scopes, identifier).into_iter().next()?;
    if !definition.node.is("VariableDeclarator") {
        return None;
    }
    let init = definition.node.node("init")?;
    if init.is("AwaitExpression") { init.node("argument") } else { Some(init) }
}

/// The identifiers under a node, breadth first in the order of each node's fields.
fn identifiers_in(node: Node) -> Vec<Node> {
    let mut pending = vec![node];
    let mut at = 0;
    while let Some(current) = pending.get(at).copied() {
        pending.extend(current.children());
        at += 1;
    }
    pending.retain(|each| each.is("Identifier"));
    pending
}

fn is_write(init: Node) -> bool {
    let orms: Vec<String> = ORMS.iter().map(|orm| orm.to_string()).collect();
    init.is("CallExpression") && orm_site(init, OrmKind::Write, &orms).is_some()
}

/// `writtenValue`.
pub fn written_value<'v>(scopes: &Scopes<'_, 'v>, args: &[Node<'v>], body: Node<'v>) -> Option<Node<'v>> {
    let mut pending: Vec<Node> = args.iter().flat_map(|argument| identifiers_in(*argument)).collect();
    let mut seen = HashSet::new();
    let mut index = 0;
    while let Some(identifier) = pending.get(index).copied() {
        let key = identifier.index;
        let init = if seen.contains(&key) { None } else { init_of(scopes, identifier) };
        seen.insert(key);
        if let Some(init) = init.filter(|init| body.contains(*init)) {
            if is_write(init) {
                return Some(init);
            }
            if index < MAX_DEPTH * args.len() {
                pending.extend(identifiers_in(init));
            }
        }
        index += 1;
    }
    None
}
