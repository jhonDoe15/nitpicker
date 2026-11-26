//! HardCodedSdCardPath, ICCProfileGetInstance, IncorrectMainMethod, IncrementInForLoopAndHeader, InstanceOfAndCastMatchWrongType
//! and IntFloatConversion.
use super::call_match::static_on_class;
use super::compat::castable;
use super::consts::constant;
use super::fix_helpers::{add_modifiers, remove_modifiers};
use super::fixes::Fix;
use super::nodes::{name_position, unparenthesized};
use super::parts::{arguments, only_argument};
use super::positions::preferred;
use super::symbol_key::{same_declared_symbol, same_symbol};
use super::target::target_type;
use super::testcode::is_junit_test_code;
use super::Context;
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::helpers::{has_modifier, in_interface_or_annotation};
use crate::java::types::expr::literal_text;
use crate::java::types::model::Type;
use tree_sitter::Node;

const SDCARD: &str = "Environment.getExternalStorageDirectory().getPath()";
const DATA: &str = "Context.getFilesDir().getPath()";
const PATH_TABLE: [(&str, &str); 7] = [
    ("/sdcard", SDCARD),
    ("/mnt/sdcard", SDCARD),
    ("/system/media/sdcard", SDCARD),
    ("file://sdcard", SDCARD),
    ("file:///sdcard", SDCARD),
    ("/data/data", DATA),
    ("/data/user", DATA),
];

fn is_plus(context: &Context, node: Node) -> bool {
    node.kind() == "binary_expression" && node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "+")
}

/// The operands of a left-nested chain of `+`, in order.
fn plus_operands<'t>(context: &Context, chain: Node<'t>) -> Vec<Node<'t>> {
    let mut operands = Vec::new();
    let mut current = chain;
    while is_plus(context, current) {
        let (Some(left), Some(right)) = (current.child_by_field_name("left"), current.child_by_field_name("right")) else { return vec![chain] };
        operands.push(right);
        current = left;
    }
    operands.push(current);
    operands.reverse();
    operands
}

fn report_path(context: &Context, run: &[Node]) {
    let (Some(first), Some(last)) = (run.first(), run.last()) else { return };
    let mut value = String::new();
    for literal in run {
        let Some(text) = literal_text(context.file, *literal) else { return };
        value.push_str(&text);
    }
    let Some((path, replacement)) = PATH_TABLE.iter().find(|(path, _)| value.starts_with(path)) else { return };
    let remainder = &value[path.len()..];
    let text = if remainder.is_empty() { (*replacement).to_string() } else { format!("{replacement} + \"{remainder}\"") };
    let fix = Fix::replace(first.start_byte(), last.end_byte(), text).with_imports();
    context.report_fixed("HardCodedSdCardPath", *first, first.start_byte(), "Hardcoded reference to /sdcard", &[fix]);
}

pub fn hard_coded_sd_card_path(context: &Context, node: Node) {
    if !matches!(node.kind(), "string_literal" | "binary_expression") || !context.resolver.index.android_compatible {
        return;
    }
    let inside_chain = parent(node).is_some_and(|up| is_plus(context, up));
    if node.kind() == "binary_expression" && (!is_plus(context, node) || parent(node).is_some_and(|up| is_plus(context, up) && up.child_by_field_name("left").is_some_and(|left| left.id() == node.id()))) {
        return;
    }
    if node.kind() == "string_literal" && inside_chain || is_junit_test_code(context, node) {
        return;
    }
    let operands = if node.kind() == "string_literal" { vec![node] } else { plus_operands(context, node) };
    let mut run: Vec<Node> = Vec::new();
    for operand in operands {
        if operand.kind() == "string_literal" {
            run.push(operand);
        } else {
            report_path(context, &run);
            run.clear();
        }
    }
    report_path(context, &run);
}

pub fn icc_profile_get_instance(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !static_on_class(context, call, "java.awt.color.ICC_Profile", &["getInstance"]) {
        return;
    }
    if !context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.parameters == [Type::class("java.lang.String")]) {
        return;
    }
    let Some(argument) = only_argument(call) else { return };
    let fix = Fix::new().insert(argument.start_byte(), "Files.readAllBytes(Paths.get(").insert(argument.end_byte(), "))").with_imports();
    let message = "This method searches the class path for the given file, prefer to read the file and call getInstance(byte[]) or getInstance(InputStream)";
    context.report_fixed("ICCProfileGetInstance", call, preferred(context, call), message, &[fix]);
}

