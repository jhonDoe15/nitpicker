//! ObjectToString: a value of a final class that does not override `toString` is turned into a string.
use super::Context;
use super::mirror_to_string::{SYMBOL, TYPE as TYPE_NAME, matches_mirror, type_fix};
use super::shape::{arguments, preferred};
use crate::engine::source::children;
use crate::java::types::model::{OBJECT, Type, flag};
use tree_sitter::Node;

const NAME: &str = "ObjectToString";
const STREAM_NAME: &str = "StreamToString";
const STREAM: &str = "java.util.stream.Stream";
const STRING: &str = "java.lang.String";
const FORMAT_METHOD: &str = "com.google.errorprone.annotations.FormatMethod";
const PRINT_NAMES: [&str; 3] = ["print", "println", "append"];

/// `SuggestedFixes.qualifyType` for a class: from the innermost class out, up to the first name that is visible.
pub(super) fn qualify_type(context: &Context, at: Node, qualified: &str) -> String {
    let parts: Vec<&str> = qualified.split('.').collect();
    let first = parts.iter().position(|part| part.starts_with(char::is_uppercase)).unwrap_or(parts.len() - 1);
    let mut names: Vec<&str> = Vec::new();
    for position in (first..parts.len()).rev() {
        names.insert(0, parts[position]);
        let found = context.resolver.class_name(at, parts[position]);
        if found.as_deref() == Some(&parts[..=position].join(".")) {
            break;
        }
        if position == first {
            if found.is_some() || context.resolver.is_variable(at, parts[position]) {
                names.splice(0..0, parts[..first].iter().copied());
            }
            break;
        }
    }
    names.join(".")
}

/// The type the way `SuggestedFixes.prettyType` prints it.
pub(super) fn pretty(context: &Context, at: Node, kind: &Type) -> String {
    match kind {
        Type::Class(name, shown) if !shown.is_empty() => {
            let parts: Vec<String> = shown.iter().map(|part| pretty(context, at, part)).collect();
            format!("{}<{}>", qualify_type(context, at, name), parts.join(", "))
        }
        Type::Class(name, _) => qualify_type(context, at, name),
        Type::Array(element) => format!("{}[]", pretty(context, at, element)),
        Type::Wildcard => "?".to_string(),
        other => other.name(),
    }
}

/// A final class whose supertypes, interfaces included, never declare a `toString` of their own.
fn plain_final(context: &Context, kind: &Type) -> bool {
    let Type::Class(name, _) = kind else { return false };
    let index = context.resolver.index;
    let Some(info) = index.get(name).filter(|info| info.flags & flag::FINAL != 0 && info.flags & flag::RECORD == 0) else { return false };
    if info.name.contains('&') || !index.complete(name) {
        return false;
    }
    !index.lineage(name).iter().filter(|above| above.as_str() != OBJECT).filter_map(|above| index.get(above)).any(|above| {
        above.methods.iter().any(|method| method.name == "toString" && method.parameters.is_empty() && !method.is_static)
    })
}

/// Which of the two checks built on the same walk is running.
#[derive(Clone, Copy, PartialEq)]
enum Mode {
    Object,
    Stream,
    LiteProto,
    Symbol,
    Type,
}

fn matches_type(context: &Context, matched: Node, kind: &Type, mode: Mode) -> bool {
    match mode {
        Mode::Symbol | Mode::Type => matches_mirror(context, matched, kind, mode == Mode::Symbol),
        Mode::Object => plain_final(context, kind),
        Mode::Stream => matches!(kind, Type::Class(name, _) if name == STREAM || context.resolver.index.is_subtype(name, STREAM)),
        Mode::LiteProto => lite_proto(context, kind).is_some(),
    }
}

fn descends(context: &Context, name: &str, above: &str) -> bool {
    name == above || context.resolver.index.is_subtype(name, above)
}

/// `Some(true)` for a lite proto enum, `Some(false)` for a lite proto message.
fn lite_proto(context: &Context, kind: &Type) -> Option<bool> {
    let Type::Class(name, _) = kind else { return None };
    let message = descends(context, name, "com.google.protobuf.MessageLite") && !descends(context, name, "com.google.protobuf.Message") && name != "com.google.protobuf.UnknownFieldSet";
    if message {
        return Some(false);
    }
    let lite_enum = descends(context, name, "com.google.protobuf.Internal.EnumLite")
        && !descends(context, name, "com.google.protobuf.ProtocolMessageEnum")
        && !descends(context, name, "com.google.protobuf.Descriptors.EnumValueDescriptor")
        && !descends(context, name, "com.google.protobuf.AbstractMessageLite.InternalOneOfEnum");
    lite_enum.then_some(true)
}

