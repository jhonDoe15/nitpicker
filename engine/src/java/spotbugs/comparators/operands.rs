//! What the compiled code of a comparison looks like to SpotBugs: whether only its two operands are on the stack, how
//! javac branches on it, who each operand is and which place a report names for them.
use super::super::{Context, names};
use crate::engine::source::{named_children, parent};
use crate::java::types::expr::{Binding, Receiver, unwrap};
use crate::java::types::constant::Constant;
use crate::java::types::model::Type;
use tree_sitter::Node;

/// Whether javac evaluates `node` with nothing of the same statement left on the operand stack below it.
pub fn alone(context: &Context, node: Node) -> bool {
    let mut at = node;
    while let Some(up) = parent(at) {
        let first = |field: &str| up.child_by_field_name(field).is_some_and(|part| part.id() == at.id());
        match up.kind() {
            "parenthesized_expression" | "unary_expression" | "cast_expression" | "ternary_expression" => {}
            "binary_expression" if logical(context, up) => {}
            "binary_expression" if first("left") => {}
            "assignment_expression" if first("right") => {
                let simple = up.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=");
                let left = up.child_by_field_name("left").map(unwrap);
                let free = left.is_some_and(|left| match left.kind() {
                    "identifier" => !matches!(context.resolver.binding(left, context.text(left)), Some(Binding::Field(_, _, field)) if !(field.flags & crate::java::types::model::flag::STATIC != 0)),
                    "field_access" => matches!(left.child_by_field_name("object").and_then(|object| context.resolver.receiver(object)), Some(Receiver::Static(_))),
                    _ => false,
                });
                if !(simple && free) {
                    return false;
                }
            }
            "argument_list" => return static_first(context, up, at),
            "variable_declarator" | "expression_statement" | "return_statement" | "if_statement" | "while_statement" | "do_statement"
            | "for_statement" | "switch_expression" | "switch_statement" | "lambda_expression" | "yield_statement" => return true,
            "condition" | "parenthesized_condition" => {}
            _ => return false,
        }
        at = up;
    }
    true
}

fn logical(context: &Context, binary: Node) -> bool {
    binary.child_by_field_name("operator").is_some_and(|operator| matches!(context.text(operator), "&&" | "||"))
}

/// The first argument of a static call is the only one evaluated on an empty stack.
fn static_first(context: &Context, list: Node, argument: Node) -> bool {
    let first = named_children(list).into_iter().find(|part| !part.kind().ends_with("comment")).is_some_and(|part| part.id() == argument.id());
    let call = parent(list).filter(|call| call.kind() == "method_invocation");
    let called = call.and_then(|call| context.resolver.resolve_call(call));
    let statik = called.is_some_and(|called| called.method.detail.access & 8 != 0);
    first && statik && call.is_some_and(|call| alone(context, call))
}

pub fn negate(operator: &str) -> Option<&'static str> {
    Some(match operator {
        "<" => ">=",
        "<=" => ">",
        ">" => "<=",
        ">=" => "<",
        "==" => "!=",
        "!=" => "==",
        _ => return None,
    })
}

/// The value behind an operand once unboxing of its own type is seen through: `x` for `x > y` or
/// `x.doubleValue() > y` with `Double x`.
fn unboxed<'t>(context: &Context, operand: Node<'t>, kind: &str) -> (Node<'t>, bool) {
    let node = unwrap(operand);
    let own = context.resolver.type_of(node).map(|written| written.erased().name());
    if own.as_deref() == Some(boxes(kind)) {
        return (node, true);
    }
    let named = node.child_by_field_name("name").is_some_and(|name| context.text(name) == format!("{kind}Value"));
    let receiver = node.child_by_field_name("object").map(unwrap).filter(|_| node.kind() == "method_invocation" && named);
    let boxed = receiver.filter(|receiver| context.resolver.type_of(*receiver).is_some_and(|written| written.erased().name() == boxes(kind)));
    boxed.map_or((node, own.as_deref() == Some(kind)), |receiver| (receiver, true))
}

/// A bare name that is a record component read in a method that declares no local of that name.
fn component(context: &Context, node: Node) -> Option<(String, String)> {
    let body = crate::engine::source::ancestor(node, &["record_declaration", "class_body", "lambda_expression"])?;
    let record = if body.kind() == "class_body" { parent(body)? } else { body };
    (record.kind() == "record_declaration").then_some(())?;
    let name = context.text(node);
    let method = crate::engine::source::ancestor(node, &["method_declaration", "constructor_declaration", "compact_constructor_declaration"])?;
    let mut declared = Vec::new();
    super::floating::own_nodes(method, &mut declared);
    let shadowed = declared.iter().any(|part| matches!(part.kind(), "variable_declarator" | "formal_parameter" | "catch_formal_parameter") && part.child_by_field_name("name").is_some_and(|written| context.text(written) == name));
    let own = context.resolver.scope.names.get(&record.id())?;
    let listed = context.resolver.index.field(own, name).is_some();
    (!shadowed && listed).then(|| (own.clone(), name.to_string()))
}

