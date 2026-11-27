//! ComparisonContractViolated, DistinctVarargsChecker and UnnecessaryOptionalGet.
use super::Context;
use super::compare_zero::int_constant;
use super::fixes::Fix;
use super::symbol_key::same_symbol as same_variable;
use super::positions::{arguments, preferred};
use crate::engine::source::{children, named_children, walk};
use crate::java::types::model::Type;
use tree_sitter::Node;

const COMPARISON: &str = "This comparison method violates the contract";
const DISTINCT: &str = "Method expects distinct arguments at some/all positions";
const OPTIONAL_GET: &str = "This code can be simplified by directly using the lambda parameters instead of calling get..() on optional.";

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Sign {
    Negative,
    Zero,
    Positive,
    Nonconstant,
}

fn of_int(value: i32) -> Sign {
    match value {
        v if v < 0 => Sign::Negative,
        0 => Sign::Zero,
        _ => Sign::Positive,
    }
}

fn constant_result(context: &Context, node: Node) -> Sign {
    match node.kind() {
        "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" => {
            int_constant(context, node).filter(|_| !context.text(node).ends_with(['l', 'L'])).map_or(Sign::Nonconstant, of_int)
        }
        "unary_expression" => {
            let operand = node.child_by_field_name("operand");
            let minus = node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "-");
            match operand {
                Some(operand) if minus && operand.kind() == "decimal_integer_literal" && !context.text(operand).ends_with(['l', 'L']) => {
                    int_constant(context, node).map_or(Sign::Nonconstant, of_int)
                }
                _ => Sign::Nonconstant,
            }
        }
        "identifier" | "field_access" => int_constant(context, node).map_or(Sign::Nonconstant, of_int),
        _ => Sign::Nonconstant,
    }
}

fn collect_results(context: &Context, expression: Node, seen: &mut Vec<Sign>) {
    if expression.kind() == "ternary_expression" {
        for field in ["consequence", "alternative"] {
            if let Some(branch) = expression.child_by_field_name(field) {
                collect_results(context, branch, seen);
            }
        }
    } else {
        seen.push(constant_result(context, expression));
    }
}

fn returns_in<'t>(node: Node<'t>, found: &mut Vec<Node<'t>>) {
    for part in children(node) {
        if part.kind() == "return_statement" {
            found.push(part);
        } else {
            returns_in(part, found);
        }
    }
}

fn is_public(method: Node, in_interface: bool) -> bool {
    in_interface || crate::java::helpers::has_modifier(method, "public")
}

fn is_comparator_method(context: &Context, method: Node, in_interface: bool) -> bool {
    method.child_by_field_name("name").is_some_and(|name| context.text(name) == "compare")
        && is_public(method, in_interface)
        && method.child_by_field_name("type").is_some_and(|kind| context.text(kind) == "int")
        && super::hierarchy::formals(method).len() == 2
}

fn is_compare_to(context: &Context, method: Node, in_interface: bool) -> bool {
    method.child_by_field_name("name").is_some_and(|name| context.text(name) == "compareTo")
        && is_public(method, in_interface)
        && method.child_by_field_name("type").is_some_and(|kind| context.text(kind) == "int")
        && super::hierarchy::formals(method).len() == 1
}

pub fn comparison_contract_violated(context: &Context, method: Node) {
    if method.kind() != "method_declaration" {
        return;
    }
    let Some(body) = method.child_by_field_name("body") else { return };
    let name = method.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    if !matches!(name, "compare" | "compareTo") {
        return;
    }
    let Some(owner) = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, method) else { return };
    let index = context.resolver.index;
    if !index.is_subtype(&owner, "java.lang.Comparable") && !index.is_subtype(&owner, "java.util.Comparator") {
        return;
    }
    let interface = index.get(&owner).is_some_and(|info| info.is_interface);
    let comparator = is_comparator_method(context, method, interface);
    if !is_compare_to(context, method, interface) && !comparator {
        return;
    }
    let mut statements = Vec::new();
    returns_in(body, &mut statements);
    let mut seen = Vec::new();
    for statement in &statements {
        if let Some(value) = named_children(*statement).into_iter().find(|part| !part.kind().ends_with("comment")) {
            collect_results(context, value, &mut seen);
        }
    }
    if seen.is_empty() || seen.contains(&Sign::Nonconstant) {
        return;
    }
    let at = method.child_by_field_name("name").map_or(method.start_byte(), |name| name.start_byte());
    if !seen.contains(&Sign::Zero) {
        single_conditional(context, method, body, at);
        return;
    }
    if comparator && seen.contains(&Sign::Negative) != seen.contains(&Sign::Positive) {
        context.report_fixed("ComparisonContractViolated", method, at, COMPARISON, &[]);
    }
}

