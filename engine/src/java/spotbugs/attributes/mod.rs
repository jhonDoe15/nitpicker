//! Patterns about fields other code can reach: PA_PUBLIC_PRIMITIVE_ATTRIBUTE (a public field the class itself
//! sets outside its constructors), MS_SHOULD_BE_FINAL and MS_PKGPROTECT (a public or protected static field that
//! code could change), and SS_SHOULD_BE_STATIC (a final instance field set to a constant). The first three hang on
//! what every class of the run stores into and reads from the field, so each file notes that and the run decides.
mod constants;
mod dropped;
mod settle;
mod unread;
mod writes;

pub use constants::should_be_static;
pub use settle::{Attributes, compiled_public};
pub use writes::line as line_of;

use super::Context;
use super::fields::field_key;
use crate::engine::source::{parent, walk};
use crate::java::helpers::has_modifier;
use std::collections::HashSet;
use tree_sitter::Node;
use writes::Order;
pub(super) use writes::Phase;

pub const PATTERNS: &[&str] = &["PA_PUBLIC_PRIMITIVE_ATTRIBUTE", "MS_SHOULD_BE_FINAL", "MS_PKGPROTECT", unread::UNREAD, unread::UNREAD_OPEN];

#[derive(Clone)]
/// One load or store of a field of the run.
pub struct Write {
    pub store: bool,
    /// The package of the class that makes it.
    pub package: String,
    pub key: (String, String),
    pub by: String,
    pub order: Order,
    /// Where the access sits in the class file: lambdas last, then by method, initializers in the first constructor
    /// that runs them.
    pub code: writes::Code,
    /// A load that only copies the field into itself on the same object, `this.f = this.f`.
    pub copy: bool,
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
    PATTERNS.iter().copied().filter(|pattern| !context.wants(&[pattern]) || context.suppressed(pattern, declaration) || context.suppressed_by_methods(pattern, declaration)).collect()
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
        | "catch_formal_parameter" | "enum_constant" | "resource" | "type_pattern" | "record_pattern_component" | "receiver_parameter"
        | "spread_parameter" => false,
        _ => !is("name"),
    }
}

/// The loads, stores and field declarations of the file. `names` names the fields whose loads count.
pub fn gather(context: &Context, names: &HashSet<String>) -> Notes {
    let mut notes = Notes::default();
    if !context.wants(PATTERNS) {
        return notes;
    }
    let path = context.file.path.clone();
    let known = std::cell::RefCell::new(writes::Constructors::new());
    let seen = std::cell::RefCell::new(std::collections::HashMap::new());
    let access = |notes: &mut Notes, key: (String, String), node: Node, value: Option<Node>, store: bool| {
        let (Some(by), Some(mut order)) = (writes::writer(context, node), writes::order(node, &mut known.borrow_mut())) else { return };
        if node.kind() == "variable_declarator" && order.0 == Phase::Construct && made_static(context, &key) {
            order = (Phase::StaticInit, 0, 0, order.3);
        }
        let empty = value.is_some_and(|value| writes::empty_array(context, value));
        let setup = writes::setup(context, node);
        let line = writes::line(context, node, store);
        let code = writes::code(node, &mut known.borrow_mut());
        let copy = !store && writes::copies_itself(context, node);
        notes.writes.push(Write { store, package: context.resolver.scope.package.clone(), key, by, order, code, copy, file: path.clone(), line, empty, setup });
    };
    walk(context.file.tree.root_node(), |node| match node.kind() {
        "variable_declarator" => {
            let Some(declaration) = parent(node).filter(|holder| matches!(holder.kind(), "field_declaration" | "constant_declaration")) else { return };
            let (Some(class), Some(name)) = (writes::writer(context, node), node.child_by_field_name("name")) else { return };
            let key = (class, context.text(name).to_string());
            let mut off = quiet(context, declaration);
            if !has_modifier(declaration, "static") && super::lombok::reads_field(context, declaration) {
                off.extend([unread::UNREAD, unread::UNREAD_OPEN]);
            }
            notes.quiet.push((key.clone(), (path.clone(), off)));
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
            if wanted && used_name(node) && reads(node) && !dropped::dropped(context, node, &mut seen.borrow_mut())
                && let Some(key) = field_key(context, node)
            {
                access(&mut notes, key, node, None, false);
            }
        }
        _ => {}
    });
    written_accesses(context, names, &mut notes);
    notes
}

/// A field the source declares without `static` that the class file has static: `@UtilityClass` makes it so.
fn made_static(context: &Context, key: &(String, String)) -> bool {
    let written = super::lombok::compiled(context, &key.0).and_then(|class| class.field(&key.1));
    written.is_some_and(|field| field.access & crate::java::types::compiled::ACC_STATIC != 0)
}

/// The loads and stores of the methods Lombok wrote, from the class files: SpotBugs meets them after the
/// hand-written members of the same kind. A constructor Lombok wrote also runs the field initializers, which the
/// source already gives: only the code on the constructor's own line counts.
fn written_accesses(context: &Context, names: &HashSet<String>, notes: &mut Notes) {
    let path = &context.file.path;
    let mut classes: Vec<&String> = context.classes.keys().collect();
    classes.sort();
    for class in classes {
        let Some(node) = context.classes.get(class) else { continue };
        let declared = node.child_by_field_name("body").map_or(0, |body| {
            super::place::members(body).iter().filter(|member| member.kind().ends_with("constructor_declaration")).count()
        });
        let mut made = 0;
        for (place, method) in super::lombok::written(context, class).enumerate() {
            let order = |at: usize| match method.name.as_str() {
                "<init>" => (Phase::Construct, declared + made, 1, at),
                "<clinit>" => (Phase::StaticInit, 0, 1, at),
                _ => (Phase::Method, 0, 1, usize::MAX / 2 + place * 65_536 + at),
            };
            for (at, access) in method.accesses.iter().enumerate() {
                let own_line = method.name != "<init>" || Some(access.line) == method.entry_line;
                let Some(owner) = context.project.binaries.get(&access.owner).filter(|_| own_line) else { continue };
                if !access.store && !names.contains(&access.name) {
                    continue;
                }
                let key = (owner.clone(), access.name.clone());
                let package = context.resolver.scope.package.clone();
                notes.writes.push(Write { store: access.store, package, key, by: class.clone(), order: order(at), code: (false, usize::MAX - 1, 1, place * 65_536 + at), copy: false, file: path.clone(), line: access.line, empty: false, setup: false });
            }
            made += usize::from(method.name == "<init>");
        }
    }
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
