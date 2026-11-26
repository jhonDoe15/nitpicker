//! JdkObsolete: old JDK classes and the methods that take a charset by name.
use super::Context;
use super::obsolete_fix::{linked_list_fix, string_buffer_fix};
use super::hierarchy::{declared_method, simple_name, super_method};
use crate::engine::source::{children, parent, walk};
use crate::java::types::expr::Receiver;
use tree_sitter::Node;

const CLASSES: &[(&str, &str)] = &[
    (
        "java.util.LinkedList",
        "It is very rare for LinkedList to out-perform ArrayList or ArrayDeque. Avoid it unless you're willing to invest a lot of \
         time into benchmarking. Caveat: LinkedList supports null elements, but ArrayDeque does not.",
    ),
    ("java.util.Vector", "Vector performs synchronization that is usually unnecessary; prefer ArrayList."),
    ("java.util.Hashtable", "Hashtable performs synchronization this is usually unnecessary; prefer LinkedHashMap."),
    (
        "java.util.Stack",
        "Stack is a nonstandard class that predates the Java Collections Framework; prefer ArrayDeque. Note that the Stack methods \
         push/pop/peek correspond to the Deque methods addFirst/removeFirst/peekFirst.",
    ),
    ("java.lang.StringBuffer", "StringBuffer performs synchronization that is usually unnecessary; prefer StringBuilder."),
    ("java.util.SortedSet", "SortedSet was replaced by NavigableSet in Java 6."),
    ("java.util.SortedMap", "SortedMap was replaced by NavigableMap in Java 6."),
    ("java.util.Dictionary", "Dictionary is a nonstandard class that predates the Java Collections Framework; use LinkedHashMap."),
    ("java.util.Enumeration", "Enumeration is an ancient precursor to Iterator."),
    ("junit.framework.TestCase", "JUnit3 is obsolete."),
];

const HIT_END: &str = "The hitEnd() and requireEnd() methods are mostly for implementing java.util.Scanner or similar streaming APIs. \
                       If you only want to know if a match extends to the end of the input, compare matcher.end() to the input \
                       length instead.";

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    /// A method called on a value of exactly this class.
    I,
    /// A static method of this class.
    S,
    /// A constructor of this class.
    C,
}
use Kind::{C, I, S};

const IO: &str = "org.apache.commons.io.IOUtils";
const STRING: &str = "java.lang.String";
const MATCHER: &str = "java.util.regex.Matcher";
const MAP: &str = "java.util.concurrent.ConcurrentHashMap";

/// Each takes the name of a charset as its last `String`; the message names the same call with a `Charset` there.
const BY_NAME: &[(Kind, &str, &str, &[&str])] = &[
    (I, "java.io.ByteArrayOutputStream", "toString", &["java.lang.String"]),
    (I, "java.lang.String", "getBytes", &["java.lang.String"]),
    (S, "java.net.URLDecoder", "decode", &["java.lang.String", "java.lang.String"]),
    (S, "java.net.URLEncoder", "encode", &["java.lang.String", "java.lang.String"]),
    (S, "java.nio.channels.Channels", "newReader", &["java.nio.channels.ReadableByteChannel", "java.lang.String"]),
    (S, "java.nio.channels.Channels", "newWriter", &["java.nio.channels.WritableByteChannel", "java.lang.String"]),
    (I, "java.util.Properties", "storeToXML", &["java.io.OutputStream", "java.lang.String", "java.lang.String"]),
    (S, IO, "lineIterator", &["java.io.InputStream", "java.lang.String"]),
    (S, IO, "readLines", &["java.io.InputStream", "java.lang.String"]),
    (S, IO, "toByteArray", &["java.io.Reader", "java.lang.String"]),
    (S, IO, "toCharArray", &["java.io.InputStream", "java.lang.String"]),
    (S, IO, "toInputStream", &["java.lang.CharSequence", "java.lang.String"]),
    (S, IO, "toInputStream", &["java.lang.String", "java.lang.String"]),
    (S, IO, "toString", &["java.io.InputStream", "java.lang.String"]),
    (S, IO, "toString", &["java.net.URI", "java.lang.String"]),
    (S, IO, "toString", &["byte[]", "java.lang.String"]),
    (S, IO, "toString", &["java.net.URL", "java.lang.String"]),
    (S, IO, "write", &["byte[]", "java.io.Writer", "java.lang.String"]),
    (S, IO, "write", &["char[]", "java.io.OutputStream", "java.lang.String"]),
    (S, IO, "write", &["java.lang.CharSequence", "java.io.OutputStream", "java.lang.String"]),
    (S, IO, "write", &["java.lang.String", "java.io.OutputStream", "java.lang.String"]),
    (S, IO, "write", &["java.lang.StringBuffer", "java.io.OutputStream", "java.lang.String"]),
    (S, IO, "writeLines", &["java.util.Collection", "java.lang.String", "java.io.OutputStream", "java.lang.String"]),
    (C, "java.util.Scanner", "", &["java.io.InputStream", "java.lang.String"]),
    (C, "java.util.Scanner", "", &["java.io.File", "java.lang.String"]),
    (C, "java.util.Scanner", "", &["java.nio.file.Path", "java.lang.String"]),
    (C, "java.util.Scanner", "", &["java.nio.channels.ReadableByteChannel", "java.lang.String"]),
    (C, "java.lang.String", "", &["byte[]", "java.lang.String"]),
    (C, "java.lang.String", "", &["byte[]", "int", "int", "java.lang.String"]),
    (C, "java.io.InputStreamReader", "", &["java.io.InputStream", "java.lang.String"]),
    (C, "java.io.OutputStreamWriter", "", &["java.io.OutputStream", "java.lang.String"]),
    (C, "java.io.PrintStream", "", &["java.io.OutputStream", "boolean", "java.lang.String"]),
    (C, "java.io.PrintStream", "", &["java.lang.String", "java.lang.String"]),
    (C, "java.io.PrintStream", "", &["java.io.File", "java.lang.String"]),
    (C, "java.io.PrintWriter", "", &["java.lang.String", "java.lang.String"]),
    (C, "java.io.PrintWriter", "", &["java.io.File", "java.lang.String"]),
    (C, "java.util.Formatter", "", &["java.lang.String", "java.lang.String"]),
    (C, "java.util.Formatter", "", &["java.lang.String", "java.lang.String", "java.util.Locale"]),
    (C, "java.util.Formatter", "", &["java.io.File", "java.lang.String"]),
    (C, "java.util.Formatter", "", &["java.io.File", "java.lang.String", "java.util.Locale"]),
    (C, "java.util.Formatter", "", &["java.io.OutputStream", "java.lang.String"]),
    (C, "java.util.Formatter", "", &["java.io.OutputStream", "java.lang.String", "java.util.Locale"]),
];

