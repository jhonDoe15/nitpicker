//! BoxedPrimitiveConstructor: `new Integer(x)` and friends, with the fixes Error Prone builds around the creation.
use super::Context;
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::positions::arguments;
use super::target::target_type;
use crate::engine::source::{named_children, parent};
use crate::java::types::model::Type;
use tree_sitter::Node;

const NAME: &str = "BoxedPrimitiveConstructor";
const MESSAGE: &str = "valueOf or autoboxing provides better time and space performance";
const BOXES: [(&str, &str); 8] = [
    ("java.lang.Byte", "byte"),
    ("java.lang.Character", "char"),
    ("java.lang.Short", "short"),
    ("java.lang.Integer", "int"),
    ("java.lang.Long", "long"),
    ("java.lang.Double", "double"),
    ("java.lang.Float", "float"),
    ("java.lang.Boolean", "boolean"),
];

/// A node of javac's tree: tree-sitter nodes, plus the method select javac keeps between a call and its receiver.
#[derive(Clone, Copy)]
enum Javac<'t> {
    Node(Node<'t>),
    Select(Node<'t>),
}

fn javac_parent<'t>(at: Javac<'t>) -> Option<Javac<'t>> {
    match at {
        Javac::Select(call) => Some(Javac::Node(call)),
        Javac::Node(node) => {
            let up = parent(node)?;
            if up.kind() == "argument_list" {
                return Some(Javac::Node(parent(up)?));
            }
            if up.kind() == "method_invocation" && up.child_by_field_name("object") == Some(node) {
                return Some(Javac::Select(up));
            }
            Some(Javac::Node(up))
        }
    }
}

impl Javac<'_> {
    fn start(&self) -> usize {
        match self {
            Javac::Node(node) => node.start_byte(),
            Javac::Select(call) => call.child_by_field_name("object").unwrap_or(*call).start_byte(),
        }
    }

    fn end(&self) -> usize {
        match self {
            Javac::Node(node) => node.end_byte(),
            Javac::Select(call) => call.child_by_field_name("name").map_or(call.end_byte(), |name| name.end_byte()),
        }
    }
}

enum Status {
    None,
    PrimitiveDoubleIntoFloat,
    BoxedDoubleIntoFloat,
}

fn status(unboxed: &Type, argument: Option<&Type>) -> Status {
    if *unboxed != Type::Primitive("float") {
        return Status::None;
    }
    match argument {
        Some(Type::Class(name, _)) if name == "java.lang.Double" => Status::BoxedDoubleIntoFloat,
        Some(Type::Primitive("double")) => Status::PrimitiveDoubleIntoFloat,
        _ => Status::None,
    }
}

fn autobox_fix(creation: Node) -> bool {
    let Some(up) = parent(creation) else { return true };
    match up.kind() {
        "argument_list" => parent(up).is_some_and(|owner| !matches!(owner.kind(), "method_invocation" | "explicit_constructor_invocation")),
        "method_invocation" => up.child_by_field_name("object") != Some(creation),
        "field_access" | "cast_expression" => false,
        _ => true,
    }
}

fn literal_fix(value: bool, autobox: bool) -> &'static str {
    match (autobox, value) {
        (true, true) => "true",
        (true, false) => "false",
        (false, true) => "Boolean.TRUE",
        (false, false) => "Boolean.FALSE",
    }
}

fn maybe_cast(context: &Context, creation: Node, unboxed: &Type, argument: Option<&Type>) -> String {
    if matches!(status(unboxed, argument), Status::PrimitiveDoubleIntoFloat) {
        return "(float) ".to_string();
    }
    match (target_type(context, creation), argument) {
        (Some(target), Some(argument)) if argument != unboxed && target != *unboxed => format!("({}) ", unboxed.name()),
        _ => String::new(),
    }
}

