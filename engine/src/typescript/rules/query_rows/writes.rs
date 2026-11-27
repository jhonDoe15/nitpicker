//! `writeShape` and `isIdsWrite`: loaded rows that are only changed the same way and saved, removed, or turned into
//! ids for one delete or update of the same table.
use super::assignments::{assigns_only, loop_of, mapped_field};
use super::calls::call_chain;
use super::loaded::{LoadedRows, single_read};
use crate::typescript::rules::held_scopes::estree_calls::calls_within;
use crate::typescript::rules::stale_retries::receivers::{is_repository_like, receiver_names};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::writes::syntax::{member_name, static_key, unwrapped};

pub const UPDATE: &str = "update";
pub const DELETE: &str = "delete";

const SAVES: [&str; 3] = ["save", "persistAndFlush", "bulkCreate"];
const REMOVES: [&str; 3] = ["remove", "softRemove", "removeAndFlush"];
const ID_WRITES: [(&str, &str); 8] = [
    (DELETE, DELETE), ("deleteMany", DELETE), ("destroy", DELETE), ("softDelete", DELETE), ("nativeDelete", DELETE),
    (UPDATE, UPDATE), ("updateMany", UPDATE), ("nativeUpdate", UPDATE),
];
const ID_HELPERS: [&str; 5] = ["In", "inArray", "any", "Any", "anyOf"];
const DRIZZLE_TABLES: [&str; 3] = ["from", DELETE, UPDATE];
const PASS_THROUGH: [&str; 3] = ["Property", "ObjectExpression", "ArrayExpression"];
const MAX_HOPS: usize = 8;

pub struct WriteShape<'v> {
    pub node: Node<'v>,
    pub shape: &'static str,
}

pub struct Rows<'c, 'a, 'v> {
    pub scopes: &'c Scopes<'a, 'v>,
    pub source: &'c str,
}

fn callee_name(call: Node) -> Option<String> {
    let callee = unwrapped(call.node("callee")?);
    if callee.is("MemberExpression") {
        return member_name(callee);
    }
    if callee.is("Identifier") { callee.name().map(|name| name.into_owned()) } else { None }
}

fn receiver_of(call: Node) -> Option<Node> {
    call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression")).and_then(|callee| callee.node("object"))
}

fn receiver_path(call: Node) -> String {
    receiver_of(call).map(|receiver| receiver_names(receiver).join(".")).unwrap_or_default()
}

fn sink_of(read: Node) -> Option<Node> {
    let call = read.parent().filter(|call| call.is("CallExpression"))?;
    let first = call.nodes("arguments").into_iter().next();
    (first == Some(read) && receiver_of(call).is_some()).then_some(call)
}

fn has_update_option(call: Node) -> bool {
    let Some(options) = call.list("arguments").get(1).copied().flatten().map(unwrapped) else { return false };
    options.is("ObjectExpression") && options.nodes("properties").into_iter().any(|property| static_key(property).as_deref() == Some("updateOnDuplicate"))
}

fn is_sink_on(call: Node, query: Node, names: &[&str]) -> bool {
    let sink_names = receiver_names(receiver_of(call).unwrap_or(call));
    let same_receiver = receiver_path(call) == receiver_path(query);
    let Some(method) = callee_name(call) else { return false };
    names.contains(&method.as_str()) && (same_receiver || is_repository_like(&sink_names)) && (method != "bulkCreate" || has_update_option(call))
}

fn chain_names(call: Node) -> Vec<Option<String>> {
    let mut names = Vec::new();
    let mut current = call;
    loop {
        let callee = if current.is("CallExpression") { current.node("callee").map(unwrapped) } else { None };
        let Some(callee) = callee.filter(|callee| callee.is("MemberExpression")) else { break };
        names.push(member_name(callee));
        let Some(object) = callee.node("object") else { break };
        current = unwrapped(object);
    }
    names
}

fn id_write_kind(consumer: Node) -> Option<&'static str> {
    let name = callee_name(consumer);
    if name.as_deref() == Some("where") {
        return chain_names(consumer).into_iter().flatten().find_map(|each| [DELETE, UPDATE].into_iter().find(|kind| *kind == each));
    }
    ID_WRITES.iter().find(|(method, _)| name.as_deref() == Some(*method)).map(|(_, kind)| *kind)
}

