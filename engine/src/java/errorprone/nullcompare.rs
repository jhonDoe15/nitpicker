//! ImpossibleNullComparison.
use super::donot::{considered_final, owner_type};
use super::fixes::Fix;
use super::nodes::position;
use super::vars::{Named, named};
use super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::types::expr::Call;
use crate::java::types::model::Type;
use tree_sitter::Node;

const PROTO: [&str; 2] = ["com.google.protobuf.GeneratedMessageLite", "com.google.protobuf.GeneratedMessage"];
const EXTENDABLE: &str = "com.google.protobuf.GeneratedMessage.ExtendableMessage";
const MESSAGE_OR_BUILDER: &str = "com.google.protobuf.MessageOrBuilder";
const EXTENSION_LITE: &str = "com.google.protobuf.ExtensionLite";
const FIELD_DESCRIPTOR: &str = "com.google.protobuf.Descriptors.FieldDescriptor";

#[derive(Clone, Copy)]
enum Fixer<'t> {
    Empty,
    OptionalGet(Node<'t>),
    GuavaOptionalGet(Node<'t>),
    Contains(Node<'t>, &'static str),
    Scalar(Node<'t>),
    Indexed(Node<'t>),
    Vector(Node<'t>),
    Extension(Node<'t>),
}

fn arguments(call: Node) -> Vec<Node> {
    call.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

fn resolved<'t>(context: &Context, node: Node<'t>) -> Option<(Call, String)> {
    if node.kind() != "method_invocation" {
        return None;
    }
    let call = context.resolver.resolve_call(node)?;
    let owner = owner_type(node, &call);
    Some((call, owner))
}

fn parameters(call: &Call) -> Vec<String> {
    call.method.parameters.iter().map(|kind| kind.name()).collect()
}

fn descends(context: &Context, owner: &str, classes: &[&str]) -> bool {
    classes.iter().any(|class| context.resolver.index.is_subtype(owner, class))
}

fn is_proto_call(context: &Context, node: Node) -> bool {
    resolved(context, node).is_some_and(|(call, owner)| !call.method.is_static && descends(context, &owner, &PROTO))
}

fn returns_list(context: &Context, node: Node) -> bool {
    matches!(context.resolver.type_of(node), Some(Type::Class(name, _)) if context.resolver.index.is_subtype(&name, "java.util.List"))
}

fn matches_fixer<'t>(context: &Context, tree: Node<'t>) -> Option<Fixer<'t>> {
    let index = context.resolver.index;
    if let Some((call, owner)) = resolved(context, tree) {
        let name = call.method.name.as_str();
        let instance = !call.method.is_static;
        let object = tree.child_by_field_name("object");
        let args = arguments(tree);
        if instance && owner == "java.util.Optional" && matches!(name, "get" | "orElseThrow") {
            return object.map(Fixer::OptionalGet);
        }
        if instance && owner == "com.google.common.base.Optional" && name == "get" {
            return object.map(Fixer::GuavaOptionalGet);
        }
        let contains = [("com.google.common.collect.Multimap", "get", "containsKey"), ("com.google.common.collect.Table", "row", "containsRow"), ("com.google.common.collect.Table", "column", "containsColumn")];
        for (class, method, replacement) in contains {
            if instance && name == method && index.is_subtype(&owner, class) {
                return object.map(|object| Fixer::Contains(object, replacement)).filter(|_| args.len() == 1);
            }
        }
    }
    if matches!(context.resolver.type_of(tree), Some(Type::Primitive(name)) if name != "void") {
        return Some(Fixer::Empty);
    }
    let (call, owner) = resolved(context, tree)?;
    let name = call.method.name.as_str();
    if call.method.is_static && name == "valueOf" && parameters(&call) == ["java.lang.String"] && descends(context, &owner, &["java.lang.Enum", "java.lang.Number"]) {
        return Some(Fixer::Empty);
    }
    if call.method.is_static || !descends(context, &owner, &PROTO) {
        return None;
    }
    let args = arguments(tree);
    let getter = tree.child_by_field_name("object").is_some() && name.starts_with("get");
    if args.is_empty() && !returns_list(context, tree) && getter {
        return Some(Fixer::Scalar(tree));
    }
    if args.len() == 1 && getter && matches!(context.resolver.type_of(args[0]), Some(Type::Primitive("int"))) {
        return Some(Fixer::Indexed(tree));
    }
    if args.is_empty() && returns_list(context, tree) && getter {
        return Some(Fixer::Vector(tree));
    }
    let params = parameters(&call);
    let no_fix = (descends(context, &owner, &[MESSAGE_OR_BUILDER]) && name == "getRepeatedField" && params == [FIELD_DESCRIPTOR, "int"])
        || (descends(context, &owner, &[EXTENDABLE]) && name == "getExtension" && params == [EXTENSION_LITE, "int"])
        || (descends(context, &owner, &[MESSAGE_OR_BUILDER]) && name == "getField" && params == [FIELD_DESCRIPTOR]);
    if no_fix {
        return Some(Fixer::Empty);
    }
    if descends(context, &owner, &[EXTENDABLE]) && name == "getExtension" && params == [EXTENSION_LITE] {
        let given = context.resolver.type_of(*args.first()?)?;
        return Some(match index.arguments_as(&given, EXTENSION_LITE) {
            Some(parts) if parts.len() == 2 && !matches!(&parts[1], Type::Class(item, _) if index.is_subtype(item, "java.util.List")) => Fixer::Extension(tree),
            _ => Fixer::Empty,
        });
    }
    None
}

fn replace_last(text: &str, pattern: &str, replacement: &str) -> String {
    match text.rfind(pattern) {
        Some(at) => format!("{}{}{}", &text[..at], replacement, &text[at + pattern.len()..]),
        None => text.to_string(),
    }
}

fn replacement(context: &Context, fixer: Fixer, negated: bool) -> Option<String> {
    let bang = if negated { "!" } else { "" };
    match fixer {
        Fixer::Empty => None,
        Fixer::OptionalGet(object) => Some(format!("{}{}", context.text(object), if negated { ".isEmpty()" } else { ".isPresent()" })),
        Fixer::GuavaOptionalGet(object) => Some(format!("{bang}{}.isPresent()", context.text(object))),
        Fixer::Contains(object, method) => {
            let call = parent(object)?;
            Some(format!("{bang}{}.{method}({})", context.text(object), context.text(*arguments(call).first()?)))
        }
        Fixer::Scalar(call) => {
            let name = context.text(call.child_by_field_name("name")?);
            let has = name.replacen("get", "has", 1);
            let receiver = context.resolver.type_of(call.child_by_field_name("object")?)?;
            if context.resolver.index.methods(&receiver.name(), &has).iter().all(|(_, method)| !method.parameters.is_empty()) {
                return None;
            }
            let text = replace_last(context.text(call), name, &has);
            Some(if negated { format!("!{text}") } else { text })
        }
        Fixer::Indexed(call) => {
            let name = context.text(call.child_by_field_name("name")?);
            Some(format!("{}.{name}Count() {} {}", context.text(call.child_by_field_name("object")?), if negated { "<=" } else { ">" }, context.text(*arguments(call).first()?)))
        }
        Fixer::Vector(call) => {
            let text = format!("{}.isEmpty()", context.text(call));
            Some(if negated { text } else { format!("!{text}") })
        }
        Fixer::Extension(call) => {
            let name = context.text(call.child_by_field_name("name")?);
            let text = replace_last(context.text(call), name, &name.replacen("get", "has", 1));
            Some(if negated { format!("!{text}") } else { text })
        }
    }
}

fn effective<'t>(context: &Context, tree: Node<'t>) -> Node<'t> {
    if tree.kind() != "identifier" {
        return tree;
    }
    let Some(Named::Variable(declarator)) = named(context, tree) else { return tree };
    let Some(value) = declarator.child_by_field_name("value") else { return tree };
    if declarator.start_byte() >= tree.start_byte() || !considered_final(context, declarator) {
        return tree;
    }
    let mut inner = value;
    loop {
        match inner.kind() {
            "parenthesized_expression" => match inner.named_child(0) {
                Some(next) => inner = next,
                None => return tree,
            },
            "cast_expression" => match inner.child_by_field_name("value") {
                Some(next) => inner = next,
                None => return tree,
            },
            "method_invocation" if is_proto_call(context, inner) => return inner,
            _ => return tree,
        }
    }
}

fn fixer_of<'t>(context: &Context, tree: Node<'t>) -> Option<Fixer<'t>> {
    matches_fixer(context, effective(context, tree))
}

