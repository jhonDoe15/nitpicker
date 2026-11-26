//! Checks on tokens and statements: LongLiteralLowerCaseSuffix, LoopConditionChecker, NullTernary,
//! NonFinalCompileTimeConstant and NonCanonicalStaticImport.
use super::finals::{assignments, local_of};
use super::fixes::Fix;
use super::imports::static_import;
use super::inject_checks::{annotation_class, annotations_of};
use super::shape::preferred;
use super::target::target_type;
use super::Context;
use crate::engine::source::{ancestor, children, named_children, parent, walk};
use crate::java::types::model::Type;
use tree_sitter::Node;

const INTEGER_LITERALS: [&str; 4] = ["decimal_integer_literal", "hex_integer_literal", "octal_integer_literal", "binary_integer_literal"];

/// javac folds a `-` into the decimal integer literal after it.
fn folds_minus<'t>(context: &Context, literal: Node<'t>) -> Option<Node<'t>> {
    let unary = parent(literal).filter(|up| up.kind() == "unary_expression" && up.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "-"))?;
    let digits = context.text(literal).trim_end_matches(['l', 'L']);
    let decimal = digits == "0" || digits.starts_with(|first: char| ('1'..='9').contains(&first));
    (decimal && unary.child_by_field_name("operand").is_some_and(|operand| operand.id() == literal.id())).then_some(unary)
}

pub fn long_literal_lower_case_suffix(context: &Context, node: Node) {
    if !INTEGER_LITERALS.contains(&node.kind()) || !context.text(node).ends_with('l') {
        return;
    }
    let start = folds_minus(context, node).map_or(node.start_byte(), |unary| unary.start_byte());
    let written = &context.file.text[start..node.end_byte()];
    if start != node.start_byte() && written.strip_prefix('-').map(|rest| rest.trim_start_matches(' ')) != Some(context.text(node)) {
        return;
    }
    let mut replacement = written.to_string();
    replacement.pop();
    replacement.push('L');
    let fix = Fix::replace(start, node.end_byte(), replacement);
    context.report_fixed("LongLiteralLowerCaseSuffix", node, start, "Prefer 'L' to 'l' for the suffix to long literals", &[fix]);
}

fn is_literal(node: Node) -> bool {
    node.kind().ends_with("_literal") || matches!(node.kind(), "true" | "false")
}

/// `LoopConditionVisitor`: the local variables of a condition made only of them, literals and operators.
fn condition_variables<'t>(context: &Context, expression: Node<'t>, found: &mut Vec<(usize, String)>) -> bool {
    match expression.kind() {
        "identifier" => {
            let name = context.text(expression);
            let Some(local) = local_of(context, expression, name) else { return false };
            if local.scope.kind() == "catch_clause" || local.declaration.kind() == "resource" {
                return false;
            }
            if !found.iter().any(|(id, _)| *id == local.name.id()) {
                found.push((local.name.id(), name.to_string()));
            }
            true
        }
        "unary_expression" | "update_expression" => {
            let operand = expression.child_by_field_name("operand").or_else(|| named_children(expression).into_iter().find(|part| !part.kind().ends_with("comment")));
            operand.is_some_and(|operand| condition_variables(context, operand, found))
        }
        "binary_expression" => match (expression.child_by_field_name("left"), expression.child_by_field_name("right")) {
            (Some(left), Some(right)) => condition_variables(context, left, found) && condition_variables(context, right, found),
            _ => false,
        },
        kind => is_literal(expression) || kind == "decimal_floating_point_literal",
    }
}

fn updates(context: &Context, tree: Node, variables: &[(usize, String)]) -> bool {
    let mut modified = false;
    let refers = |target: Node| {
        target.kind() == "identifier"
            && variables.iter().any(|(_, name)| name == context.text(target))
            && local_of(context, target, context.text(target)).is_some_and(|local| variables.iter().any(|(id, _)| *id == local.name.id()))
    };
    walk(tree, |part| {
        if modified {
            return;
        }
        let target = match part.kind() {
            "update_expression" => named_children(part).into_iter().find(|inner| !inner.kind().ends_with("comment")),
            "method_invocation" => part.child_by_field_name("object"),
            "assignment_expression" => part.child_by_field_name("left"),
            _ => None,
        };
        modified = target.is_some_and(refers);
    });
    modified
}

pub fn loop_condition_checker(context: &Context, node: Node) {
    if node.kind() != "for_statement" {
        return;
    }
    let Some(condition) = node.child_by_field_name("condition") else { return };
    let mut variables = Vec::new();
    if !condition_variables(context, condition, &mut variables) || variables.is_empty() {
        return;
    }
    let mut cursor = node.walk();
    let mut trees = vec![condition];
    trees.extend(node.child_by_field_name("body"));
    trees.extend(node.children_by_field_name("update", &mut cursor));
    if trees.into_iter().any(|tree| updates(context, tree, &variables)) {
        return;
    }
    let names: Vec<&str> = variables.iter().map(|(_, name)| name.as_str()).collect();
    context.report_fixed("LoopConditionChecker", condition, preferred(condition), &format!("condition variable(s) never modified in loop body: {}", names.join(", ")), &[]);
}