/// Whether the call is an instance call of the given name with no parameters (`count` 0) or one argument.
fn method_named(context: &Context, at: Javac, names: &[&str], parameters: usize) -> bool {
    let call = match at {
        Javac::Node(node) if node.kind() == "method_invocation" => node,
        Javac::Select(call) => call,
        Javac::Node(node) if node.kind() == "method_reference" => {
            return parameters == 0 && named_children(node).last().is_some_and(|name| names.contains(&context.text(*name)));
        }
        _ => return false,
    };
    if !call.child_by_field_name("name").is_some_and(|name| names.contains(&context.text(name))) {
        return false;
    }
    context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static && resolved.method.parameters.len() == parameters)
}

fn build_fix(context: &Context, creation: Node, unboxed: &Type, type_name: &str) -> Option<Fix> {
    let list = arguments(creation);
    let argument = *list.first()?;
    let autobox = autobox_fix(creation);
    if *unboxed == Type::Primitive("boolean") {
        let value = match argument.kind() {
            "true" => Some(true),
            "false" => Some(false),
            "string_literal" => match constant(context, argument) {
                Some(Const::Str(text)) => Some(text.eq_ignore_ascii_case("true")),
                _ => None,
            },
            _ => None,
        };
        if let Some(value) = value {
            return Some(Fix::replace(creation.start_byte(), creation.end_byte(), literal_fix(value, autobox)));
        }
    }
    let argument_type = context.resolver.type_of(argument);
    let (start, end) = (argument.start_byte(), argument.end_byte());
    if autobox && matches!(argument_type, Some(Type::Primitive(_))) {
        let cast = maybe_cast(context, creation, unboxed, argument_type.as_ref());
        return Some(Fix::replace(creation.start_byte(), start, cast).and(end, creation.end_byte(), ""));
    }
    let grand = javac_parent(Javac::Node(creation)).and_then(javac_parent);
    let state = status(unboxed, argument_type.as_ref());
    let (cast, suffix) = match state {
        Status::PrimitiveDoubleIntoFloat => ("(float) ", ""),
        Status::BoxedDoubleIntoFloat => ("", ".floatValue()"),
        Status::None => ("", ""),
    };
    if let Some(grand) = grand {
        if method_named(context, grand, &["toString"], 0) {
            return Some(Fix::replace(grand.start(), start, "String.valueOf(").and(end, grand.end(), ")"));
        }
        if method_named(context, grand, &["hashCode"], 0) {
            return Some(Fix::replace(grand.start(), start, format!("{type_name}.hashCode({cast}")).and(end, grand.end(), format!("{suffix})")));
        }
        if let Javac::Node(call) = grand {
            let direct = call.kind() == "method_invocation" && call.child_by_field_name("object") == Some(creation);
            let comparable = direct && method_named(context, grand, &["compareTo"], 1);
            if comparable {
                let right = *arguments(call).first()?;
                let fix = Fix::replace(call.start_byte(), start, format!("{type_name}.compare({cast}"))
                    .and(end, right.start_byte(), format!("{suffix}, "))
                    .and(right.end_byte(), call.end_byte(), ")");
                return Some(fix);
            }
        }
    }
    let (prefix, tail) = match state {
        Status::PrimitiveDoubleIntoFloat => (format!("{type_name}.valueOf((float) "), ""),
        Status::BoxedDoubleIntoFloat => (String::new(), ".floatValue("),
        Status::None => (format!("{type_name}.valueOf("), ""),
    };
    Some(Fix::replace(creation.start_byte(), start, prefix).and(end, end, tail))
}

pub fn boxed_primitive_constructor(context: &Context, creation: Node) {
    if creation.kind() != "object_creation_expression" || creation.child_by_field_name("arguments").is_none() {
        return;
    }
    let Some(written) = creation.child_by_field_name("type") else { return };
    let Some(made) = context.resolver.type_node(written) else { return };
    let Some((_, primitive)) = BOXES.iter().find(|(class, _)| made.name() == *class) else { return };
    let unboxed = Type::Primitive(primitive);
    let type_name = context.text(written);
    let fixes: Vec<Fix> = build_fix(context, creation, &unboxed, type_name).into_iter().collect();
    context.report_fixed(NAME, creation, creation.start_byte(), MESSAGE, &fixes);
}