fn report(context: &Context, node: Node, at: usize, fix: Fix) {
    if context.suppressed("ProtoFieldNullComparison", node) {
        return;
    }
    let fixes: Vec<Fix> = if fix == Fix::new() { Vec::new() } else { vec![fix] };
    context.report_fixed("ImpossibleNullComparison", node, at, "This value cannot be null, and comparing it to null may be misleading.", &fixes);
}

fn comparison(context: &Context, node: Node) {
    let (Some(left), Some(right), Some(operator)) = (node.child_by_field_name("left"), node.child_by_field_name("right"), node.child_by_field_name("operator")) else { return };
    let operator = context.text(operator);
    if !matches!(operator, "==" | "!=") {
        return;
    }
    let mut fixer = None;
    if left.kind() == "null_literal" {
        fixer = fixer_of(context, right);
    }
    if right.kind() == "null_literal" {
        fixer = fixer_of(context, left);
    }
    let Some(fixer) = fixer else { return };
    let fix = match replacement(context, fixer, operator == "==") {
        Some(text) => Fix::replace(node.start_byte(), node.end_byte(), text),
        None => Fix::new(),
    };
    report(context, node, position(node), fix);
}

fn is_unit(call: &Call, owner: &str, classes: &[&str], names: &[&str]) -> bool {
    call.method.is_static && classes.contains(&owner) && names.contains(&call.method.name.as_str())
}

