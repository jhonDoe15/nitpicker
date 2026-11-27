//! SpotBugs' FindDeadLocalStores rebuilt on the engine's flow graph from the documented meaning of its patterns
//! and from what SpotBugs 4.9.8 reports on test code: DLS_DEAD_LOCAL_STORE, DLS_DEAD_LOCAL_STORE_SHADOWS_FIELD,
//! DLS_DEAD_LOCAL_STORE_OF_NULL, DLS_DEAD_STORE_OF_CLASS_LITERAL, DLS_DEAD_LOCAL_INCREMENT_IN_RETURN and
//! IP_PARAMETER_IS_DEAD_BUT_OVERWRITTEN.
//!
//! What the experiments show, and what this follows:
//! - A store is dead when no way from it reads the variable before the method ends or stores to it again. The ways
//!   include those into exception handlers: from a call to the handlers of unchecked exceptions and of what it
//!   declares, from an instruction that throws by itself (a division of whole numbers, an array access, a cast,
//!   `new`, a field of another object) to the handlers of runtime exceptions. What a lambda or a class inside the
//!   method reads counts as read where it is made; their own bodies are not looked at. Where the method can never
//!   end, nothing is read or stored later.
//! - Not reported on the line where the handler of a `finally` or `synchronized` block starts, when code of
//!   another line follows it.
//! - Not reported: constants (but `long` and `double` ones other than 0 and 1 when the slot takes other stores
//!   too), the exception of a handler and copies of it, and stores of `null` (but to a parameter whose value is
//!   never read). The names do not matter.
//! - The priority starts at medium, high for a parameter and for a variable named as an instance field of the
//!   method's own class (SHADOWS_FIELD), and always high for a parameter whose value is never read. A new object
//!   raises it one step; it drops one step for a read of an object's field, a copy of a variable holding a
//!   number other than `long` or `double` or a string, a store another store to the same slot can follow, a slot
//!   with four stores or more, and a dead `++` on a slot that has two or more.
//! - Variables and slots are those of javac: a variable takes the slot freed by one whose block has ended, and
//!   `for` over an array or collection, `switch` on strings or patterns, `try` with resources and `synchronized`
//!   take hidden slots.
//! - Findings of one method with the same pattern, name and priority make one, on the first line; for SHADOWS_FIELD
//!   the priorities merge too, on the line of the best. A variable the compiled code's table of names does not
//!   cover right after the store is named `$L` and its slot.
pub mod flow;
mod report;
mod slots;
mod value;
mod walk;

use super::{Context, names};
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::has_modifier;
use crate::java::flow::cfg::{self, Cfg, Exit};
use crate::java::types::model::flag;
use std::collections::HashSet;
use tree_sitter::Node;

fn body_of(class: Node) -> Option<Node> {
    class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"))
}

fn members(class: Node) -> Vec<Node> {
    let Some(body) = body_of(class) else { return Vec::new() };
    let mut found = children(body);
    found.extend(children(body).into_iter().filter(|part| part.kind() == "enum_body_declarations").flat_map(children));
    found
}

fn parameters(list: Option<Node>) -> Vec<Node> {
    list.map(named_children).unwrap_or_default().into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter")).collect()
}

/// Whether a class gets the object around it as a hidden first parameter of its constructors.
fn inner(class: Node) -> bool {
    if class.kind() != "class_declaration" || has_modifier(class, "static") {
        return false;
    }
    let Some(holder) = parent(class) else { return false };
    match holder.kind() {
        "class_body" => parent(holder).is_some_and(|outer| matches!(outer.kind(), "class_declaration" | "enum_declaration" | "record_declaration" | "object_creation_expression" | "enum_constant")),
        "block" | "constructor_body" => {
            let method = crate::engine::source::ancestor(class, &["method_declaration", "constructor_declaration", "static_initializer", "lambda_expression"]);
            method.is_some_and(|method| method.kind() != "static_initializer" && !has_modifier(method, "static"))
        }
        _ => false,
    }
}

