//! The fix of UnnecessaryBoxedVariable: the primitive type, and the uses of the variable that need another spelling.
use super::Context;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::modifiers;
use crate::java::types::model::Type;
use tree_sitter::Node;

/// A replacement of a byte range.
pub type Edit = (usize, usize, String);

fn arguments<'t>(call: Node<'t>) -> Vec<Node<'t>> {
    call.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

/// The primitive a wrapper type stands for.
pub fn primitive_name(kind: Option<Type>) -> Option<&'static str> {
    match kind?.unboxed_or_same() {
        Type::Primitive(name) => Some(name),
        _ => None,
    }
}

/// `Integer.valueOf(text)` becomes `Integer.parseInt(text)` and `Integer.valueOf(number)` just the number; `new Integer(...)` likewise.
pub fn assignment_edits(context: &Context, expression: Node, value_of: bool) -> Vec<Edit> {
    let Some(unboxed) = primitive_name(context.resolver.type_of(expression)) else { return Vec::new() };
    let parse = format!("parse{}{}", unboxed[..1].to_ascii_uppercase(), &unboxed[1..]);
    let list = arguments(expression);
    let creation = expression.kind() == "object_creation_expression";
    if list.len() != 1 || !(creation || value_of) {
        return Vec::new();
    }
    let given = context.resolver.type_of(list[0]);
    let text = context.text(list[0]);
    if given.as_ref().is_some_and(|kind| kind.name() == "java.lang.String") {
        if creation {
            let boxed = qualify_type(context, expression, &format!("java.lang.{}", capitalized(unboxed)), &mut Fix::new());
            return vec![(expression.start_byte(), expression.end_byte(), format!("{boxed}.{parse}({text})"))];
        }
        return expression.child_by_field_name("name").map(|name| vec![(name.start_byte(), name.end_byte(), parse)]).unwrap_or_default();
    }
    if given == Some(Type::Primitive(unboxed)) {
        return vec![(expression.start_byte(), expression.end_byte(), text.to_string())];
    }
    Vec::new()
}

/// The simple name of the wrapper class of a primitive.
fn capitalized(primitive: &str) -> &'static str {
    match primitive {
        "int" => "Integer",
        "char" => "Character",
        "long" => "Long",
        "short" => "Short",
        "byte" => "Byte",
        "double" => "Double",
        "float" => "Float",
        _ => "Boolean",
    }
}

/// A null check on the variable: dropped as a statement, else replaced by its argument.
pub fn null_check_edit(context: &Context, call: Node) -> Option<Edit> {
    let first = arguments(call).into_iter().next()?;
    match parent(call).filter(|holder| holder.kind() == "expression_statement") {
        Some(statement) => Some((statement.start_byte(), statement.end_byte(), String::new())),
        None => Some((call.start_byte(), call.end_byte(), context.text(first).to_string())),
    }
}

/// `value.hashCode()` becomes `Integer.hashCode(value)`.
pub fn simple_call_edit(context: &Context, call: Node, receiver: Node) -> Option<Edit> {
    let Some(Type::Class(class, _)) = context.resolver.type_of(receiver) else { return None };
    let name = context.text(call.child_by_field_name("name")?);
    let simple = class.rsplit('.').next().unwrap_or(&class);
    Some((call.start_byte(), call.end_byte(), format!("{simple}.{name}({})", context.text(receiver))))
}

/// `value.intValue()` becomes `value`, `value.longValue()` becomes `(long) value`; as a statement it is dropped.
pub fn cast_call_edit(context: &Context, call: Node, receiver: Node) -> Option<Edit> {
    if let Some(statement) = parent(call).filter(|holder| holder.kind() == "expression_statement") {
        return Some((statement.start_byte(), statement.end_byte(), String::new()));
    }
    let name = context.text(call.child_by_field_name("name")?);
    let wanted = name.strip_suffix("Value")?;
    let own = primitive_name(context.resolver.type_of(receiver))?;
    let text = context.text(receiver);
    let replacement = if own == wanted { text.to_string() } else { format!("({wanted}) {text}") };
    Some((call.start_byte(), call.end_byte(), replacement))
}

/// The fix for one variable: its type, the edits its uses need, its initializer, and a `@Nullable` taken off.
pub fn variable_fix(context: &Context, declaration: Node, unboxed: &str, initializer: Option<Node>, value_of: bool, edits: &[Edit]) -> Fix {
    let mut fix = Fix::new();
    if let Some(kind) = declaration.child_by_field_name("type") {
        fix = fix.and(kind.start_byte(), kind.end_byte(), unboxed);
    }
    for (start, end, text) in edits {
        fix = fix.and(*start, *end, text.clone());
    }
    if let Some(value) = initializer {
        for (start, end, text) in assignment_edits(context, value, value_of) {
            fix = fix.and(start, end, text);
        }
    }
    if let Some(nullable) = nullable_annotation(context, declaration) {
        fix = fix.delete(nullable.start_byte(), nullable.end_byte());
    }
    fix
}

pub fn nullable_annotation<'t>(context: &Context, declaration: Node<'t>) -> Option<Node<'t>> {
    let list = modifiers(declaration)?;
    children(list).into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")).find(|annotation| {
        annotation.child_by_field_name("name").is_some_and(|name| context.text(name).rsplit('.').next() == Some("Nullable"))
    })
}