impl<'v> Rows<'_, '_, 'v> {
    fn text(&self, node: Node) -> &str {
        &self.source[node.start() as usize..node.end() as usize]
    }

    fn flush_after(&self, query: Node<'v>, lp: Node<'v>, home: Option<Node<'v>>) -> Option<Node<'v>> {
        let (home, receiver) = (home?, receiver_of(query)?);
        let text = self.text(receiver);
        calls_within(home).into_iter().filter(|call| call.is("CallExpression")).find(|call| {
            let callee = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression"));
            call.start() >= lp.end()
                && callee.is_some_and(|callee| member_name(callee).as_deref() == Some("flush") && callee.node("object").is_some_and(|object| self.text(object) == text))
        })
    }

    fn update_shape(&self, rows: &LoadedRows<'v>, query: Node<'v>) -> Option<WriteShape<'v>> {
        let (first, second) = (rows.reads.first().copied(), rows.reads.get(1).copied());
        let looped = first.and_then(loop_of);
        let other = if looped.is_none() { first } else { second };
        let found = looped.or_else(|| second.and_then(loop_of))?;
        if rows.reads.len() > 2 || !assigns_only(found.body, &found.element) {
            return None;
        }
        let Some(other) = other else {
            return self.flush_after(query, found.node, rows.home).map(|flush| WriteShape { node: flush, shape: UPDATE });
        };
        sink_of(other).filter(|sink| is_sink_on(*sink, query, &SAVES)).map(|sink| WriteShape { node: sink, shape: UPDATE })
    }

    fn next_hop(&self, current: Node<'v>) -> (Option<Node<'v>>, Option<Node<'v>>) {
        let Some(parent) = current.parent() else { return (None, None) };
        if PASS_THROUGH.contains(&parent.kind()) {
            return (Some(parent), None);
        }
        if parent.is("CallExpression") && parent.nodes("arguments").contains(&current) {
            let helper = callee_name(parent).is_some_and(|name| ID_HELPERS.contains(&name.as_str()));
            return if helper { (Some(parent), None) } else { (None, Some(parent)) };
        }
        let declared = parent.is("VariableDeclarator") && parent.node("init") == Some(current);
        (if declared { single_read(self.scopes, current) } else { None }, None)
    }

    fn consumer_of(&self, node: Node<'v>) -> Option<Node<'v>> {
        let mut current = node;
        let mut visited = 1;
        loop {
            let (next, found) = self.next_hop(current);
            if found.is_some() || next.is_none() {
                return found;
            }
            if visited >= MAX_HOPS {
                return None;
            }
            visited += 1;
            current = next?;
        }
    }

    fn drizzle_table(&self, call: Node) -> Option<String> {
        let found = call_chain(call).into_iter().find(|each| callee_name(*each).is_some_and(|name| DRIZZLE_TABLES.contains(&name.as_str())))?;
        found.nodes("arguments").into_iter().next().map(|table| self.text(table).to_string())
    }

    fn same_table(&self, query: Node, consumer: Node) -> bool {
        let drizzle = call_chain(query).into_iter().any(|each| callee_name(each).as_deref() == Some("from"));
        if drizzle { self.drizzle_table(query) == self.drizzle_table(consumer) } else { receiver_path(query) == receiver_path(consumer) }
    }

    fn ids_write(&self, mapped: Node<'v>, query: Node<'v>) -> Option<WriteShape<'v>> {
        let consumer = self.consumer_of(mapped)?;
        let shape = id_write_kind(consumer)?;
        self.same_table(query, consumer).then_some(WriteShape { node: consumer, shape })
    }

    pub fn is_ids_write(&self, mapped: Node<'v>, query: Node<'v>) -> bool {
        self.ids_write(mapped, query).is_some()
    }

    pub fn write_shape(&self, rows: &LoadedRows<'v>, query: Node<'v>) -> Option<WriteShape<'v>> {
        if rows.reads.is_empty() {
            return None;
        }
        let single = (rows.reads.len() == 1).then(|| rows.reads[0]);
        let removed = || single.and_then(sink_of).filter(|sink| is_sink_on(*sink, query, &REMOVES)).map(|sink| WriteShape { node: sink, shape: DELETE });
        let ids = || single.and_then(mapped_field).and_then(|mapped| self.ids_write(mapped.call, query));
        self.update_shape(rows, query).or_else(removed).or_else(ids)
    }
}
