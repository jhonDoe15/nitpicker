//! The code javac writes for a try-with-resources: each resource is stored, then its own `try` holds the rest; after
//! a normal end the resource is closed (checked for `null` unless it was just created), and its handler closes it,
//! adds what the close threw as suppressed and throws again.
use super::size::Size;
use super::super::Context;
use super::super::methods::notify::ends::completes;
use crate::engine::source::{children, named_children};
use tree_sitter::Node;

pub fn of(tried: Node) -> Vec<Node> {
    tried.child_by_field_name("resources").map(|list| children(list).into_iter().filter(|part| part.kind() == "resource").collect()).unwrap_or_default()
}

fn ends(context: &Context, node: Node) -> bool {
    match node.kind() {
        "block" => named_children(node).into_iter().rfind(|part| !part.kind().ends_with("comment")).is_some_and(|last| ends(context, last)),
        "try_with_resources_statement" if !children(node).iter().any(|part| matches!(part.kind(), "catch_clause" | "finally_clause")) => {
            node.child_by_field_name("body").is_some_and(|body| ends(context, body))
        }
        _ => !completes(context, node),
    }
}

impl<'t> Size<'_, '_, 't> {
    pub(super) fn guarded(&mut self, resources: &[Node<'t>], body: Node<'t>) {
        let Some((first, rest)) = resources.split_first() else {
            self.statement(body);
            return;
        };
        let value = first.child_by_field_name("value").map_or_else(|| first.named_child(0).map_or(0, |named| self.value(named)), |value| self.value(value));
        let slot = self.slots.slot(*first).unwrap_or(4);
        let load = Self::slot_bytes(slot);
        let kind = super::thrown::resource_type(self.context, *first);
        let interface = kind.is_some_and(|kind| self.context.resolver.index.get(&kind.erased().name()).is_some_and(|info| info.is_interface));
        let created = first.child_by_field_name("value").is_some_and(|value| value.kind() == "object_creation_expression");
        let close = load + if interface { 5 } else { 3 } + if created { 0 } else { load + 3 };
        self.add(value + load);
        self.closes += close;
        self.guarded(rest, body);
        self.closes -= close;
        if !ends(self.context, body) {
            self.add(close + 3);
        }
        let (thrown, suppressed) = (Self::slot_bytes(slot + 1), Self::slot_bytes(slot + 2));
        self.add(thrown + close + 3 + suppressed + thrown + suppressed + 3 + thrown + 1);
    }

    pub(super) fn try_clauses(&mut self, node: Node<'t>) {
        let clauses: Vec<Node> = children(node).into_iter().filter(|part| matches!(part.kind(), "catch_clause" | "finally_clause")).collect();
        if clauses.is_empty() {
            return;
        }
        self.add(3);
        for clause in clauses {
            self.add(2);
            if let Some(body) = clause.child_by_field_name("body").or_else(|| clause.named_child(0)) {
                self.statement(body);
            }
        }
    }
}