fn instead(kind: Kind, class: &str, name: &str, parameters: &[&str]) -> String {
    let last = parameters.iter().rposition(|parameter| *parameter == STRING);
    let shown: Vec<&str> =
        parameters.iter().enumerate().map(|(at, parameter)| if Some(at) == last { "Charset" } else { simple_name(parameter) }).collect();
    let head = if kind == C { format!("new {}", simple_name(class)) } else { format!("{}.{name}", simple_name(class)) };
    format!("Use {head}({}) instead.", shown.join(", "))
}

fn obsolete_api(context: &Context, call: Node) -> Option<String> {
    let name = if call.kind() == "method_invocation" { context.text(call.child_by_field_name("name")?) } else { "" };
    let known = matches!(name, "keys" | "elements" | "hitEnd" | "requireEnd") || BY_NAME.iter().any(|row| row.2 == name);
    let created = call.child_by_field_name("type").map(|kind| context.text(kind)).unwrap_or_default();
    let created = created.split('<').next().unwrap_or_default().rsplit('.').next().unwrap_or_default().trim();
    let made = call.kind() == "method_invocation" || BY_NAME.iter().any(|row| row.0 == C && row.1.rsplit('.').next() == Some(created));
    if !known || !made {
        return None;
    }
    let (resolved, _) = context.resolver.call_formals(call)?;
    let method = &resolved.method;
    let receiver = resolved.receiver.name();
    let owner = if method.is_static || call.kind() != "method_invocation" { resolved.declaring.as_str() } else { receiver.as_str() };
    if !method.is_static && call.kind() == "method_invocation" {
        match (owner, name) {
            (MAP, "keys") if method.parameters.is_empty() => return Some("Use ConcurrentHashMap.keySet() instead.".to_string()),
            (MAP, "elements") if method.parameters.is_empty() => return Some("Use ConcurrentHashMap.values() instead.".to_string()),
            (MATCHER, "hitEnd" | "requireEnd") => return Some(HIT_END.to_string()),
            _ => {}
        }
    }
    let kind = if call.kind() != "method_invocation" {
        C
    } else if method.is_static {
        S
    } else {
        I
    };
    let actual: Vec<String> = method.parameters.iter().map(|parameter| parameter.name()).collect();
    BY_NAME
        .iter()
        .find(|(wanted, class, called, parameters)| {
            *wanted == kind
                && *called == name
                && parameters.iter().eq(actual.iter())
                && if kind == S { context.resolver.index.is_subtype(owner, class) } else { owner == *class }
        })
        .map(|(kind, class, name, parameters)| instead(*kind, class, name, parameters))
}