fn single_conditional(context: &Context, method: Node, body: Node, at: usize) {
    let report = |node: Node, position: usize, fixes: &[Fix]| context.report_fixed("ComparisonContractViolated", node, position, COMPARISON, fixes);
    let statements: Vec<Node> = named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let conditional = match statements.as_slice() {
        [only] if only.kind() == "return_statement" => named_children(*only).into_iter().find(|part| !part.kind().ends_with("comment")).filter(|value| value.kind() == "ternary_expression"),
        _ => None,
    };
    let Some(conditional) = conditional else { return report(method, at, &[]) };
    let (Some(condition), Some(yes), Some(no)) = (conditional.child_by_field_name("condition"), conditional.child_by_field_name("consequence"), conditional.child_by_field_name("alternative")) else { return };
    let mut condition = condition;
    while condition.kind() == "parenthesized_expression" {
        match named_children(condition).into_iter().find(|part| !part.kind().ends_with("comment")) {
            Some(inner) => condition = inner,
            None => break,
        }
    }
    if condition.kind() != "binary_expression" {
        return report(method, at, &[]);
    }
    let (yes_result, no_result) = (constant_result(context, yes), constant_result(context, no));
    let mut first_true = match (yes_result, no_result) {
        (Sign::Negative, Sign::Positive) => true,
        (Sign::Positive, Sign::Negative) => false,
        _ => return report(method, at, &[]),
    };
    let operator = condition.child_by_field_name("operator").map(|operator| context.text(operator)).unwrap_or_default();
    match operator {
        "<" | "<=" => {}
        ">" | ">=" => first_true = !first_true,
        _ => return report(method, at, &[]),
    }
    let (Some(left), Some(right)) = (condition.child_by_field_name("left"), condition.child_by_field_name("right")) else { return };
    let (first, second) = if first_true { (left, right) } else { (right, left) };
    let name = match context.resolver.type_of(left) {
        Some(Type::Primitive("int")) => "Integer",
        Some(Type::Primitive("long")) => "Long",
        _ => return report(method, at, &[]),
    };
    let text = format!("{name}.compare({}, {})", context.text(first), context.text(second));
    let fix = Fix::replace(conditional.start_byte(), conditional.end_byte(), text);
    report(conditional, preferred(context, conditional), &[fix]);
}

fn argument_groups<'t>(context: &Context, call: Node<'t>) -> Option<(Vec<Vec<Node<'t>>>, bool)> {
    let resolved = context.resolver.resolve_call(call)?;
    if !resolved.method.is_static {
        return None;
    }
    let owner = resolved.declaring.as_str();
    let name = resolved.method.name.as_str();
    let list = arguments(call);
    let parameters: Vec<String> = resolved.method.parameters.iter().map(Type::name).collect();
    match (owner, name) {
        ("java.util.Set" | "com.google.common.collect.ImmutableSet" | "com.google.common.collect.ImmutableSortedSet", "of") => Some((vec![list], true)),
        ("com.google.common.util.concurrent.Futures", "whenAllSucceed" | "whenAllComplete")
            if parameters == ["com.google.common.util.concurrent.ListenableFuture[]"] =>
        {
            Some((vec![list], false))
        }
        ("com.google.common.collect.Ordering", "explicit") if parameters == ["java.lang.Object", "java.lang.Object[]"] => Some((vec![list], false)),
        ("com.google.common.collect.ImmutableSortedMap" | "java.util.Map", "of") => Some((vec![list.into_iter().step_by(2).collect()], false)),
        ("com.google.common.collect.ImmutableBiMap", "of") => {
            let even = list.iter().copied().step_by(2).collect();
            let odd = list.iter().copied().skip(1).step_by(2).collect();
            Some((vec![even, odd], false))
        }
        _ => None,
    }
}

