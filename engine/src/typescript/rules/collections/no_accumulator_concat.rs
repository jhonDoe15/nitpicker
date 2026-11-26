//! `no-accumulator-concat`: `concat` onto the accumulator array on every step of `reduce` or of a loop copies it
//! each time, so the work grows with the square of the list.
use super::loops::{Site, enclosing_loop};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use std::cell::RefCell;

const RULE: &str = "no-accumulator-concat";
const CONCAT: &str = "Concatenating onto the accumulator copies it on every step, so the work grows with the square of the list. Build the result in one pass (`flatMap`, `Object.fromEntries(items.map(...))`, `Object.groupBy`), or push into an array created before the loop. An exception fits only when the list is always tiny.";

fn loop_concat(name: &str) -> String {
    format!(
        "This loop copies `{name}` with `concat` on every pass, so the work grows with the square of the list. Build the result in one \
         pass (`flatMap`, `Object.fromEntries(items.map(...))`), or push into an array created before the loop. An exception fits only \
         when the list is always tiny."
    )
}

struct Facts<'c, 'a, 's> {
    scopes: &'c Scopes<'a, 's>,
    types: &'c RefCell<Types>,
}

fn is_function_expression(node: Node) -> bool {
    matches!(node.kind(), "ArrowFunctionExpression" | "FunctionExpression")
}

fn reducer_of(call: Node) -> Option<Node> {
    let callback = *call.nodes("arguments").first()?;
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"))?;
    let method = callee.node("property")?.name()?;
    let first = callback.nodes("params").first().copied();
    let reduces = matches!(method.as_ref(), "reduce" | "reduceRight");
    (reduces && is_function_expression(callback) && first.is_some_and(|first| first.is("Identifier"))).then_some(callback)
}

fn is_concat_of(value: Node, name: &str) -> bool {
    let callee = if value.is("CallExpression") { value.node("callee") } else { None };
    callee.is_some_and(|callee| {
        callee.is("MemberExpression")
            && callee.node("object").is_some_and(|object| object.is("Identifier") && object.name().is_some_and(|found| found == name))
            && callee.node("property").and_then(|property| property.name()).is_some_and(|property| property == "concat")
    })
}

fn enclosing_reducer(node: Node) -> Option<Node> {
    node.ancestors().find(|ancestor| {
        is_function_expression(*ancestor) && ancestor.parent().filter(|call| call.is("CallExpression")).and_then(reducer_of) == Some(*ancestor)
    })
}

impl Facts<'_, '_, '_> {
    fn is_array_value(&self, node: Node) -> Option<bool> {
        self.types.borrow_mut().holds_only_arrays(node.start(), node.end())
    }

    fn reduce_concat(&self, call: Node) -> Option<bool> {
        let object = call.node("callee").filter(|callee| callee.is("MemberExpression")).and_then(|callee| callee.node("object"));
        let Some(object) = object.filter(|object| object.is("Identifier")) else { return Some(false) };
        let Some(reducer) = enclosing_reducer(call) else { return Some(false) };
        let accumulator = reducer.nodes("params").first().and_then(|first| first.name());
        match accumulator {
            Some(name) if is_concat_of(call, &name) => self.is_array_value(object),
            _ => Some(false),
        }
    }

    fn outside_definition(&self, target: Node, site: &Site) -> bool {
        let definition = self.scopes.variable_named(target).and_then(|symbol| self.scopes.defs(symbol).into_iter().next());
        definition.is_some_and(|definition| !site.node().contains(definition.name))
    }

    fn loop_copy(&self, assignment: Node) -> Option<Option<String>> {
        let (Some(left), Some(right)) = (assignment.node("left"), assignment.node("right")) else { return Some(None) };
        let name = left.name().filter(|_| left.is("Identifier"));
        let Some(name) = name.filter(|name| assignment.text("operator").is_some_and(|operator| operator == "=") && is_concat_of(right, name))
        else {
            return Some(None);
        };
        let Some(site) = enclosing_loop(assignment, self.types)? else { return Some(None) };
        if !self.outside_definition(left, &site) {
            return Some(None);
        }
        Some(self.is_array_value(left)?.then(|| name.into_owned()))
    }
}

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let facts = Facts { scopes, types };
    let mut found = Vec::new();
    for node in view.nodes() {
        let hit = match node.kind() {
            "CallExpression" => facts.reduce_concat(node).map(|hit| hit.then(|| CONCAT.to_string())),
            "AssignmentExpression" => facts.loop_copy(node).map(|name| name.map(|name| loop_concat(&name))),
            _ => continue,
        };
        match hit {
            Some(hit) if types.borrow().refused.is_none() => found.extend(hit.map(|message| (node.start(), node.end(), message))),
            _ => {
                types.borrow_mut().refuse("no type for an accumulator");
                return;
            }
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
