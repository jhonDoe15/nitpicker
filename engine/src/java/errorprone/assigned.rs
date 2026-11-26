//! Checks on the value given to a variable or returned from a method.
use super::Context;
use super::fixes::Fix;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::Type;
use tree_sitter::Node;

const BLOCKS: &[&str] = &["block", "constructor_body", "switch_block_statement_group"];
const BOXES: &[(&str, &str)] = &[
    ("java.lang.Integer", "int"),
    ("java.lang.Long", "long"),
    ("java.lang.Boolean", "boolean"),
    ("java.lang.Character", "char"),
    ("java.lang.Byte", "byte"),
    ("java.lang.Short", "short"),
    ("java.lang.Float", "float"),
    ("java.lang.Double", "double"),
];

fn parts(node: Node) -> Vec<Node> {
    named_children(node)
        .into_iter()
        .filter(|part| !part.kind().ends_with("comment"))
        .collect()
}

/// The expression a return statement, a plain assignment or a declarator hands on.
fn handed<'t>(context: &Context, node: Node<'t>) -> Option<Node<'t>> {
    match node.kind() {
        "return_statement" => parts(node).into_iter().next(),
        "assignment_expression" => node
            .child_by_field_name("operator")
            .filter(|operator| context.text(*operator) == "=")
            .and(node.child_by_field_name("right")),
        "variable_declarator" => node.child_by_field_name("value"),
        _ => None,
    }
}

pub fn unnecessary_boxed_assignment(context: &Context, node: Node) {
    let Some(call) = handed(context, node).filter(|value| value.kind() == "method_invocation")
    else {
        return;
    };
    if !call
        .child_by_field_name("name")
        .is_some_and(|name| context.text(name) == "valueOf")
    {
        return;
    }
    let Some(list) = call.child_by_field_name("arguments") else {
        return;
    };
    let arguments = parts(list);
    if arguments.len() != 1 {
        return;
    }
    let Some(resolved) = context
        .resolver
        .resolve_call(call)
        .filter(|resolved| resolved.method.is_static)
    else {
        return;
    };
    let Some((_, primitive)) = BOXES.iter().find(|(class, _)| *class == resolved.declaring) else {
        return;
    };
    let Some(given) = context.resolver.type_of(arguments[0]) else {
        return;
    };
    if given.unboxed_or_same() == Type::Primitive(primitive) {
        let fix = Fix::replace(call.start_byte(), call.end_byte(), context.text(arguments[0]));
        context.report_fixed("UnnecessaryBoxedAssignment", node, list.start_byte(), "This expression can be implicitly boxed.", &[fix]);
    }
}

fn long(kind: Option<Type>) -> bool {
    kind == Some(Type::Primitive("long"))
}

fn wants_long(context: &Context, node: Node) -> bool {
    let resolver = context.resolver;
    match node.kind() {
        "assignment_expression" => long(
            node.child_by_field_name("left")
                .and_then(|left| resolver.type_of(left)),
        ),
        "variable_declarator" => parent(node)
            .is_some_and(|declaration| long(resolver.declared_type(declaration, Some(node)))),
        _ => {
            let mut at = parent(node);
            while let Some(holder) = at {
                match holder.kind() {
                    "method_declaration" => {
                        return holder
                            .child_by_field_name("type")
                            .is_some_and(|kind| long(resolver.type_node(kind)));
                    }
                    "lambda_expression" => {
                        let target = resolver.type_of(holder);
                        return target
                            .and_then(|target| resolver.index.functional_method(&target.name()))
                            .is_some_and(|(_, method)| long(Some(method.returns.clone())));
                    }
                    _ => at = parent(holder),
                }
            }
            false
        }
    }
}

/// The declaration of a local variable of this name that is in scope at the usage.
fn local<'t>(context: &Context, usage: Node<'t>, name: &str) -> Option<(Node<'t>, Node<'t>)> {
    let mut inner = usage;
    let mut at = parent(usage);
    while let Some(holder) = at {
        if super::members::BODIES.contains(&holder.kind()) {
            return None;
        }
        if BLOCKS.contains(&holder.kind()) {
            for statement in children(holder)
                .into_iter()
                .take_while(|statement| *statement != inner)
            {
                if statement.kind() != "local_variable_declaration" {
                    continue;
                }
                let named = declarators(statement).into_iter().find(|declarator| {
                    declarator
                        .child_by_field_name("name")
                        .is_some_and(|own| context.text(own) == name)
                });
                if let Some(declarator) = named {
                    return Some((statement, declarator));
                }
            }
        }
        inner = holder;
        at = parent(holder);
    }
    None
}

fn constant(context: &Context, expression: Node) -> bool {
    match expression.kind() {
        "decimal_integer_literal"
        | "hex_integer_literal"
        | "octal_integer_literal"
        | "binary_integer_literal"
        | "decimal_floating_point_literal"
        | "hex_floating_point_literal"
        | "character_literal"
        | "string_literal"
        | "true"
        | "false" => true,
        "parenthesized_expression"
        | "binary_expression"
        | "ternary_expression"
        | "unary_expression" => parts(expression)
            .into_iter()
            .all(|part| constant(context, part)),
        "cast_expression" => {
            let simple = expression
                .child_by_field_name("type")
                .is_some_and(|written| {
                    matches!(
                        written.kind(),
                        "integral_type" | "floating_point_type" | "boolean_type"
                    ) || matches!(context.text(written), "String" | "java.lang.String")
                });
            simple
                && expression
                    .child_by_field_name("value")
                    .is_some_and(|value| constant(context, value))
        }
        "identifier" => {
            if context.resolver.constant_field(expression) {
                return true;
            }
            local(context, expression, context.text(expression)).is_some_and(
                |(declaration, declarator)| {
                    has_modifier(declaration, "final")
                        && declarator
                            .child_by_field_name("value")
                            .is_some_and(|value| constant(context, value))
                },
            )
        }
        "field_access" | "scoped_identifier" => context.resolver.constant_field(expression),
        _ => false,
    }
}