pub fn incorrect_main_method(context: &Context, method: Node) {
    if method.kind() != "method_declaration" || method.child_by_field_name("name").is_none_or(|name| context.text(name) != "main") {
        return;
    }
    let (_, generic, _) = context.resolver.parameters(method.child_by_field_name("parameters"));
    let [only] = generic.as_slice() else { return };
    if *only != Type::Array(Box::new(Type::class("java.lang.String"))) {
        return;
    }
    let mut fix = Fix::new();
    let Some(returns) = method.child_by_field_name("type") else { return };
    if context.text(returns) != "void" {
        fix = fix.and(returns.start_byte(), returns.end_byte(), "void");
    }
    let implicit_public = in_interface_or_annotation(method);
    let has_both = (has_modifier(method, "public") || implicit_public) && has_modifier(method, "static");
    let instance_main = context.resolver.index.source_level >= 25;
    if !instance_main && !has_both {
        fix = add_modifiers(fix, method, &["public"]);
        fix = remove_modifiers(fix, method, &["private", "protected"]);
        fix = add_modifiers(fix, method, &["static"]);
    }
    if !fix.is_empty() {
        context.report_fixed("IncorrectMainMethod", method, name_position(method), "'main' methods must be public, static, and void", &[fix]);
    }
}

fn increment_operand<'t>(statement: Node<'t>) -> Option<Node<'t>> {
    let expression = if statement.kind() == "expression_statement" { statement.named_child(0)? } else { statement };
    if expression.kind() != "update_expression" {
        return None;
    }
    expression.named_child(0).filter(|operand| matches!(operand.kind(), "identifier" | "field_access"))
}

pub fn increment_in_for_loop_and_header(context: &Context, node: Node) {
    if node.kind() != "for_statement" {
        return;
    }
    let incremented: Vec<Node> = children_with_field(node, "update").into_iter().filter_map(increment_operand).collect();
    if incremented.is_empty() {
        return;
    }
    let Some(body) = node.child_by_field_name("body") else { return };
    let statements = if body.kind() == "block" { named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).collect() } else { vec![body] };
    for statement in statements {
        if matches!(statement.kind(), "if_statement" | "do_statement" | "while_statement" | "for_statement" | "enhanced_for_statement") {
            continue;
        }
        let Some(operand) = increment_operand(statement).filter(|_| statement.kind() == "expression_statement") else { continue };
        if incremented.iter().any(|header| same_declared_symbol(context, *header, operand)) {
            context.report_fixed("IncrementInForLoopAndHeader", node, node.start_byte(), "This for loop increments the same variable in the header and in the body", &[]);
            return;
        }
    }
}

/// The nodes in a field that appears several times, as the `update` of a `for`.
fn children_with_field<'t>(node: Node<'t>, field: &str) -> Vec<Node<'t>> {
    let mut cursor = node.walk();
    node.children_by_field_name(field, &mut cursor).filter(|part| !part.kind().ends_with("comment")).collect()
}

fn literals_equal(context: &Context, first: Node, second: Node) -> bool {
    let literal = |node: Node| node.kind().ends_with("_literal") && node.kind() != "null_literal" || matches!(node.kind(), "true" | "false");
    literal(first) && literal(second) && matches!((constant(context, first), constant(context, second)), (Some(a), Some(b)) if a == b)
}

/// `InstanceOfAndCastMatchWrongType.expressionsEqual`: array accesses, names and literals only.
fn expressions_equal(context: &Context, first: Node, second: Node) -> bool {
    match (first.kind(), second.kind()) {
        ("array_access", "array_access") => {
            match (first.child_by_field_name("array"), second.child_by_field_name("array"), first.child_by_field_name("index"), second.child_by_field_name("index")) {
                (Some(a), Some(b), Some(x), Some(y)) => expressions_equal(context, a, b) && expressions_equal(context, x, y),
                _ => false,
            }
        }
        ("identifier", "identifier") => same_symbol(context, first, second),
        _ => literals_equal(context, first, second),
    }
}

