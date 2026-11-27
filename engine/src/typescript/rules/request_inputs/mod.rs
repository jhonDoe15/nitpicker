//! `no-uncoerced-request-input`: number, bigint, boolean and date fields read from the query string, path, headers or
//! a multipart form as text that the declaration never converts. The plugin rule walks the TypeScript compiler's
//! syntax tree without a type checker; `tree` reads that tree off the ESTree view.
pub mod bindings;
pub mod calls;
mod fields;
pub mod nest;
pub mod order;
pub mod tree;

use self::fields::{Finding, Kind};
use self::fields::shapes::{is_property_assignment, object_entries};
use self::tree::{Tree, T};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;

const RULE: &str = "no-uncoerced-request-input";
const CONVERTING_SCHEMA: &str = "a DTO or schema that converts it";

pub struct Located<'v> {
    pub finding: Finding<'v>,
    pub source: String,
}

fn fix_of(library: &str, kind: &Kind) -> Option<&'static str> {
    let fix = match (library, kind) {
        ("zod", Kind::Number) => "z.coerce.number()",
        ("zod", Kind::Integer) => "z.coerce.number().int()",
        ("zod", Kind::Bigint) => "z.coerce.bigint()",
        ("zod", Kind::Date) => "z.coerce.date()",
        ("zod", Kind::Boolean) => "z.stringbool() (zod 4) or z.enum(['true', 'false']).transform((value) => value === 'true')",
        ("valibot", Kind::Number) => "v.pipe(v.string(), v.toNumber(), v.number())",
        ("valibot", Kind::Bigint) => "v.pipe(v.string(), v.toBigint())",
        ("valibot", Kind::Date) => "v.pipe(v.string(), v.toDate())",
        ("valibot", Kind::Boolean) => "v.pipe(v.picklist(['true', 'false']), v.transform((value) => value === 'true'))",
        ("class-validator", Kind::Number) => "@Type(() => Number)",
        ("class-validator", Kind::Bigint) => "@Transform(({ value }) => BigInt(value))",
        ("class-validator", Kind::Date) => "@Type(() => Date)",
        ("class-validator", Kind::Boolean) => "@Transform(({ value }) => value === 'true')",
        ("param", Kind::Number) => "ParseIntPipe or ParseFloatPipe",
        ("param", Kind::Bigint) => "a pipe that calls BigInt",
        ("param", Kind::Date) => "ParseDatePipe",
        ("param", Kind::Boolean) => "ParseBoolPipe",
        ("type", Kind::Number | Kind::Bigint | Kind::Date | Kind::Boolean) => CONVERTING_SCHEMA,
        _ => return None,
    };
    Some(fix)
}

/// An object literal, or a destructuring target the compiler parses as one.
pub fn is_object_literal(node: Node) -> bool {
    object_entries(node).is_some()
}

/// A property assignment of an object literal: the compiler's `PropertyAssignment`.
pub fn is_literal_property(property: Node) -> bool {
    is_property_assignment(property) && property.parent().and_then(object_entries).is_some()
}

fn is_method_declaration(node: Node) -> bool {
    match node.kind() {
        "MethodDefinition" | "TSAbstractMethodDefinition" => node.text("kind").as_deref() == Some("method"),
        "Property" => node.flag("method") && node.parent().is_some_and(|parent| parent.is("ObjectExpression")),
        _ => false,
    }
}

fn node_problems<'v>(tree: &Tree<'v>, node: Node<'v>) -> Vec<Located<'v>> {
    if is_method_declaration(node) {
        return nest::handler_problems(tree, node);
    }
    if node.is("CallExpression") {
        return calls::call_problems(tree, node);
    }
    if node.is("Property") && is_literal_property(node) { calls::route_schema_problems(tree, node) } else { Vec::new() }
}

/// The start the compiler gives a node: a parameter or member starts at its first decorator.
pub fn start_of(tree: &Tree, t: T) -> u32 {
    let (start, _) = tree.span(t);
    if t.level > 0 {
        return start;
    }
    t.node.nodes("decorators").iter().map(Node::start).chain([start]).min().unwrap_or(start)
}

fn message(located: &Located) -> String {
    let problem = &located.finding.problem;
    let field = &located.finding.field;
    let source = &located.source;
    let form = &problem.form;
    let fix = problem.fix.clone().or_else(|| fix_of(problem.library, &problem.kind).map(str::to_string)).unwrap_or_else(|| "undefined".to_string());
    if problem.cast {
        return format!("{field} arrives from the {source} as text, and {form} turns \"false\" into true. Compare the text instead: {fix}.");
    }
    if problem.library == "param" || problem.library == "type" {
        return format!("{field} arrives from the {source} as text, but {form} claims otherwise and nothing at the declaration converts it. Convert it there with {fix}.");
    }
    format!("{field} arrives from the {source} as text, so {form} rejects every request that sets it. Convert the text where the field is declared: {fix}.")
}

pub fn check(context: &mut Context) {
    let Some(tree) = Tree::of(context) else { return };
    let mut sites: Vec<(usize, u32, Node)> = tree.view.nodes().filter(|node| is_method_declaration(*node) || node.is("CallExpression") || (node.is("Property") && is_literal_property(*node))).map(|node| (order::depth(&tree, node), node.start(), node)).collect();
    sites.sort_by_key(|(depth, start, _)| (*depth, *start));
    let mut reported: Vec<(String, u32)> = Vec::new();
    let mut found = Vec::new();
    for (_, _, site) in sites {
        for located in node_problems(&tree, site) {
            let key = (located.finding.field.clone(), start_of(&tree, located.finding.node));
            if !reported.contains(&key) {
                reported.push(key);
                found.push(located);
            }
        }
    }
    for located in found {
        let start = start_of(&tree, located.finding.node);
        let (_, end) = tree.span(located.finding.node);
        context.report_range(RULE, start, Some(end), message(&located));
    }
}
