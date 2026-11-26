//! Patterns about fields other code can reach: PA_PUBLIC_PRIMITIVE_ATTRIBUTE (a public field the class itself
//! sets outside its constructors), MS_SHOULD_BE_FINAL and MS_PKGPROTECT (a public or protected static field that
//! code could change), and SS_SHOULD_BE_STATIC (a final instance field set to a constant). The first three hang on
//! what every class of the run stores into and reads from the field, so each file notes that and the run decides.
mod constants;
mod settle;
mod writes;

pub use constants::should_be_static;
pub use settle::Attributes;
pub use writes::line as line_of;

use super::Context;
use super::fields::field_key;
use crate::engine::source::{parent, walk};
use crate::java::helpers::has_modifier;
use std::collections::HashSet;
use tree_sitter::Node;
use writes::{Order, Phase};

pub const PATTERNS: &[&str] = &["PA_PUBLIC_PRIMITIVE_ATTRIBUTE", "MS_SHOULD_BE_FINAL", "MS_PKGPROTECT"];

/// One load or store of a field of the run.
pub struct Write {
    pub store: bool,
    /// The package of the class that makes it.
    pub package: String,
    pub key: (String, String),
    pub by: String,
    pub order: Order,
    pub file: String,
    pub line: usize,
    /// The stored value is an array with no elements.
    pub empty: bool,
    /// The store sits in a method named `init` or `initialize`, which SpotBugs takes for part of construction.
    pub setup: bool,
}

/// What one file tells about the fields of the run.
#[derive(Default)]
pub struct Notes {
    pub writes: Vec<Write>,
    /// Fields declared in the file, with the file and the patterns a `@SuppressFBWarnings` around them turns off.
    pub quiet: Vec<((String, String), (String, Vec<&'static str>))>,
}

fn quiet(context: &Context, declaration: Node) -> Vec<&'static str> {
    PATTERNS.iter().copied().filter(|pattern| !context.wants(&[pattern]) || context.suppressed(pattern, declaration)).collect()
}

/// Whether a use of a field reads it: anything but the left side of a plain `=`.
fn reads(usage: Node) -> bool {
    let Some(above) = parent(usage) else { return true };
    let plain = above.kind() == "assignment_expression"
        && above.child_by_field_name("left").is_some_and(|left| left.id() == usage.id())
        && above.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "=");
    !plain
}

/// Whether a name stands for a value the code loads, not for a declaration, a label, a method or a type.
fn used_name(usage: Node) -> bool {
    if usage.kind() != "identifier" {
        return usage.kind() == "field_access";
    }
    let Some(above) = parent(usage) else { return true };
    let is = |field: &str| above.child_by_field_name(field).is_some_and(|part| part.id() == usage.id());
    match above.kind() {
        "field_access" | "method_invocation" => is("object"),
        "variable_declarator" => is("value"),
        "lambda_expression" => is("body"),
        "element_value_pair" => is("value"),
        "method_reference" => above.named_child(0).is_some_and(|first| first.id() == usage.id()),
        "scoped_identifier" | "labeled_statement" | "break_statement" | "continue_statement" | "inferred_parameters" | "formal_parameter"
        | "catch_formal_parameter" | "enum_constant" | "resource" => false,
        _ => true,
    }
}

/// The loads, stores and field declarations of the file. `names` names the fields whose loads count.
pub fn gather(context: &Context, names: &HashSet<String>) -> Notes {
    let mut notes = Notes::default();
    if !context.wants(PATTERNS) {
        return notes;
    }
    let path = context.file.path.clone();
    let access = |notes: &mut Notes, key: (String, String), node: Node, value: Option<Node>, store: bool| {
        let (Some(by), Some(order)) = (writes::writer(context, node), writes::order(node)) else { return };
        let empty = value.is_some_and(|value| writes::empty_array(context, value));
        let setup = writes::setup(context, node);
        let line = writes::line(context, node, store);
        notes.writes.push(Write { store, package: context.resolver.scope.package.clone(), key, by, order, file: path.clone(), line, empty, setup });
    };
    walk(context.file.tree.root_node(), |node| match node.kind() {
        "variable_declarator" => {
            let Some(declaration) = parent(node).filter(|holder| matches!(holder.kind(), "field_declaration" | "constant_declaration")) else { return };
            let (Some(class), Some(name)) = (writes::writer(context, node), node.child_by_field_name("name")) else { return };
            let key = (class, context.text(name).to_string());
            notes.quiet.push((key.clone(), (path.clone(), quiet(context, declaration))));
            let constant = has_modifier(declaration, "final") && context.resolver.index.constant_field(&key.0, &key.1, &|_| false, true, 0);
            if let Some(value) = node.child_by_field_name("value").filter(|_| !constant) {
                access(&mut notes, key, node, Some(value), true);
            }
        }
        "assignment_expression" => {
            let Some(left) = node.child_by_field_name("left") else { return };
            if let Some(key) = field_key(context, left) {
                access(&mut notes, key, node, node.child_by_field_name("right"), true);
            }
        }
        "update_expression" => {
            let operand = crate::engine::source::named_children(node).into_iter().find(|part| !part.kind().ends_with("comment"));
            if let Some(key) = operand.and_then(|operand| field_key(context, crate::java::types::expr::unwrap(operand))) {
                access(&mut notes, key, node, None, true);
            }
        }
        "identifier" | "field_access" => {
            let name = if node.kind() == "identifier" { Some(node) } else { node.child_by_field_name("field") };
            let wanted = name.is_some_and(|name| names.contains(context.text(name)));
            if wanted && used_name(node) && reads(node)
                && let Some(key) = field_key(context, node)
            {
                access(&mut notes, key, node, None, false);
            }
        }
        _ => {}
    });
    notes
}

/// Whether a store sits in the static initializer of the class that declares the field.
pub fn initializes(write: &Write) -> bool {
    write.store && write.order.0 == Phase::StaticInit && write.by == write.key.0
}

/// Whether a store sits in a method of the class that declares the field, not in one of its constructors or its
/// static initializer.
pub fn sets_inside(write: &Write) -> bool {
    let method = write.order.0 == Phase::Lambda || (write.order.0 == Phase::Method && !write.setup);
    write.store && method && write.by == write.key.0
}