fn instance_of_type<'t>(instance_of: Node<'t>) -> Option<Node<'t>> {
    instance_of.child_by_field_name("right").or_else(|| {
        let pattern = instance_of.child_by_field_name("pattern")?;
        if pattern.kind() == "record_pattern" {
            return named_children(pattern).into_iter().next();
        }
        pattern.child_by_field_name("type").or_else(|| named_children(pattern).into_iter().find(|part| part.kind().ends_with("type") || part.kind() == "type_identifier" || part.kind() == "scoped_type_identifier"))
    })
}

/// The last `instanceof` of the condition on the expression, unless the condition has an `||` or a `!`.
fn relevant_instance_of<'t>(context: &Context, condition: Node<'t>, expression: Node<'t>) -> Option<Node<'t>> {
    let mut not_applicable = false;
    let mut relevant = None;
    walk(condition, |part| match part.kind() {
        "binary_expression" if part.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "||") => not_applicable = true,
        "unary_expression" if part.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "!") => not_applicable = true,
        "instanceof_expression" if part.child_by_field_name("left").is_some_and(|left| expressions_equal(context, left, expression)) => relevant = Some(part),
        _ => {}
    });
    if not_applicable { None } else { relevant }
}

/// Where the first assignment to the expression in the statement ends.
fn earliest_assignment(context: &Context, statement: Node, expression: Node) -> usize {
    let mut earliest = usize::MAX;
    walk(statement, |part| {
        if part.kind() == "assignment_expression"
            && part.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=")
            && part.child_by_field_name("left").is_some_and(|left| expressions_equal(context, left, expression))
        {
            earliest = earliest.min(part.end_byte());
        }
    });
    earliest
}

pub fn instance_of_and_cast_match_wrong_type(context: &Context, cast: Node) {
    if cast.kind() != "cast_expression" {
        return;
    }
    let (Some(operand), Some(cast_type)) = (cast.child_by_field_name("value"), context.resolver.type_of(cast)) else { return };
    let mut current = parent(cast);
    while let Some(up) = current {
        current = parent(up);
        if up.kind() != "if_statement" {
            continue;
        }
        let Some(condition) = up.child_by_field_name("condition").map(unparenthesized) else { continue };
        let Some(instance_of) = relevant_instance_of(context, condition, operand) else { continue };
        if up.child_by_field_name("alternative").is_some_and(|other| ancestor_or_self(cast, other)) {
            continue;
        }
        let (Some(inside), Some(then)) = (instance_of.child_by_field_name("left"), up.child_by_field_name("consequence")) else { continue };
        if earliest_assignment(context, then, inside) < cast.start_byte() {
            continue;
        }
        let Some(target) = instance_of_type(instance_of).and_then(|written| context.resolver.type_node(written)) else { continue };
        if expressions_equal(context, operand, inside) {
            if !castable(context, &target.erased(), &cast_type.erased()) {
                context.report_fixed("InstanceOfAndCastMatchWrongType", cast, cast.start_byte(), "Casting inside an if block should be plausibly consistent with the instanceof type", &[]);
            }
            return;
        }
    }
}

fn ancestor_or_self(node: Node, of: Node) -> bool {
    let mut current = Some(node);
    while let Some(at) = current {
        if at.id() == of.id() {
            return true;
        }
        current = parent(at);
    }
    false
}

pub fn int_float_conversion(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !static_on_class(context, call, "java.lang.Math", &["scalb"]) {
        return;
    }
    if !context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.parameters == [Type::Primitive("float"), Type::Primitive("int")]) {
        return;
    }
    let Some(first) = arguments(call).first().copied() else { return };
    if context.resolver.type_of(first) != Some(Type::Primitive("int")) || target_type(context, call) != Some(Type::Primitive("double")) {
        return;
    }
    let fix = Fix::new().insert(first.start_byte(), "(double) ");
    let message = "Conversion from int to float may lose precision; use an explicit cast to float if this was intentional";
    context.report_fixed("IntFloatConversion", first, preferred(context, first), message, &[fix]);
}
