//! Checks on calls into APIs that are unsafe or easy to misuse: Locale, serialization, interrupts, identity maps.
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::parts::{arguments, class_of, only_argument, enclosing_class, enclosing_method, name_text, new_keyword, open_paren};
use super::qualify::qualify_type;
use super::Context;
use crate::java::types::model::Type;
use tree_sitter::Node;

const LOCALE: &str = "java.util.Locale";
const WELL_FORMED: &str = " They do not check their arguments for well-formedness. Prefer using Locale.forLanguageTag(String) (which takes in an IETF BCP 47-formatted string) or a Locale.Builder (which throws exceptions when the input is not well-formed).";

fn locale_fix(context: &Context, node: Node, arguments: &[Node]) -> Vec<Fix> {
    let [argument] = arguments else { return Vec::new() };
    let replacement = if argument.kind() == "string_literal" {
        match constant(context, *argument) {
            Some(Const::Str(value)) => format!("\"{}\"", value.replace('_', "-")),
            _ => return Vec::new(),
        }
    } else {
        format!("{}.replace('_', '-')", context.text(*argument))
    };
    vec![Fix::replace(node.start_byte(), node.end_byte(), format!("Locale.forLanguageTag({replacement})"))]
}

pub fn unsafe_locale_usage(context: &Context, node: Node) {
    match node.kind() {
        "object_creation_expression" => {
            if node.child_by_field_name("type").is_none() || class_of(context, node).is_none_or(|name| name != LOCALE) {
                return;
            }
            let fixes = locale_fix(context, node, &arguments(node));
            context.report_fixed("UnsafeLocaleUsage", node, new_keyword(node), &format!("Avoid using the Locale constructors.{WELL_FORMED}"), &fixes);
        }
        "method_invocation" => {
            let name = name_text(context, node);
            if !matches!(name, "toString" | "of") {
                return;
            }
            let Some(call) = context.resolver.resolve_call(node) else { return };
            if name == "toString" {
                let exact = node.child_by_field_name("object").is_some() && call.receiver.name() == LOCALE;
                if !exact || !call.method.parameters.is_empty() || call.method.is_static {
                    return;
                }
                let Some(written) = node.child_by_field_name("name") else { return };
                let message = "Avoid using Locale.toString() since it produces a value that misleadingly looks like a locale identifier. Prefer using Locale.toLanguageTag() since it produces an IETF BCP 47-formatted string that can be deserialized back into a Locale.";
                let fix = Fix::replace(written.start_byte(), written.end_byte(), "toLanguageTag");
                context.report_fixed("UnsafeLocaleUsage", node, open_paren(node), message, &[fix]);
            } else if call.method.is_static && call.declaring == LOCALE {
                let fixes = locale_fix(context, node, &arguments(node));
                context.report_fixed("UnsafeLocaleUsage", node, open_paren(node), &format!("Avoid using the Locale.of static methods.{WELL_FORMED}"), &fixes);
            }
        }
        _ => {}
    }
}

const BANNED_READS: [&str; 6] = ["readObject", "defaultReadObject", "readObjectOverride", "readClassDescriptor", "resolveClass", "resolveObject"];

fn enclosing_exempt(context: &Context, call: Node) -> bool {
    let index = context.resolver.index;
    let class = enclosing_class(context, call);
    let method = enclosing_method(call).and_then(|method| method.child_by_field_name("name")).map(|name| context.text(name));
    let class_is = |of: &str| class.as_ref().is_some_and(|name| index.is_subtype(name, of));
    (class_is("java.io.Serializable") && method == Some("readObject"))
        || (class_is("java.io.ObjectInputStream") && method.is_some_and(|name| BANNED_READS.contains(&name)))
}

pub fn ban_serializable_read(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let name = name_text(context, node);
    if !BANNED_READS.contains(&name) && name != "readExternal" {
        return;
    }
    let stream = BANNED_READS.contains(&name) && context.resolver.matches_sig(node, &format!("java.io.ObjectInputStream#{name}(_*)"));
    let by_hand = name == "readObject" && context.resolver.matches_sig(node, "java.io.Serializable#readObject(java.io.ObjectInputStream)");
    let input = name == "readObject" && context.resolver.matches_sig(node, "java.io.ObjectInput#readObject()");
    let external = name == "readExternal" && context.resolver.matches_sig(node, "java.io.Externalizable#readExternal(_*)");
    let mut banned = stream || by_hand;
    if !banned && (input || external) {
        let inside = enclosing_method(node).and_then(|method| method.child_by_field_name("name")).is_some_and(|written| context.text(written) == "readExternal")
            && enclosing_class(context, node).is_some_and(|class| context.resolver.index.is_subtype(&class, "java.io.Externalizable"));
        banned = !inside;
    }
    if banned && !enclosing_exempt(context, node) {
        context.report_fixed("BanSerializableRead", node, open_paren(node), "Deserializing user input via the `Serializable` API is extremely dangerous", &[]);
    }
}

fn is_instance_call(context: &Context, call: Node, signature: &str) -> bool {
    context.resolver.matches_sig(call, signature) && context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static)
}

fn delegating_cancel(context: &Context, argument: Node) -> bool {
    if argument.kind() != "identifier" {
        return false;
    }
    let Some(method) = enclosing_method(argument).filter(|method| method.kind() == "method_declaration") else { return false };
    let formals = super::hierarchy::formals(method);
    let name = context.text(argument);
    let own = formals.iter().any(|formal| formal.child_by_field_name("name").is_some_and(|written| context.text(written) == name));
    let is_cancel = method.child_by_field_name("name").is_some_and(|written| context.text(written) == "cancel");
    own && is_cancel
        && formals.len() == 1
        && enclosing_class(context, method).is_some_and(|class| context.resolver.index.is_subtype(&class, "java.util.concurrent.Future"))
}

