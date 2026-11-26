//! Lines as javac writes them into a class file's line table, for findings SpotBugs places on the first
//! instruction of a method or on the first line of a class (the lowest line any of its methods has code on).
use super::super::Context;
use crate::engine::source::{children, named_children};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

fn first_part(node: Node) -> Option<Node> {
    named_children(node).into_iter().find(|part| !part.kind().ends_with("comment"))
}

/// The line javac gives an expression's code: the operator of an assignment or update, the `(` of a call.
fn expression_line(context: &Context, expression: Node) -> usize {
    match expression.kind() {
        "method_invocation" => expression.child_by_field_name("arguments").map_or_else(|| context.line(expression), |arguments| context.line(arguments)),
        "assignment_expression" => expression.child_by_field_name("operator").map_or_else(|| context.line(expression), |operator| context.line(operator)),
        "update_expression" => children(expression).into_iter().find(|part| !part.is_named()).map_or_else(|| context.line(expression), |operator| context.line(operator)),
        "parenthesized_expression" => first_part(expression).map_or_else(|| context.line(expression), |inner| expression_line(context, inner)),
        _ => context.line(expression),
    }
}

/// The line of the first instruction of a statement, if it makes any.
pub fn statement_start(context: &Context, statement: Node) -> Option<usize> {
    match statement.kind() {
        "block" | "constructor_body" => named_children(statement).into_iter().filter(|part| !part.kind().ends_with("comment")).find_map(|part| statement_start(context, part)),
        "labeled_statement" => named_children(statement).into_iter().skip(1).find_map(|part| statement_start(context, part)),
        "try_statement" => statement.child_by_field_name("body").and_then(|body| statement_start(context, body)),
        "do_statement" => statement.child_by_field_name("body").and_then(|body| statement_start(context, body)),
        "local_variable_declaration" => declarators(statement)
            .into_iter()
            .find(|declarator| declarator.child_by_field_name("value").is_some())
            .and_then(|declarator| declarator.child_by_field_name("name"))
            .map(|name| context.line(name)),
        "expression_statement" => first_part(statement).map(|expression| expression_line(context, expression)),
        "explicit_constructor_invocation" => statement.child_by_field_name("arguments").map(|arguments| context.line(arguments)),
        ";" | "empty_statement" | "line_comment" | "block_comment" => None,
        kind if TYPE_DECLARATIONS.contains(&kind) => None,
        _ => Some(context.line(statement)),
    }
}

/// The line of a method's first instruction: its first statement, or the closing brace of an empty body.
pub fn method_start(context: &Context, method: Node) -> Option<usize> {
    let body = method.child_by_field_name("body")?;
    statement_start(context, body).or_else(|| Some(context.line_at(body.end_byte().saturating_sub(1))))
}

/// The line of a constructor's first instruction: its `this(...)` or `super(...)` call, else the `{` of its body.
pub fn constructor_start(context: &Context, constructor: Node) -> Option<usize> {
    let body = constructor.child_by_field_name("body")?;
    let first = first_part(body).filter(|first| first.kind() == "explicit_constructor_invocation");
    Some(first.and_then(|first| statement_start(context, first)).unwrap_or_else(|| context.line(body)))
}

pub fn delegates(constructor: Node) -> bool {
    let first = constructor.child_by_field_name("body").and_then(first_part);
    first.is_some_and(|first| first.kind() == "explicit_constructor_invocation" && first.child_by_field_name("constructor").is_some_and(|called| called.kind() == "this"))
}

/// Whether a static field's initializer is a constant javac writes as an attribute instead of code.
fn constant(context: &Context, field: Node, value: Node) -> bool {
    let simple = field.child_by_field_name("type").is_some_and(|written| {
        matches!(written.kind(), "integral_type" | "floating_point_type" | "boolean_type") || matches!(context.text(written), "String" | "java.lang.String")
    });
    simple && has_modifier(field, "final") && context.resolver.constant_shape(value, &mut Vec::new())
}

/// The lines of the code a field declaration or initializer block adds to `<init>` or `<clinit>`.
fn initializer_lines(context: &Context, member: Node, interface: bool) -> Vec<usize> {
    match member.kind() {
        "field_declaration" | "constant_declaration" => {
            let is_static = interface || member.kind() == "constant_declaration" || has_modifier(member, "static");
            declarators(member)
                .into_iter()
                .filter(|declarator| declarator.child_by_field_name("value").is_some_and(|value| !(is_static && constant(context, member, value))))
                .filter_map(|declarator| declarator.child_by_field_name("name"))
                .map(|name| context.line(name))
                .collect()
        }
        "static_initializer" | "block" => statement_start(context, member).into_iter().collect(),
        "enum_constant" => vec![context.line(member)],
        _ => Vec::new(),
    }
}

/// Whether javac writes a bridge method into the class: a method overrides one of a supertype whose erased
/// parameters or result differ from its own.
fn bridges(context: &Context, own: &str) -> bool {
    let index = context.resolver.index;
    let Some(info) = index.get(own) else { return false };
    let lineage = index.lineage(own);
    info.methods.iter().filter(|method| !method.is_static && !method.is_private && !method.is_abstract && method.name != "<init>").any(|method| {
        lineage.iter().skip(1).filter_map(|ancestor| index.get(ancestor)).any(|above| {
            above.methods.iter().filter(|other| other.name == method.name && !other.is_static && !other.is_private && other.parameters.len() == method.parameters.len()).any(|other| {
                let overrides = other.parameters.iter().zip(&method.parameters).zip(&other.generic_parameters).all(|((theirs, ours), generic)| theirs == ours || generic.open());
                overrides && (other.parameters != method.parameters || other.returns != method.returns)
            })
        })
    })
}

/// Whether the class's own code holds an `assert`, which makes javac add code to its static initializer.
fn asserts(body: Node) -> bool {
    let mut stack = children(body);
    while let Some(node) = stack.pop() {
        if node.kind() == "assert_statement" {
            return true;
        }
        if node.kind() != "class_body" && !TYPE_DECLARATIONS.contains(&node.kind()) {
            stack.extend(children(node));
        }
    }
    false
}

/// The first line of a class as SpotBugs reports it: the lowest line of code in any of its methods, including
/// the constructors javac writes and the initializers it copies into them.
pub fn class_first(context: &Context, own: &str, class: Node, members: &[Node]) -> Option<usize> {
    let interface = matches!(class.kind(), "interface_declaration" | "annotation_type_declaration");
    let creates = ["constructor_declaration", "compact_constructor_declaration"];
    let constructors: Vec<Node> = members.iter().copied().filter(|member| creates.contains(&member.kind())).collect();
    let mut lines = Vec::new();
    let generated = matches!(class.kind(), "enum_declaration" | "record_declaration") || members.iter().any(|member| asserts(*member)) || bridges(context, own);
    if generated {
        lines.push(context.line(class));
    }
    let mut instance_code = constructors.is_empty() && !interface;
    for constructor in &constructors {
        lines.extend(constructor_start(context, *constructor));
        instance_code |= !delegates(*constructor);
    }
    if constructors.is_empty() && !interface && class.kind() != "enum_declaration" {
        lines.extend(class.child_by_field_name("name").map(|name| context.line(name)));
    }
    for member in members {
        let is_static = interface || matches!(member.kind(), "static_initializer" | "enum_constant" | "constant_declaration") || has_modifier(*member, "static");
        if member.kind() == "method_declaration" {
            lines.extend(method_start(context, *member));
        } else if is_static || instance_code {
            lines.extend(initializer_lines(context, *member, interface));
        }
    }
    lines.into_iter().min()
}