enum Source {
    Field(String, String),
    Local(String),
    Call(crate::java::types::expr::Call),
    /// A boxed value other than a local, unboxed: SpotBugs names the unboxing method.
    Unboxed,
    Other,
}

fn source(context: &Context, node: Node, kind: &str) -> Source {
    let (node, typed) = unboxed(context, node, kind);
    if !typed || constant(context, node).is_some() {
        return Source::Other;
    }
    let local = node.kind() == "identifier" && matches!(context.resolver.binding(node, context.text(node)), Some(Binding::Local(_)));
    let boxed = context.resolver.type_of(node).is_some_and(|written| written.erased().name() == boxes(kind));
    if boxed && !local {
        return Source::Unboxed;
    }
    if node.kind() == "identifier" {
        if let Some((record, name)) = component(context, node) {
            return Source::Field(record, name);
        }
        if matches!(context.resolver.binding(node, context.text(node)), Some(Binding::Local(_))) {
            return Source::Local(context.text(node).to_string());
        }
    }
    if let Some(field) = super::super::fields::field_key(context, node).filter(|_| matches!(node.kind(), "identifier" | "field_access")) {
        return Source::Field(field.0, field.1);
    }
    match context.resolver.resolve_call(node).filter(|_| node.kind() == "method_invocation") {
        Some(call) => Source::Call(call),
        None => Source::Other,
    }
}

/// Who an operand is to SpotBugs: a constant by value, a local by name, a field with the local or `this` it was read
/// from, the method that returned it, or one shared name for anything computed.
pub fn identity(context: &Context, operand: Node, kind: &str) -> String {
    let (node, typed) = unboxed(context, operand, kind);
    if let Some(found) = constant(context, node) {
        let value = constant_value(found);
        return if kind == "float" { format!("const:{}", (value as f32).to_bits()) } else { format!("const:{}", value.to_bits()) };
    }
    if !typed {
        return "computed".to_string();
    }
    if node.kind() == "identifier" && component(context, node).is_some() {
        return format!("field:{}@this", context.text(node));
    }
    match node.kind() {
        "identifier" => match context.resolver.binding(node, context.text(node)) {
            Some(Binding::Local(_)) => format!("local:{}", context.text(node)),
            Some(Binding::Field(_, declaring, field)) if (field.flags & crate::java::types::model::flag::STATIC != 0) => format!("field:{}.{}", declaring.name, field.name),
            Some(Binding::Field(_, declaring, field)) => format!("field:{}.{}@this", declaring.name, field.name),
            None => "computed".to_string(),
        },
        "field_access" => {
            let Some((declaring, field)) = super::super::fields::field_key(context, node) else { return "computed".to_string() };
            let object = node.child_by_field_name("object").map(unwrap);
            let from = object.and_then(|object| match (object.kind(), context.resolver.receiver(object)) {
                (_, Some(Receiver::Static(_))) => Some(String::new()),
                ("this", _) => Some("@this".to_string()),
                ("identifier", _) => Some(format!("@{}", context.text(object))),
                _ => None,
            });
            format!("field:{declaring}.{field}{}", from.unwrap_or_else(|| "@?".to_string()))
        }
        "method_invocation" => context.resolver.resolve_call(node).map_or_else(
            || "computed".to_string(),
            |call| format!("call:{}.{}({:?})", call.declaring, call.method.name, call.method.parameters),
        ),
        _ => "computed".to_string(),
    }
}

/// A constant expression, also one that reads a `final` field of a source class given a constant: javac inlines it.
pub fn constant(context: &Context, node: Node) -> Option<Constant> {
    let node = unwrap(node);
    if let Some(found) = context.resolver.constant_number(node) {
        return Some(found);
    }
    let (declaring, name) = super::super::fields::field_key(context, node).filter(|_| matches!(node.kind(), "identifier" | "field_access"))?;
    let body = context.classes.get(&declaring)?.child_by_field_name("body")?;
    let members = super::super::place::members(body);
    let member = members.into_iter().filter(|member| matches!(member.kind(), "field_declaration" | "constant_declaration")).find(|member| {
        crate::java::helpers::declarators(*member).into_iter().any(|declarator| declarator.child_by_field_name("name").is_some_and(|written| context.text(written) == name))
    })?;
    let fixed = crate::java::helpers::has_modifier(member, "final") || member.kind() == "constant_declaration";
    let declarator = crate::java::helpers::declarators(member).into_iter().find(|declarator| declarator.child_by_field_name("name").is_some_and(|written| context.text(written) == name))?;
    declarator.child_by_field_name("value").filter(|_| fixed).and_then(|value| context.resolver.constant_number(unwrap(value)))
}