pub fn distinct_varargs(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return };
    if !matches!(name, "of" | "whenAllSucceed" | "whenAllComplete" | "explicit") {
        return;
    }
    let Some((groups, fixing)) = argument_groups(context, call) else { return };
    for group in groups {
        let mut seen: Vec<(&str, Vec<usize>)> = Vec::new();
        for (index, argument) in group.iter().enumerate() {
            let text = context.text(*argument);
            match seen.iter_mut().find(|(known, _)| *known == text) {
                Some((_, positions)) => positions.push(index),
                None => seen.push((text, vec![index])),
            }
        }
        if fixing {
            let mut fix = Fix::new();
            for (_, positions) in &seen {
                for index in positions.iter().skip(1) {
                    fix = fix.and(group[index - 1].end_byte(), group[*index].end_byte(), "");
                }
            }
            if fix != Fix::new() {
                context.report_fixed("DistinctVarargsChecker", call, preferred(context, call), DISTINCT, &[fix]);
            }
        } else {
            for (_, positions) in &seen {
                for index in positions.iter().skip(1) {
                    context.report_fixed("DistinctVarargsChecker", group[*index], preferred(context, group[*index]), DISTINCT, &[]);
                }
            }
        }
    }
}

const FUNCTIONAL: [(&str, &[&str]); 5] = [
    ("java.util.Optional", &["map", "filter", "ifPresent", "flatMap"]),
    ("java.util.OptionalLong", &["ifPresent"]),
    ("java.util.OptionalInt", &["ifPresent"]),
    ("java.util.OptionalDouble", &["ifPresent"]),
    ("com.google.common.base.Optional", &["transform"]),
];
const GETTERS: [(&str, &[&str]); 5] = [
    ("java.util.Optional", &["get", "orElseThrow", "orElse", "orElseGet"]),
    ("java.util.OptionalLong", &["getAsLong", "orElse", "orElseGet", "orElseThrow"]),
    ("java.util.OptionalInt", &["getAsInt", "orElse", "orElseGet", "orElseThrow"]),
    ("java.util.OptionalDouble", &["getAsDouble", "orElse", "orElseGet", "orElseThrow"]),
    ("com.google.common.base.Optional", &["get", "or", "orNull"]),
];

fn on_exact(context: &Context, call: Node, table: &[(&str, &[&str])]) -> bool {
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return false };
    if call.child_by_field_name("object").is_none() || !table.iter().any(|(_, names)| names.contains(&name)) {
        return false;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return false };
    if resolved.method.is_static {
        return false;
    }
    let receiver = resolved.receiver.erased().name();
    table.iter().any(|(class, names)| *class == receiver && names.contains(&name))
}

pub fn unnecessary_optional_get(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !on_exact(context, call, &FUNCTIONAL) {
        return;
    }
    let list = arguments(call);
    let [lambda] = list.as_slice() else { return };
    let (Some(receiver), true) = (call.child_by_field_name("object"), lambda.kind() == "lambda_expression") else { return };
    let Some(parameters) = lambda.child_by_field_name("parameters") else { return };
    let name = if parameters.kind() == "identifier" {
        context.text(parameters).to_string()
    } else {
        let declared: Vec<Node> = named_children(parameters).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
        let [only] = declared.as_slice() else { return };
        let written = if only.kind() == "identifier" { Some(*only) } else { only.child_by_field_name("name") };
        match written {
            Some(written) => context.text(written).to_string(),
            None => return,
        }
    };
    if name == "_" {
        return;
    }
    let mut fix = Fix::new();
    walk(*lambda, |part| {
        if part.kind() == "method_invocation" && on_exact(context, part, &GETTERS) {
            if let Some(inner) = part.child_by_field_name("object") {
                if same_variable(context, receiver, inner) {
                    fix = std::mem::take(&mut fix).and(part.start_byte(), part.end_byte(), name.clone());
                }
            }
        }
    });
    if fix == Fix::new() {
        return;
    }
    context.report_fixed("UnnecessaryOptionalGet", call, preferred(context, call), OPTIONAL_GET, &[fix]);
}
