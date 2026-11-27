//! IC_SUPERCLASS_USES_SUBCLASS_DURING_INITIALIZATION, measured on test code: the static initializer of a class or
//! interface reads or writes a static field, or calls a static method, through the name of one of its subtypes
//! (the class javac writes into the instruction, not where the member is declared). `new` does not count, nor a
//! constant javac copies in, nor code in lambdas or other methods. A read is priority 1 when the subtype's class
//! file is public, else 2; a write or a call one more, which `-medium` hides at 3. One finding per subtype, with the
//! best priority, on the first line that has it.
use super::super::attributes::compiled_public;
use super::super::{Context, fields::field_key, names};
use super::super::idioms::Compiled;
use crate::engine::source::parent;
use crate::java::types::expr::Receiver;
use crate::java::types::model::Type;
use std::collections::BTreeMap;
use tree_sitter::Node;

pub const PATTERN: &str = "IC_SUPERCLASS_USES_SUBCLASS_DURING_INITIALIZATION";

/// The class a qualified member access names, when the qualifier is a type or a value of a class type.
fn qualifier(context: &Context, object: Node) -> Option<String> {
    if matches!(object.kind(), "this" | "super") {
        return None;
    }
    match context.resolver.receiver(object)? {
        Receiver::Static(class) => Some(class.to_string()),
        Receiver::Value(Type::Class(class, _)) => Some(class.to_string()),
        Receiver::Value(_) => None,
    }
}

/// Whether a field use stores into it with a plain `=`.
fn stores(usage: Node) -> bool {
    parent(usage).is_some_and(|above| {
        above.kind() == "assignment_expression"
            && above.child_by_field_name("left").is_some_and(|left| left.id() == usage.id())
            && above.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "=")
    })
}

/// The subtype an instruction names and whether it only writes or calls (`true`) rather than reads.
fn access(context: &Context, node: Node) -> Option<(String, bool)> {
    match node.kind() {
        "field_access" => {
            let class = qualifier(context, node.child_by_field_name("object")?)?;
            let (declaring, name) = field_key(context, node)?;
            let index = context.resolver.index;
            let (_, field) = index.field(&declaring, &name)?;
            let is_static = field.flags & crate::java::types::model::flag::STATIC != 0;
            if !is_static || index.constant_field(&declaring, &name, &|_| false, true, 0) {
                return None;
            }
            Some((class, stores(node)))
        }
        "method_invocation" => {
            let class = qualifier(context, node.child_by_field_name("object")?)?;
            let call = context.resolver.resolve_call(node)?;
            call.method.is_static.then_some((class, true))
        }
        _ => None,
    }
}

fn line(context: &Context, node: Node, call: bool) -> usize {
    if call {
        return node.child_by_field_name("arguments").map_or_else(|| context.line(node), |arguments| context.line(arguments));
    }
    super::super::attributes::line_of(context, node, stores(node))
}

pub fn check(context: &Context, own: &str, methods: &[Compiled]) {
    let Some(initializer) = methods.iter().find(|method| method.label.contains(".<static initializer for ")) else { return };
    let index = context.resolver.index;
    let mut found: BTreeMap<String, (u8, usize, usize)> = BTreeMap::new();
    for node in &initializer.nodes {
        let Some((class, indirect)) = access(context, *node) else { continue };
        if class == own || !index.is_subtype(&class, own) {
            continue;
        }
        let Some(info) = index.get(&class) else { continue };
        let priority = if compiled_public(index, info) { 1 } else { 2 } + u8::from(indirect);
        if priority > 2 {
            continue;
        }
        let at = super::runs_at(*node);
        let line = line(context, *node, node.kind() == "method_invocation");
        let entry = found.entry(class).or_insert((priority, at.0, line));
        if priority < entry.0 || (priority == entry.0 && at.0 < entry.1) {
            *entry = (priority, at.0, line);
        }
    }
    let binary = names::binary(context, own);
    for (class, (priority, _, line)) in found {
        let shown = names::binary(context, &class);
        let message = format!("Initialization of {binary} accesses class {shown}, which isn't initialized yet");
        let place = super::super::place::function(&initializer.label);
        context.report_listed(PATTERN, initializer.member, line, message, place, priority, vec![binary.clone(), shown]);
    }
}