fn without_parentheses(node: Node) -> (Node, Option<Node>) {
    let mut current = node;
    let mut up = parent(node);
    while let Some(holder) = up.filter(|holder| holder.kind() == "parenthesized_expression") {
        current = holder;
        up = parent(holder);
    }
    (current, up)
}

/// The type a switch expression has where it stands.
fn switch_type(context: &Context, switch: Node) -> Option<Type> {
    target_type(context, switch).or_else(|| context.resolver.type_of(switch))
}

fn ternary_target(context: &Context, ternary: Node) -> Option<Type> {
    let (current, up) = without_parentheses(ternary);
    match up?.kind() {
        "yield_statement" => switch_type(context, ancestor(current, &["switch_expression"])?),
        "switch_rule" if parent(up?).is_some_and(|block| block.kind() == "switch_block") => switch_type(context, ancestor(current, &["switch_expression"])?),
        "expression_statement" if parent(up?).is_some_and(|rule| rule.kind() == "switch_rule") && parent(parent(up?)?).is_some_and(|block| block.kind() == "switch_block") => {
            switch_type(context, ancestor(current, &["switch_expression"])?)
        }
        "dimensions_expr" => Some(Type::Primitive("int")),
        "ternary_expression" if up?.child_by_field_name("condition").is_some_and(|condition| condition.id() != current.id()) => {
            operand_type(context, up?, current).or_else(|| target_type(context, ternary))
        }
        _ => target_type(context, ternary),
    }
}

/// The type javac gives a numeric or boolean conditional from its two operand types.
fn operand_type(context: &Context, conditional: Node, current: Node) -> Option<Type> {
    let side = |field: &str| conditional.child_by_field_name(field);
    let other = if side("consequence")?.id() == current.id() { side("alternative")? } else { side("consequence")? };
    let first = context.resolver.type_of(current)?.unboxed_or_same();
    let second = context.resolver.type_of(other)?.unboxed_or_same();
    let (Type::Primitive(a), Type::Primitive(b)) = (&first, &second) else { return None };
    if a == b {
        return Some(first);
    }
    let rank = |name: &str| ["double", "float", "long"].iter().position(|wide| *wide == name);
    match (rank(a), rank(b), *a == "boolean" || *b == "boolean") {
        (_, _, true) => None,
        (None, None, _) => Some(Type::Primitive("int")),
        (x, y, _) => Some(Type::Primitive(if x.unwrap_or(9) <= y.unwrap_or(9) { a } else { b })),
    }
}

pub fn null_ternary(context: &Context, node: Node) {
    if node.kind() != "ternary_expression" {
        return;
    }
    let null = |side: &str| node.child_by_field_name(side).is_some_and(|part| part.kind() == "null_literal");
    if !null("consequence") && !null("alternative") {
        return;
    }
    if matches!(ternary_target(context, node), Some(Type::Primitive(_))) {
        let message = "This conditional expression may evaluate to null, which will result in an NPE when the result is unboxed.";
        context.report_fixed("NullTernary", node, preferred(node), message, &[]);
    }
}

pub fn non_final_compile_time_constant(context: &Context, node: Node) {
    if !matches!(node.kind(), "method_declaration" | "constructor_declaration") {
        return;
    }
    let (Some(body), Some(parameters)) = (node.child_by_field_name("body"), node.child_by_field_name("parameters")) else { return };
    for parameter in named_children(parameters).into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter")) {
        let marked = annotations_of(parameter).into_iter().any(|annotation| annotation_class(context, annotation).as_deref() == Some("com.google.errorprone.annotations.CompileTimeConstant"));
        let name = parameter.child_by_field_name("name").or_else(|| children(parameter).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|part| part.child_by_field_name("name")));
        let Some(name) = name.filter(|_| marked) else { continue };
        if crate::java::helpers::has_modifier(parameter, "final") || assignments(context, body, context.text(name), 0).0 == 0 {
            continue;
        }
        context.report_fixed("NonFinalCompileTimeConstant", parameter, name.start_byte(), "@CompileTimeConstant parameters should be final or effectively final", &[]);
        return;
    }
}

pub fn non_canonical_static_import(context: &Context, node: Node) {
    if node.kind() != "import_declaration" {
        return;
    }
    let Some(found) = static_import(context, node) else { return };
    let [only] = found.members.as_slice() else { return };
    let Some(path) = children(node).into_iter().find(|part| part.kind() == "scoped_identifier") else { return };
    let written: String = context.text(path).chars().filter(|character| !character.is_whitespace()).collect();
    if only.class && written != only.owner {
        let fix = Fix::replace(node.start_byte(), node.end_byte(), format!("import {};", only.owner));
        context.report_fixed("NonCanonicalStaticImport", node, node.start_byte(), "Static import of type uses non-canonical name", &[fix]);
    }
}
