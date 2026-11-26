//! `TargetType.targetType`: the type the place of an expression asks for, for the places the checks here need.
use super::Context;
use crate::engine::source::{named_children, parent};
use crate::java::types::model::Type;
use tree_sitter::Node;

const NUMERIC: [&str; 7] = ["byte", "short", "char", "int", "long", "float", "double"];

pub fn is_numeric(kind: &Type) -> bool {
    matches!(kind, Type::Primitive(name) if NUMERIC.contains(name))
}

fn is_string(kind: &Type) -> bool {
    matches!(kind, Type::Class(name, _) if name == "java.lang.String")
}

fn is_boolean(kind: &Type) -> bool {
    *kind == Type::Primitive("boolean")
}

fn unary_promotion(kind: &Type) -> Option<Type> {
    let unboxed = kind.clone().unboxed_or_same();
    match unboxed {
        Type::Primitive("byte" | "short" | "char") => Some(Type::Primitive("int")),
        Type::Primitive("int" | "long" | "float" | "double") => Some(unboxed),
        _ => None,
    }
}

fn binary_promotion(left: &Type, right: &Type) -> Option<Type> {
    let (left, right) = (left.clone().unboxed_or_same(), right.clone().unboxed_or_same());
    if !is_numeric(&left) || !is_numeric(&right) {
        return None;
    }
    let has = |name: &str| left == Type::Primitive(name_static(name)) || right == Type::Primitive(name_static(name));
    Some(Type::Primitive(if has("double") {
        "double"
    } else if has("float") {
        "float"
    } else if has("long") {
        "long"
    } else {
        "int"
    }))
}

fn name_static(name: &str) -> &'static str {
    NUMERIC.iter().find(|known| **known == name).copied().unwrap_or("int")
}

fn equality(tree: Node, current: Node, left: &Type, right: &Type) -> Option<Type> {
    let (unboxed_left, unboxed_right) = (left.clone().unboxed_or_same(), right.clone().unboxed_or_same());
    let numeric = (is_numeric(left) && is_numeric(right)) || (is_numeric(left) != is_numeric(right) && (is_numeric(&unboxed_left) || is_numeric(&unboxed_right)));
    if numeric {
        return binary_promotion(&unboxed_left, &unboxed_right);
    }
    let (left_boolean, right_boolean) = (is_boolean(left), is_boolean(right));
    if (left_boolean && right_boolean) || (left_boolean != right_boolean && (is_boolean(&unboxed_left) || is_boolean(&unboxed_right))) {
        return Some(Type::Primitive("boolean"));
    }
    let left_side = tree.child_by_field_name("left").is_some_and(|side| side.id() == current.id());
    Some(if left_side { left.clone() } else { right.clone() })
}

fn binary(context: &Context, tree: Node, current: Node) -> Option<Type> {
    let left = context.resolver.type_of(tree.child_by_field_name("left")?)?;
    let right = context.resolver.type_of(tree.child_by_field_name("right")?)?;
    let operator = context.text(tree.child_by_field_name("operator")?);
    match operator {
        "+" | "-" | "*" | "/" | "%" | "<" | "<=" | ">" | ">=" | "&" | "^" | "|" => {
            if operator == "+" && (is_string(&left) || is_string(&right)) {
                return Some(Type::class("java.lang.String"));
            }
            if is_boolean(&left.clone().unboxed_or_same()) && is_boolean(&right.clone().unboxed_or_same()) {
                return Some(Type::Primitive("boolean"));
            }
            binary_promotion(&left, &right)
        }
        "==" | "!=" => equality(tree, current, &left, &right),
        "<<" | ">>" | ">>>" => unary_promotion(&context.resolver.type_of(current)?),
        _ => context.resolver.type_of(tree),
    }
}

/// The type an expression is converted to where it stands, `None` where no rule here applies.
pub fn target_type(context: &Context, node: Node) -> Option<Type> {
    let mut current = node;
    let mut up = parent(node)?;
    while up.kind() == "parenthesized_expression" {
        current = up;
        up = parent(up)?;
    }
    match up.kind() {
        "argument_list" | "variable_declarator" | "assignment_expression" | "return_statement" | "array_initializer" | "lambda_expression" => {
            if up.kind() == "assignment_expression" && context.text(up.child_by_field_name("operator")?) != "=" {
                return compound(context, up, current);
            }
            if up.kind() == "variable_declarator" && parent(up).and_then(|declaration| declaration.child_by_field_name("type")).is_some_and(|written| context.text(written) == "var") {
                return context.resolver.type_of(current);
            }
            context.resolver.expected(current)
        }
        "instanceof_expression" | "synchronized_statement" => Some(Type::class(crate::java::types::model::OBJECT)),
        "assert_statement" => {
            let condition = named_children(up).into_iter().next().is_some_and(|first| first.id() == current.id());
            Some(if condition { Type::Primitive("boolean") } else { Type::class("java.lang.String") })
        }
        "dimensions_expr" => Some(Type::Primitive("int")),
        "expression_statement" => {
            let rule = parent(up).filter(|rule| rule.kind() == "switch_rule")?;
            let switch = parent(rule).and_then(parent).filter(|switch| switch.kind() == "switch_expression")?;
            switch_type(context, switch)
        }
        "yield_statement" => {
            let switch = javac_up(javac_up(javac_up(up)?)?)?;
            let selector = (switch.kind() == "switch_expression").then(|| switch.child_by_field_name("condition")).flatten()?;
            context.resolver.type_of(selector)
        }
        "binary_expression" => binary(context, up, current),
        "cast_expression" => context.resolver.type_node(up.child_by_field_name("type")?),
        "unary_expression" | "update_expression" => context.resolver.type_of(up),
        "ternary_expression" => {
            if up.child_by_field_name("condition").is_some_and(|condition| condition.id() == current.id()) {
                Some(Type::Primitive("boolean"))
            } else {
                context.resolver.type_of(up)
            }
        }
        "array_access" => {
            if up.child_by_field_name("index").is_some_and(|index| index.id() == current.id()) {
                Some(Type::Primitive("int"))
            } else {
                context.resolver.type_of(up.child_by_field_name("array")?)
            }
        }
        "if_statement" | "while_statement" | "do_statement" => {
            up.child_by_field_name("condition").filter(|condition| condition.id() == current.id()).map(|_| Type::Primitive("boolean"))
        }
        _ => None,
    }
}

fn compound(context: &Context, tree: Node, current: Node) -> Option<Type> {
    let variable = context.resolver.type_of(tree.child_by_field_name("left")?)?;
    let expression = context.resolver.type_of(tree.child_by_field_name("right")?)?;
    let operator = context.text(tree.child_by_field_name("operator")?);
    if matches!(operator, "<<=" | ">>=" | ">>>=") && tree.child_by_field_name("right").is_some_and(|right| right.id() == current.id()) {
        return unary_promotion(&expression);
    }
    if operator == "+=" && is_string(&variable) {
        return Some(variable);
    }
    if is_boolean(&variable.clone().unboxed_or_same()) {
        return Some(Type::Primitive("boolean"));
    }
    binary_promotion(&variable, &expression)
}

/// The parent in javac's tree, which has no `switch_block` between a switch and its cases.
fn javac_up(node: Node) -> Option<Node> {
    let up = parent(node)?;
    if up.kind() == "switch_block" { parent(up) } else { Some(up) }
}

/// A switch expression is typed by its target when it has one, and stands alone otherwise.
fn switch_type(context: &Context, switch: Node) -> Option<Type> {
    context.resolver.expected(switch).or_else(|| context.resolver.type_of(switch))
}