/// The method around a node, when no class or lambda comes first.
fn method_around(node: Node) -> Option<Node> {
    let mut current = parent(node);
    while let Some(at) = current {
        match at.kind() {
            "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" => return Some(at),
            "lambda_expression" | "class_declaration" => return None,
            "class_body" if parent(at).is_some_and(|holder| holder.kind() != "class_declaration") => return None,
            _ => current = parent(at),
        }
    }
    None
}

/// An override that has to give back the old type, or a Mockito stub of a method that does.
fn excused(context: &Context, node: Node, class: &str) -> bool {
    let Some(method) = method_around(node) else { return false };
    if let Some((origin, declared)) = declared_method(context, method) {
        if declared.returns.erased().name() == class && super_method(context, origin, declared).is_some() {
            return true;
        }
    }
    let mut stubbed = false;
    walk(method, |part| {
        if stubbed || part.kind() != "method_invocation" || part.child_by_field_name("name").is_none_or(|name| context.text(name) != "when") {
            return;
        }
        let mockito = context.resolver.resolve_call(part).is_some_and(|call| call.method.is_static && call.declaring == "org.mockito.Mockito");
        if let Some(crate::java::types::model::Type::Class(_, given)) = context.resolver.type_of(part).filter(|_| mockito) {
            stubbed = given.len() == 1 && given[0].erased().name() == class;
        }
    });
    stubbed
}

fn message(context: &Context, node: Node, classes: &[String]) -> Option<(&'static str, &'static str)> {
    classes.iter().find_map(|class| CLASSES.iter().find(|(name, _)| name == class && !excused(context, node, class)).copied())
}

/// `Matcher.appendTail` and `appendReplacement` took only a `StringBuffer` for a long time.
fn feeds_matcher(context: &Context) -> bool {
    let mut found = false;
    walk(context.file.tree.root_node(), |part| {
        if found || part.kind() != "method_invocation" {
            return;
        }
        let name = part.child_by_field_name("name").map(|name| context.text(name));
        if !matches!(name, Some("appendTail" | "appendReplacement")) {
            return;
        }
        let Some(call) = context.resolver.resolve_call(part) else { return };
        let first = call.method.parameters.first().map(|parameter| parameter.name());
        found = matches!(call.receiver.name().as_str(), MATCHER | "com.google.re2j.Matcher") && first.as_deref() == Some("java.lang.StringBuffer");
    });
    found
}

pub fn jdk_obsolete(context: &Context, node: Node) {
    const NAME: &str = "JdkObsolete";
    match node.kind() {
        "method_invocation" => {
            if let Some(text) = obsolete_api(context, node) {
                let at = node.child_by_field_name("arguments").map_or(node.start_byte(), |list| list.start_byte());
                context.report(NAME, node, at, &text);
            }
        }
        "object_creation_expression" => {
            let at = children(node).into_iter().find(|part| part.kind() == "new").map_or(node.start_byte(), |part| part.start_byte());
            if let Some(text) = obsolete_api(context, node) {
                context.report(NAME, node, at, &text);
                return;
            }
            let Some(created) = node.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind)) else { return };
            let Some((class, text)) = message(context, node, &[created.name()]) else { return };
            if class != "java.lang.StringBuffer" || !feeds_matcher(context) {
                let plain = !children(node).iter().any(|part| part.kind() == "class_body");
                let fix = match class {
                    "java.util.LinkedList" if plain => linked_list_fix(context, node),
                    "java.lang.StringBuffer" if plain => string_buffer_fix(context, node),
                    _ => None,
                };
                context.report_fixed(NAME, node, at, text, &fix.into_iter().collect::<Vec<_>>());
            }
        }
        "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" => {
            let Some(name) = crate::java::types::scope::declared_name(context.file, context.resolver.scope, node) else { return };
            let Some(info) = context.resolver.index.get(&name) else { return };
            let supers: Vec<String> = info.superclass.iter().chain(&info.interfaces).cloned().collect();
            let Some((_, text)) = supers.iter().find_map(|class| CLASSES.iter().find(|(name, _)| name == class)) else { return };
            let keyword = children(node).into_iter().find(|part| matches!(part.kind(), "class" | "interface" | "enum" | "record"));
            context.report(NAME, node, keyword.map_or(node.start_byte(), |keyword| keyword.start_byte()), text);
        }
        "method_reference" => {
            let Some(qualifier) = node.named_child(0) else { return };
            let class = match context.resolver.receiver(qualifier) {
                Some(Receiver::Value(kind)) => kind.erased().name(),
                Some(Receiver::Static(class)) => class,
                None => return,
            };
            if let Some((_, text)) = message(context, node, &[class]) {
                context.report(NAME, node, node.start_byte(), text);
            }
        }
        _ => {}
    }
}