const STRIPPED_LOG_METHODS: [&str; 10] = ["atVerbose", "atFine", "atFiner", "atFinest", "atDebug", "atConfig", "atInfo", "v", "d", "i"];

/// Whether the matched tree or one of its ancestors is a call chain that goes through a log method the optimizer strips.
fn stripped_log_message(context: &Context, matched: Node) -> bool {
    let mut current = Some(matched);
    while let Some(at) = current {
        let mut chain = Some(at);
        while let Some(call) = chain.filter(|call| call.kind() == "method_invocation") {
            if call.child_by_field_name("name").is_some_and(|name| STRIPPED_LOG_METHODS.contains(&context.text(name))) {
                return true;
            }
            chain = call.child_by_field_name("object");
        }
        current = crate::engine::source::parent(at);
    }
    false
}

fn report(context: &Context, matched: Node, at: Node, kind: &Type, mode: Mode, explicit: bool) {
    if mode == Mode::LiteProto {
        if stripped_log_message(context, matched) {
            return;
        }
        let message = if lite_proto(context, kind) == Some(true) {
            "toString() on lite proto enums will generate different representations of the value from development and optimized builds. Consider using #getNumber if you only need a serialized representation of the value, or #name if you really need the name."
        } else {
            "toString() on lite protos will not generate a useful representation of the proto from optimized builds. Consider whether using some subset of fields instead would provide useful information."
        };
        return context.report_fixed("LiteProtoToString", matched, preferred(at), message, &[]);
    }
    if matches!(mode, Mode::Symbol | Mode::Type) {
        let (name, shown) = if mode == Mode::Symbol { (SYMBOL, "Element") } else { (TYPE_NAME, "TypeMirror") };
        let message = format!("{shown}#toString shouldn't be used as it is expensive and fragile.");
        let fixes: Vec<_> = if mode == Mode::Type && explicit { type_fix(context, matched, at).into_iter().collect() } else { Vec::new() };
        return context.report_fixed(name, matched, preferred(at), &message, &fixes);
    }
    if mode == Mode::Stream {
        let message = "Calling toString on a Stream does not provide useful information";
        return context.report_fixed(STREAM_NAME, matched, preferred(at), message, &[]);
    }
    let Type::Class(name, _) = kind else { return };
    let simple = name.rsplit('.').next().unwrap_or(name);
    let shown = pretty(context, matched, kind);
    let message = format!(
        "{shown} is final and does not override Object.toString, so converting it to a string will print its identity (e.g. `{simple}@4488aabb`) instead of useful information."
    );
    context.report_fixed(NAME, matched, preferred(at), &message, &[]);
}

fn handle(context: &Context, matched: Node, stringified: Node, mode: Mode) {
    handle_kind(context, matched, stringified, mode, false);
}

fn handle_kind(context: &Context, matched: Node, stringified: Node, mode: Mode, explicit: bool) {
    if let Some(kind) = context.resolver.type_of(stringified).filter(|kind| matches_type(context, matched, kind, mode)) {
        report(context, matched, stringified, &kind, mode, explicit);
    }
}

fn handle_typed(context: &Context, matched: Node, stringified: Node, kind: &Type, mode: Mode) {
    if matches_type(context, matched, kind, mode) {
        report(context, matched, stringified, kind, mode, false);
    }
}

/// Whether the argument at `at` is one element of the varargs parameter and not the array itself.
fn element_of_varargs(context: &Context, args: &[Node], at: usize, count: usize) -> bool {
    if at + 1 < count {
        return false;
    }
    if args.len() > count {
        return true;
    }
    !matches!(context.resolver.type_of(args[at]), Some(Type::Array(_)))
}