pub fn interruption(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let name = name_text(context, node);
    if name == "interrupt" && is_instance_call(context, node, "java.lang.Thread#interrupt()") {
        let current = node.child_by_field_name("object").is_some_and(|object| {
            let object = crate::java::types::expr::unwrap(object);
            object.kind() == "method_invocation"
                && name_text(context, object) == "currentThread"
                && context.resolver.matches_sig(object, "java.lang.Thread#currentThread()")
                && context.resolver.resolve_call(object).is_some_and(|resolved| resolved.method.is_static)
        });
        if !current {
            context.report_fixed("Interruption", node, open_paren(node), "Thread.interrupt should not be called, except to record the interrupt status on the current thread when dealing with InterruptedException", &[]);
        }
        return;
    }
    if name != "cancel" {
        return;
    }
    let cancels = ["java.util.concurrent.Future", "com.google.common.util.concurrent.ClosingFuture"]
        .iter()
        .any(|owner| is_instance_call(context, node, &format!("{owner}#cancel(boolean)")));
    let Some(argument) = only_argument(node) else { return };
    if !cancels {
        return;
    }
    if constant(context, argument) == Some(Const::Bool(false)) {
        return;
    }
    let was_interrupted = crate::java::types::expr::unwrap(argument).kind() == "method_invocation"
        && is_instance_call(context, crate::java::types::expr::unwrap(argument), "com.google.common.util.concurrent.AbstractFuture#wasInterrupted()");
    if was_interrupted || delegating_cancel(context, argument) {
        return;
    }
    let fix = Fix::replace(argument.start_byte(), argument.end_byte(), "false");
    context.report_fixed("Interruption", node, open_paren(node), "Always pass 'false' to 'Future.cancel()', unless you are propagating a cancellation-with-interrupt from another caller", &[fix]);
}

const IDENTITY_HASH_MAP: &str = "java.util.IdentityHashMap";
const IDENTITY_MESSAGE: &str = "IdentityHashMap usage shouldn't be intermingled with Map";

fn is_identity_map(context: &Context, expression: Node) -> Option<bool> {
    match context.resolver.type_of(expression)? {
        Type::Class(name, _) => Some(name == IDENTITY_HASH_MAP),
        _ => Some(false),
    }
}

pub fn identity_hash_map_usage(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" => {
            if !matches!(name_text(context, node), "equals" | "putAll") || node.child_by_field_name("object").is_none() {
                return;
            }
            let name = name_text(context, node);
            if !context.resolver.matches_sig(node, &format!("{IDENTITY_HASH_MAP}#{name}(_*)")) {
                return;
            }
            let Some(call) = context.resolver.resolve_call(node) else { return };
            let Some(argument) = only_argument(node) else { return };
            if call.receiver.name() != IDENTITY_HASH_MAP || call.method.is_static {
                return;
            }
            if is_identity_map(context, argument) == Some(false) {
                context.report_fixed("IdentityHashMapUsage", node, open_paren(node), IDENTITY_MESSAGE, &[]);
            }
        }
        "assignment_expression" => {
            let (Some(left), Some(right), Some(operator)) =
                (node.child_by_field_name("left"), node.child_by_field_name("right"), node.child_by_field_name("operator"))
            else {
                return;
            };
            if context.text(operator) != "=" || is_identity_map(context, right) != Some(true) {
                return;
            }
            if is_identity_map(context, left) == Some(false) {
                context.report_fixed("IdentityHashMapUsage", node, operator.start_byte(), IDENTITY_MESSAGE, &[]);
            }
        }
        "variable_declarator" => {
            let (Some(value), Some(name)) = (node.child_by_field_name("value"), node.child_by_field_name("name")) else { return };
            let Some(declaration) = crate::engine::source::parent(node).filter(|d| matches!(d.kind(), "local_variable_declaration" | "field_declaration")) else { return };
            let Some(written) = declaration.child_by_field_name("type") else { return };
            let Some(declared) = context.resolver.declared_type(declaration, Some(node)) else { return };
            if matches!(&declared, Type::Class(own, _) if own == IDENTITY_HASH_MAP) || value.kind() == "array_initializer" {
                return;
            }
            let Some(mut kind) = context.resolver.type_of(value) else { return };
            let diamond = value.kind() == "object_creation_expression" && value.child_by_field_name("type").is_some_and(|written| context.text(written).replace(char::is_whitespace, "").ends_with("<>"));
            if let (true, true, Some(Type::Class(_, arguments))) = (diamond, matches!(&kind, Type::Class(own, _) if own == IDENTITY_HASH_MAP), context.resolver.symbolic().declared_type(declaration, Some(node))) {
                if arguments.len() == 2 {
                    kind = Type::Class(IDENTITY_HASH_MAP.to_string(), arguments);
                }
            }
            if matches!(&kind, Type::Class(own, _) if own == IDENTITY_HASH_MAP) {
                let fix = Fix::replace(written.start_byte(), written.end_byte(), qualify_type(context, node, &kind));
                context.report_fixed("IdentityHashMapUsage", node, name.start_byte(), IDENTITY_MESSAGE, &[fix]);
            }
        }
        "object_creation_expression" => {
            if class_of(context, node).is_none_or(|name| name != IDENTITY_HASH_MAP) {
                return;
            }
            let Some(argument) = only_argument(node) else { return };
            let Some((call, _)) = context.resolver.call_formals(node) else { return };
            if call.method.parameters.len() == 1 && call.method.parameters[0].name() == "java.util.Map" && is_identity_map(context, argument) == Some(false) {
                context.report_fixed("IdentityHashMapUsage", node, new_keyword(node), IDENTITY_MESSAGE, &[]);
            }
        }
        _ => {}
    }
}