fn constant_value(constant: Constant) -> f64 {
    match constant {
        Constant::Int(value) => f64::from(value),
        Constant::Long(value) => value as f64,
        Constant::Float(value) => f64::from(value),
        Constant::Double(value) => value,
        Constant::Char(value) => f64::from(value),
        Constant::Bool(_) => f64::NAN,
    }
}

pub fn boxes(kind: &str) -> &'static str {
    if kind == "float" { "java.lang.Float" } else { "java.lang.Double" }
}

/// SpotBugs' name for a class in a method label: no `java.lang.` package.
fn shown_class(binary: &str) -> &str {
    binary.strip_prefix("java.lang.").filter(|rest| !rest.contains('.')).unwrap_or(binary)
}

/// The place a floating-point comparison is reported at: the field or local of either operand, the left one first;
/// else the method either one comes from; else the `compare` method SpotBugs suggests. A local is named under the
/// called method when there is one, else under the suggested method. Written `kind:fqn|package@name` for the
/// `shown` placement, with the package of the method's class as the report's directory.
pub fn place(context: &Context, own: &str, comparison: Node, kind: &str) -> String {
    let own_binary = names::binary(context, own);
    let package = names::package_of(&own_binary).to_string();
    let suggested = if kind == "float" { "Float.compare(float, float)" } else { "Double.compare(double, double)" };
    let sides: Vec<Source> = ["left", "right"].iter().filter_map(|side| comparison.child_by_field_name(side)).map(|side| source(context, side, kind)).collect();
    let unboxing = |kind: &str| {
        let holder = if kind == "float" { "Float" } else { "Double" };
        let signature = format!("{holder}.{kind}Value()");
        (signature.clone(), signature)
    };
    let called = sides.iter().find_map(|side| match side {
        Source::Unboxed => Some(unboxing(kind)),
        Source::Call(call) => {
            let binary = names::binary(context, &call.declaring);
            let holder = shown_class(&binary).to_string();
            let shown: Vec<String> = call.method.parameters.iter().map(|parameter| names::simple(context, parameter)).collect();
            let signature = format!("{}({})", call.method.name, shown.join(", "));
            let name = if binary == own_binary { signature.clone() } else { format!("{}.{signature}", relative(&holder, &package)) };
            Some((format!("{holder}.{signature}"), name))
        }
        _ => None,
    });
    for side in &sides {
        match side {
            Source::Field(declaring, name) => {
                let holder = names::binary(context, declaring);
                return format!("member:{own_binary}.{name}@{}.{name}", relative(&holder, &package));
            }
            Source::Local(name) => {
                let method = called.as_ref().map_or(suggested, |(qualified, _)| qualified.as_str());
                return format!("variable:{method}#{name}|{package}@{name}");
            }
            _ => {}
        }
    }
    match called {
        Some((qualified, name)) => format!("function:{qualified}|{package}@{name}"),
        None => format!("function:{suggested}|{package}@{suggested}"),
    }
}

fn relative<'b>(binary: &'b str, package: &str) -> &'b str {
    binary.strip_prefix(package).and_then(|rest| rest.strip_prefix('.')).filter(|_| !package.is_empty()).unwrap_or(binary)
}

/// The floating-point type a comparison is made in, if any: `double` when either side is a `double`, else `float`.
pub fn floating(context: &Context, comparison: Node) -> Option<&'static str> {
    let sides: Vec<Option<String>> = ["left", "right"]
        .iter()
        .map(|side| comparison.child_by_field_name(side).and_then(|side| context.resolver.type_of(side)).map(|kind| primitive(&kind)))
        .collect();
    let named = |kind: &str| sides.iter().any(|side| side.as_deref() == Some(kind));
    if sides.iter().any(Option::is_none) {
        return None;
    }
    if named("double") {
        Some("double")
    } else if named("float") {
        Some("float")
    } else {
        None
    }
}

/// A primitive type, or the one a boxed type unboxes to.
pub fn primitive(kind: &Type) -> String {
    let name = kind.erased().name();
    match name.as_str() {
        "java.lang.Double" => "double".to_string(),
        "java.lang.Float" => "float".to_string(),
        "java.lang.Integer" => "int".to_string(),
        "java.lang.Long" => "long".to_string(),
        "java.lang.Character" => "char".to_string(),
        "java.lang.Short" => "short".to_string(),
        "java.lang.Byte" => "byte".to_string(),
        _ => name,
    }
}

/// The comparison operators.
pub fn comparison(context: &Context, node: Node) -> bool {
    node.kind() == "binary_expression"
        && node.child_by_field_name("operator").is_some_and(|operator| matches!(context.text(operator), "<" | "<=" | ">" | ">=" | "==" | "!="))
}