pub fn dead_stores<'a>(context: &Context<'a>, class: Node<'a>) {
    if !context.wants(report::PATTERNS) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()) else { return };
    let named = |fixed: bool| -> HashSet<String> {
        let info = context.resolver.index.get(own);
        info.map(|info| info.fields.iter().filter(|field| (field.flags & flag::STATIC != 0) == fixed).map(|field| field.name.clone()).collect()).unwrap_or_default()
    };
    let (fields, statics) = (named(false), named(true));
    let outer = || {
        let nest = crate::java::types::scope::enclosing_types(context.resolver.scope, class);
        nest.get(1).filter(|_| inner(class) && parent(class).is_some_and(|holder| holder.kind() == "class_body")).cloned()
    };
    let mut units = Vec::new();
    let mut fixed_blocks = Vec::new();
    for member in members(class) {
        let body = member.child_by_field_name("body");
        let listed = parameters(member.child_by_field_name("parameters"));
        let unit = match member.kind() {
            "method_declaration" => {
                let locked = super::lombok::annotated(context, member, "Synchronized");
                Unit { listed, label: names::method(context, own, member, None), fixed: has_modifier(member, "static"), hidden: 0, compact: false, locked }
            }
            "constructor_declaration" => {
                let hidden = if class.kind() == "enum_declaration" { 2 } else { inner(class) as u16 };
                Unit { listed, label: names::method(context, own, member, outer().as_deref()), fixed: false, hidden, compact: false, locked: false }
            }
            "compact_constructor_declaration" => {
                let listed = parameters(class.child_by_field_name("parameters"));
                Unit { listed, label: names::method(context, own, class, None), fixed: false, hidden: 0, compact: true, locked: false }
            }
            "static_initializer" => {
                fixed_blocks.extend(children(member).into_iter().find(|part| part.kind() == "block"));
                continue;
            }
            _ => continue,
        };
        units.extend(body.map(|body| (vec![body], unit)));
    }
    if !fixed_blocks.is_empty() {
        let owner = names::binary(context, own);
        let simple = owner.rsplit(['.', '$']).next().unwrap_or_default().to_string();
        let label = format!("{owner}.<static initializer for {simple}>()");
        units.push((fixed_blocks, Unit { listed: Vec::new(), label, fixed: true, hidden: 0, compact: false, locked: false }));
    }
    for (bodies, unit) in units {
        let layout = slots::layout(context, &bodies, &unit.listed, unit.fixed, unit.hidden, unit.locked);
        let cfg = chained(context, &bodies);
        let live = flow::run(context, &layout, &cfg);
        let handlers = flow::handler_lines(context, &bodies);
        let fields = if unit.fixed { &statics } else { &fields };
        let merged = parent(bodies[0]).is_some_and(|holder| holder.kind() == "static_initializer");
        let body = if merged || unit.locked { class } else { bodies[0] };
        let (label, compact) = (unit.label.as_str(), unit.compact);
        report::report(&report::Method { context, layout: &layout, live: &live, label, body, fields, compact, handlers: &handlers });
    }
}

/// A method as the compiled code has it: what javac and Lombok put before the written parameters and the body.
struct Unit<'a> {
    listed: Vec<Node<'a>>,
    label: String,
    fixed: bool,
    /// Slots before the written parameters.
    hidden: u16,
    /// A compact constructor.
    compact: bool,
    /// Lombok's `@Synchronized`: the body runs in a `synchronized` block, with the lock in a slot of its own.
    locked: bool,
}

/// The flow graph of bodies run one after the other, as the static initializer blocks of a class are.
fn chained<'a>(context: &Context<'a>, bodies: &[Node<'a>]) -> Cfg<'a> {
    let mut all = cfg::build_with(context.file, bodies[0], &|_| false, true);
    for body in &bodies[1..] {
        let next = cfg::build_with(context.file, *body, &|_| false, true);
        let shift = all.blocks.len();
        let moved = |block: &mut usize| *block += shift;
        all.blocks[all.end].exit = Exit::Jump(shift);
        for mut block in next.blocks {
            match &mut block.exit {
                Exit::End => {}
                Exit::Jump(to) => moved(to),
                Exit::Branch(_, holds, fails) => {
                    moved(holds);
                    moved(fails);
                }
                Exit::Any(all) => all.iter_mut().for_each(moved),
            }
            block.catches.iter_mut().flatten().for_each(|catch| moved(&mut catch.block));
            all.blocks.push(block);
        }
        all.end = next.end + shift;
    }
    all
}