fn invocation(context: &Context, node: Node) {
    let named = node.child_by_field_name("name").map(|name| context.text(name));
    if !matches!(named, Some("checkNotNull" | "verifyNotNull" | "requireNonNull" | "assertNotNull" | "ofNullable" | "fromNullable" | "isNotNull")) {
        return;
    }
    let Some((call, owner)) = resolved(context, node) else { return };
    let args = arguments(node);
    let name = call.method.name.as_str();
    let (argument, fix_for): (Node, u8) = if is_unit(&call, &owner, &["com.google.common.base.Preconditions"], &["checkNotNull"])
        || is_unit(&call, &owner, &["com.google.common.base.Verify"], &["verifyNotNull"])
        || is_unit(&call, &owner, &["java.util.Objects"], &["requireNonNull"])
    {
        let Some(first) = args.first() else { return };
        (*first, 0)
    } else if is_unit(&call, &owner, &["junit.framework.Assert", "org.junit.Assert"], &["assertNotNull"]) {
        let Some(last) = args.last() else { return };
        (*last, 1)
    } else if is_unit(&call, &owner, &["java.util.Optional"], &["ofNullable"]) || is_unit(&call, &owner, &["com.google.common.base.Optional"], &["fromNullable"]) {
        if args.len() != 1 {
            return;
        }
        (args[0], 2)
    } else if !call.method.is_static && name == "isNotNull" {
        let Some(receiver) = node.child_by_field_name("object").filter(|object| object.kind() == "method_invocation") else { return };
        let Some((inner, inner_owner)) = resolved(context, receiver) else { return };
        let truth = (inner.method.is_static && inner.method.name == "assertThat") || (!inner.method.is_static && inner.method.name == "that" && context.resolver.index.is_subtype(&inner_owner, "com.google.common.truth.StandardSubjectBuilder"));
        let inner_args = arguments(receiver);
        if !truth || inner_args.len() != 1 {
            return;
        }
        (inner_args[0], 3)
    } else {
        return;
    };
    let Some(fixer) = fixer_of(context, argument) else { return };
    let fix = match fix_for {
        0 => match parent(node) {
            Some(statement) if statement.kind() == "expression_statement" => Fix::new().delete(statement.start_byte(), statement.end_byte()),
            _ => Fix::replace(node.start_byte(), node.end_byte(), context.text(args[0])),
        },
        1 => match replacement(context, fixer, false) {
            Some(text) => {
                let start = node.start_byte();
                Fix::replace(argument.start_byte(), argument.end_byte(), text).and(start, start + "assertNotNull".len(), "assertTrue")
            }
            None => Fix::new(),
        },
        2 => match node.child_by_field_name("name") {
            Some(name) => Fix::replace(name.start_byte(), name.end_byte(), "of"),
            None => Fix::new(),
        },
        _ => match (replacement(context, fixer, false), node.child_by_field_name("object")) {
            (Some(text), Some(receiver)) => {
                let method_select = &context.file.text[receiver.start_byte()..receiver.child_by_field_name("arguments").map_or(receiver.end_byte(), |list| list.start_byte())];
                Fix::replace(node.start_byte(), node.end_byte(), format!("{method_select}({text}).isTrue()"))
            }
            _ => Fix::new(),
        },
    };
    report(context, node, position(node), fix);
}

fn switches(context: &Context, node: Node) {
    let Some(subject) = node.child_by_field_name("condition") else { return };
    let mut expression = subject;
    while expression.kind() == "parenthesized_expression" {
        match expression.named_child(0) {
            Some(inner) => expression = inner,
            None => return,
        }
    }
    let Some(body) = node.child_by_field_name("body") else { return };
    for case in children(body) {
        if !matches!(case.kind(), "switch_rule" | "switch_block_statement_group") {
            continue;
        }
        let Some(label) = children(case).into_iter().find(|part| part.kind() == "switch_label") else { continue };
        if !children(label).iter().any(|part| part.kind() == "null_literal") || fixer_of(context, expression).is_none() {
            continue;
        }
        report(context, case, case.start_byte(), Fix::new().delete(case.start_byte(), case.end_byte()));
    }
}

pub fn impossible_null_comparison(context: &Context, node: Node) {
    match node.kind() {
        "binary_expression" => comparison(context, node),
        "method_invocation" => invocation(context, node),
        "switch_expression" => switches(context, node),
        _ => {}
    }
}