/// An `int` literal operand gets an `L`, else the left operand a `(long)` cast.
fn widening_fix<'t>(context: &Context, operation: Node<'t>) -> Fix {
    let int_literal = |operand: Option<Node<'t>>| {
        operand.filter(|operand| {
            matches!(operand.kind(), "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal")
                && !context.text(*operand).ends_with(['l', 'L'])
        })
    };
    let left = operation.child_by_field_name("left");
    if let Some(literal) = int_literal(left).or_else(|| int_literal(operation.child_by_field_name("right"))) {
        return Fix::new().insert(literal.end_byte(), "L");
    }
    Fix::new().insert(left.map_or(operation.start_byte(), |left| left.start_byte()), "(long) ")
}

pub fn int_long_math(context: &Context, node: Node) {
    let Some(value) = handed(context, node).filter(|value| {
        matches!(
            value.kind(),
            "binary_expression" | "parenthesized_expression"
        )
    }) else {
        return;
    };
    let mut innermost = None;
    let mut nested = value;
    loop {
        while nested.kind() == "parenthesized_expression" {
            let Some(inner) = parts(nested).into_iter().next() else {
                return;
            };
            nested = inner;
        }
        if nested.kind() != "binary_expression" {
            break;
        }
        let operator = nested
            .child_by_field_name("operator")
            .map(|operator| context.text(operator))
            .unwrap_or_default();
        if !matches!(operator, "/" | "%" | "&" | "^" | "|" | ">>") {
            innermost = Some(nested);
        }
        let Some(left) = nested.child_by_field_name("left") else {
            return;
        };
        nested = left;
    }
    if innermost.is_none() || !wants_long(context, node) || constant(context, value) {
        return;
    }
    if context.resolver.type_of(value) != Some(Type::Primitive("int")) {
        return;
    }
    let at = if value.kind() == "binary_expression" {
        value
            .child_by_field_name("operator")
            .map_or(value.start_byte(), |operator| operator.start_byte())
    } else {
        value.start_byte()
    };
    let fix = widening_fix(context, innermost.expect("an inner operation"));
    context.report_fixed("IntLongMath", node, at, "Expression of type int may overflow before being assigned to a long", &[fix]);
}

fn target_name<'f>(context: &'f Context, node: Node) -> Option<&'f str> {
    let field = match node.kind() {
        "assignment_expression" => "left",
        "update_expression" => {
            return parts(node)
                .into_iter()
                .next()
                .filter(|operand| operand.kind() == "identifier")
                .map(|operand| context.text(operand));
        }
        _ => return None,
    };
    node.child_by_field_name(field)
        .filter(|left| left.kind() == "identifier")
        .map(|left| context.text(left))
}

/// Deletes the declaration and writes its modifiers and type before the one assignment.
fn inline_fix(context: &Context, declaration: Node, declarator: Node, assignment: Node) -> Fix {
    let names = declarators(declaration);
    let end = match children(declaration).into_iter().find(|part| part.kind() == "," && part.start_byte() >= declarator.end_byte()) {
        Some(comma) if names.last() != Some(&declarator) => comma.end_byte(),
        _ => declaration.end_byte(),
    };
    let modifiers = crate::java::helpers::modifiers(declaration).map(|modifiers| format!("{} ", context.text(modifiers))).unwrap_or_default();
    let written = declaration.child_by_field_name("type").map(|kind| context.text(kind)).unwrap_or_default();
    Fix::replace(declaration.start_byte(), end, "").insert(assignment.start_byte(), format!("{modifiers}{written} "))
}

pub fn initialize_inline(context: &Context, node: Node) {
    if node.kind() != "local_variable_declaration" {
        return;
    }
    let Some(holder) = parent(node).filter(|holder| BLOCKS.contains(&holder.kind())) else {
        return;
    };
    for declarator in declarators(node) {
        let Some(name) = declarator
            .child_by_field_name("name")
            .filter(|_| declarator.child_by_field_name("value").is_none())
        else {
            continue;
        };
        let text = context.text(name);
        let mut plain = Vec::new();
        let mut changed = false;
        let mut stack = vec![holder];
        while let Some(at) = stack.pop() {
            if at.kind() == "class_body" {
                continue;
            }
            if target_name(context, at) == Some(text) {
                let simple = at.kind() == "assignment_expression"
                    && at
                        .child_by_field_name("operator")
                        .is_some_and(|operator| context.text(operator) == "=");
                if simple {
                    plain.push(at)
                } else {
                    changed = true
                }
            }
            stack.extend(children(at));
        }
        let direct = plain.len() == 1
            && parent(plain[0]).is_some_and(|statement| match statement.kind() {
                "expression_statement" => parent(statement) == Some(holder),
                "variable_declarator" => parent(statement).is_some_and(|declaration| declaration.kind() == "local_variable_declaration" && parent(declaration) == Some(holder)),
                _ => false,
            });
        if direct && !changed {
            let fix = inline_fix(context, node, declarator, plain[0]);
            context.report_fixed(
                "InitializeInline",
                declarator,
                name.start_byte(),
                "Initializing variables in their declaring statement is clearer, where possible.",
                &[fix],
            );
        }
    }
}