fn call(context: &Context, node: Node, mode: Mode) {
    let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { return };
    let args = arguments(node);
    let object = node.child_by_field_name("object");
    if args.is_empty() && !(name == "toString" && object.is_some()) {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(node) else { return };
    let method = &resolved.method;
    let index = context.resolver.index;
    let receiver = resolved.receiver.name();
    let object_only = method.parameters.len() == 1 && matches!(&method.parameters[0], Type::Class(parameter, _) if parameter == OBJECT);
    let formatted = method.detail.annotations.iter().any(|annotation| annotation == FORMAT_METHOD);
    let mut implicit = false;
    if !method.is_static && object_only && PRINT_NAMES.contains(&name) {
        let printing = name != "append" && index.is_subtype(&receiver, "java.io.PrintStream");
        if printing || (name == "append" && receiver == "java.lang.StringBuilder") {
            args.iter().for_each(|arg| handle(context, node, *arg, mode));
        }
    }
    if method.is_static && object_only && name == "valueOf" && resolved.declaring == STRING && !matches!(mode, Mode::Symbol | Mode::Type) {
        args.iter().for_each(|arg| handle(context, node, *arg, mode));
    }
    if !method.is_static && method.parameters.is_empty() && name == "toString" {
        if let Some(object) = object {
            handle_kind(context, node, object, mode, true);
        }
    }
    if formatted {
        implicit = true;
    }
    if (method.is_static && name == "format" && resolved.declaring == STRING) || (!method.is_static && name == "formatted" && receiver == STRING) {
        implicit = true;
    }
    if implicit && method.varargs {
        for (at, arg) in args.iter().enumerate() {
            if element_of_varargs(context, &args, at, method.parameters.len()) {
                handle(context, node, *arg, mode);
            }
        }
    }
    if !method.is_static && name == "log" && index.is_subtype(&receiver, "com.google.common.flogger.LoggingApi") {
        args.iter().for_each(|arg| handle(context, node, *arg, mode));
    }
    if !method.is_static && name == "join" && index.is_subtype(&receiver, "com.google.common.base.Joiner") {
        joined(context, node, &args, method, mode);
    }
}

fn joined(context: &Context, node: Node, args: &[Node], method: &crate::java::types::model::Method, mode: Mode) {
    let count = method.parameters.len();
    if method.varargs {
        for (at, arg) in args.iter().enumerate() {
            let kind = context.resolver.type_of(*arg);
            match kind {
                Some(Type::Array(element)) if args.len() == count && at + 1 == count => handle_typed(context, node, *arg, &element, mode),
                Some(kind) => handle_typed(context, node, *arg, &kind, mode),
                None => {}
            }
        }
    } else if matches!(method.parameters.as_slice(), [Type::Class(parameter, _)] if parameter == "java.lang.Iterable") {
        let Some(arg) = args.first() else { return };
        let Some(kind) = context.resolver.type_of(*arg) else { return };
        if let Some(element) = context.resolver.index.arguments_as(&kind, "java.lang.Iterable").and_then(|shown| shown.into_iter().next()) {
            handle_typed(context, node, *arg, &element, mode);
        }
    }
}

fn binary(context: &Context, node: Node, mode: Mode) {
    let operator = node.child_by_field_name("operator").map(|operator| context.text(operator));
    if operator != Some("+") {
        return;
    }
    let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    if !context.resolver.type_is(node, STRING) {
        return;
    }
    handle(context, node, left, mode);
    handle(context, node, right, mode);
}

fn compound(context: &Context, node: Node, mode: Mode) {
    let operator = node.child_by_field_name("operator").map(|operator| context.text(operator));
    if operator != Some("+=") {
        return;
    }
    let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    if context.resolver.type_of(left).is_some_and(|kind| kind == Type::class(STRING)) {
        handle(context, node, right, mode);
    }
}

fn reference(context: &Context, node: Node, mode: Mode) {
    let parts = children(node);
    let (Some(qualifier), Some(last)) = (parts.first().copied(), parts.last().copied()) else { return };
    let name = context.text(last);
    if !matches!(name, "toString" | "valueOf") {
        return;
    }
    let index = context.resolver.index;
    let Some(target) = context.resolver.type_of(node) else { return };
    let Some((class, function)) = index.functional_method(&target.name()) else { return };
    if function.parameters.len() != 1 {
        return;
    }
    let first = match &target {
        Type::Class(_, shown) if shown.is_empty() => function.parameters[0].clone(),
        _ => function.generic_parameters[0].substitute(&index.member_map(&target, &class.name)),
    };
    let owner = context.resolver.class_name(node, context.text(qualifier));
    if name == "valueOf" && owner.as_deref() != Some(STRING) {
        return;
    }
    if name == "toString" && !owner.is_some_and(|owner| index.is_subtype(&first.name(), &owner)) {
        return;
    }
    handle_typed(context, node, node, &first, mode);
}

fn dispatch(context: &Context, node: Node, mode: Mode) {
    match node.kind() {
        "method_invocation" => call(context, node, mode),
        "binary_expression" => binary(context, node, mode),
        "assignment_expression" => compound(context, node, mode),
        "method_reference" => reference(context, node, mode),
        _ => {}
    }
}

pub fn object_to_string(context: &Context, node: Node) {
    dispatch(context, node, Mode::Object);
}

pub fn symbol_to_string(context: &Context, node: Node) {
    dispatch(context, node, Mode::Symbol);
}

pub fn type_to_string(context: &Context, node: Node) {
    dispatch(context, node, Mode::Type);
}

pub fn stream_to_string(context: &Context, node: Node) {
    dispatch(context, node, Mode::Stream);
}

pub fn lite_proto_to_string(context: &Context, node: Node) {
    dispatch(context, node, Mode::LiteProto);
}
