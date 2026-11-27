//! URLProblems: DMI_COLLECTION_OF_URLS and DMI_BLOCKING_METHODS_ON_URL. Measured on test code (all priority 1):
//! - A field, method or class whose generic signature holds a type named `...Map`, `...Set` or `...Hashtable`
//!   (any class, by name) whose first type argument is `java.net.URL` itself, at any depth: wildcards, arrays of
//!   URL and later arguments do not count. A field has no line; a method sits on its first line of code, nothing
//!   when abstract; the members javac writes for a record on the `record` line; a class on its first line of code.
//!   Lambdas have no signature.
//! - A call on a receiver tracked as exactly `java.util.HashMap` (`put`, `get`, `containsKey`, `remove`) or
//!   `java.util.HashSet` (`add`, `contains`, `remove`) whose first argument is tracked as `java.net.URL`; once per
//!   method and called method. The SARIF place is the called method of the tracked class.
//! - A call javac writes against `java.util.Map` or `java.util.HashMap` named `get`, or `java.util.Set` or
//!   `java.util.HashSet` named `contains`, with an argument tracked as `java.net.URL`: once per method, at the first.
//! - DMI_BLOCKING_METHODS_ON_URL: `equals(Object)` or `hashCode()` called on a receiver declared `java.net.URL`;
//!   once per method and called method.
use super::super::idioms::Compiled;
use super::super::idioms::encoding::{tracked, written_owner};
use super::super::classes::lines;
use super::super::{Context, names, place};
use crate::engine::source::{children, named_children, walk};
use crate::java::helpers::declarators;
use crate::java::types::model::Type;
use crate::java::types::scope::{TYPE_DECLARATIONS, enclosing_types};
use std::collections::HashSet;
use tree_sitter::Node;

pub const COLLECTION: &str = "DMI_COLLECTION_OF_URLS";
pub const BLOCKING: &str = "DMI_BLOCKING_METHODS_ON_URL";

const URL: &str = "java.net.URL";
const KEYED: &[(&str, &str, usize)] = &[
    ("java.util.HashMap", "put", 2),
    ("java.util.HashMap", "get", 1),
    ("java.util.HashMap", "containsKey", 1),
    ("java.util.HashMap", "remove", 1),
    ("java.util.HashSet", "add", 1),
    ("java.util.HashSet", "contains", 1),
    ("java.util.HashSet", "remove", 1),
];
const QUERIES: &[(&str, &str)] = &[("java.util.Map", "get"), ("java.util.HashMap", "get"), ("java.util.Set", "contains"), ("java.util.HashSet", "contains")];

fn declares_variable(context: &Context, written: Node) -> bool {
    let name = context.text(written);
    let mut scope = crate::engine::source::parent(written);
    while let Some(node) = scope {
        let declared = node.child_by_field_name("type_parameters").map(named_children).unwrap_or_default();
        let named = |parameter: &Node| children(*parameter).into_iter().any(|part| part.kind() == "type_identifier" && context.text(part) == name);
        if declared.iter().any(|parameter| parameter.kind() == "type_parameter" && named(parameter)) {
            return true;
        }
        scope = crate::engine::source::parent(node);
    }
    false
}

fn is_url(context: &Context, written: Node) -> bool {
    let written = if written.kind() == "annotated_type" { named_children(written).into_iter().last().unwrap_or(written) } else { written };
    let named = written.kind() == "scoped_type_identifier" || (written.kind() == "type_identifier" && !declares_variable(context, written));
    named && matches!(context.resolver.type_node(written), Some(Type::Class(name, _)) if name == URL)
}

/// Whether a written type holds a map or set of URLs the way its signature spells it.
fn hogs(context: &Context, written: Node) -> bool {
    let mut found = false;
    walk(written, |node| {
        if found || node.kind() != "generic_type" {
            return;
        }
        let Some(base) = node.named_child(0) else { return };
        let simple = context.text(base).rsplit('.').next().unwrap_or_default();
        let keyed = ["Map", "Set", "Hashtable"].iter().any(|end| simple.ends_with(end));
        let arguments = children(node).into_iter().find(|part| part.kind() == "type_arguments");
        let first = arguments.and_then(|arguments| named_children(arguments).into_iter().find(|part| !part.kind().ends_with("comment")));
        found = keyed && first.is_some_and(|first| is_url(context, first));
    });
    found
}

fn any_hogs(context: &Context, parts: &[Option<Node>]) -> bool {
    parts.iter().flatten().any(|part| hogs(context, *part))
}

fn signature_parts<'a>(node: Node<'a>, fields: &[&str]) -> Vec<Option<Node<'a>>> {
    fields.iter().map(|field| node.child_by_field_name(field)).collect()
}

fn hogs_member(context: &Context, member: Node) -> bool {
    let mut parts = signature_parts(member, &["type", "parameters", "type_parameters"]);
    if member.kind() == "compact_constructor_declaration" {
        parts.push(crate::engine::source::parent(member).and_then(crate::engine::source::parent).and_then(|record| record.child_by_field_name("parameters")));
    }
    any_hogs(context, &parts)
}

fn hogs_class(context: &Context, class: Node) -> bool {
    if class.kind() == "object_creation_expression" {
        return any_hogs(context, &[class.child_by_field_name("type")]);
    }
    let mut parts = signature_parts(class, &["superclass", "interfaces", "type_parameters"]);
    parts.extend(children(class).into_iter().filter(|part| part.kind() == "extends_interfaces").map(Some));
    any_hogs(context, &parts)
}

fn message(label: &str) -> String {
    format!("{label} is or uses a map or set of URLs, which can be a performance hog")
}

fn report_at(context: &Context, at: Node, line: usize, label: String, place: String) {
    context.report_listed(COLLECTION, at, line, message(&label), place, 1, vec![label]);
}

fn member_line(context: &Context, member: Node) -> usize {
    match member.kind() {
        "method_declaration" if member.child_by_field_name("body").is_some() => lines::method_start(context, member).unwrap_or(0),
        "constructor_declaration" | "compact_constructor_declaration" => lines::constructor_start(context, member).unwrap_or(0),
        _ => 0,
    }
}

fn fields(context: &Context, binary: &str, members: &[Node]) {
    for member in members.iter().copied().filter(|member| matches!(member.kind(), "field_declaration" | "constant_declaration")) {
        if !hogs(context, member.child_by_field_name("type").unwrap_or(member)) {
            continue;
        }
        for name in declarators(member).into_iter().filter_map(|declarator| declarator.child_by_field_name("name")) {
            let qualified = format!("{binary}.{}", context.text(name));
            report_at(context, member, 0, qualified.clone(), format!("member:{qualified}"));
        }
    }
}

fn record_members(context: &Context, own: &str, class: Node, members: &[Node], binary: &str) {
    let Some(components) = class.child_by_field_name("parameters") else { return };
    let keyword = children(class).into_iter().find(|part| part.kind() == "record").or_else(|| class.child_by_field_name("name"));
    let line = keyword.map_or(0, |keyword| context.line(keyword));
    let declared = |name: &str, empty: bool| {
        members.iter().any(|member| {
            let named = member.child_by_field_name("name").is_some_and(|written| context.text(written) == name);
            let listed = member.child_by_field_name("parameters").map_or(0, |list| named_children(list).iter().filter(|part| !part.kind().ends_with("comment")).count());
            member.kind() == "method_declaration" && named && (listed == 0) == empty
        })
    };
    let components: Vec<Node> = named_children(components).into_iter().filter(|part| part.kind() == "formal_parameter").collect();
    for component in &components {
        if !hogs(context, component.child_by_field_name("type").unwrap_or(*component)) {
            continue;
        }
        let Some(name) = component.child_by_field_name("name").map(|name| context.text(name)) else { continue };
        let qualified = format!("{binary}.{name}");
        report_at(context, *component, 0, qualified.clone(), format!("member:{qualified}"));
        if !declared(name, true) {
            let accessor = format!("{binary}.{name}()");
            report_at(context, *component, line, accessor.clone(), place::function(&accessor));
        }
    }
    let canonical = members.iter().any(|member| {
        let listed = member.child_by_field_name("parameters").map_or(0, |list| named_children(list).iter().filter(|part| part.kind() == "formal_parameter").count());
        member.kind() == "compact_constructor_declaration" || (member.kind() == "constructor_declaration" && listed == components.len())
    });
    if !canonical && components.iter().any(|component| hogs(context, *component)) {
        let label = names::method(context, own, class, None);
        report_at(context, class, line, label.clone(), place::function(&label));
    }
}

fn signatures(context: &Context, own: &str, class: Node, members: &[Node]) {
    let binary = names::binary(context, own);
    if hogs_class(context, class) {
        let anonymous = children(class).into_iter().find(|part| part.kind() == "class_body" && matches!(class.kind(), "object_creation_expression" | "enum_constant")).map(|body| context.line(body));
        let line = anonymous.or_else(|| lines::class_first(context, own, class, members)).unwrap_or(0);
        report_at(context, class, line, binary.clone(), format!("type:{binary}"));
    }
    fields(context, &binary, members);
    for member in members.iter().copied().filter(|member| member.kind().ends_with("constructor_declaration") || member.kind() == "method_declaration") {
        if !hogs_member(context, member) {
            continue;
        }
        let Some(label) = super::super::statements::member_label(context, own, class, member) else { continue };
        report_at(context, member, member_line(context, member), label.clone(), place::function(&label));
    }
    if class.kind() == "record_declaration" {
        record_members(context, own, class, members, &binary);
    }
}

fn tracked_class(context: &Context, value: Node) -> Option<String> {
    match tracked(context, value, 0)? {
        Type::Class(name, _) => Some(name),
        _ => None,
    }
}

/// Whether a value is a call that returns a type variable, which SpotBugs does not track through javac's cast.
pub fn generic_return(context: &Context, value: Node) -> bool {
    let value = crate::java::types::expr::unwrap(value);
    value.kind() == "method_invocation" && context.resolver.resolve_call(value).is_some_and(|call| matches!(call.method.generic_returns, Type::Variable(_)))
}

fn url_argument(context: &Context, node: Node) -> bool {
    first_argument(node).is_some_and(|argument| !generic_return(context, argument) && tracked_class(context, argument).as_deref() == Some(URL))
}

fn first_argument(node: Node) -> Option<Node> {
    node.child_by_field_name("arguments").and_then(|arguments| named_children(arguments).into_iter().find(|part| !part.kind().ends_with("comment")))
}

fn arity(node: Node) -> usize {
    node.child_by_field_name("arguments").map_or(0, |arguments| named_children(arguments).iter().filter(|part| !part.kind().ends_with("comment")).count())
}

fn call_line(context: &Context, node: Node) -> usize {
    node.child_by_field_name("arguments").map_or_else(|| context.line(node), |arguments| context.line(arguments))
}

fn on_super(node: Node) -> bool {
    node.child_by_field_name("object").is_some_and(|object| object.kind() == "super")
}

fn keyed_call(context: &Context, node: Node, name: &str) -> Option<String> {
    if on_super(node) {
        return None;
    }
    let receiver = tracked_class(context, node.child_by_field_name("object")?)?;
    let (class, method, count) = KEYED.iter().find(|(class, method, _)| *class == receiver && *method == name)?;
    if arity(node) != *count || !url_argument(context, node) {
        return None;
    }
    Some(format!("{class}.{method}({})", vec!["Object"; *count].join(", ")))
}

fn queries(context: &Context, own: &str, node: Node, name: &str) -> bool {
    if on_super(node) {
        return false;
    }
    let Some(owner) = written_owner(context, own, node) else { return false };
    let listed = QUERIES.contains(&(owner.as_str(), name)) && arity(node) == 1;
    listed && url_argument(context, node)
}

fn blocking(context: &Context, node: Node, name: &str) -> Option<String> {
    let object = node.child_by_field_name("object")?;
    let declared = context.resolver.type_of(object)?;
    let wanted = match (name, arity(node)) {
        ("equals", 1) => "java.net.URL.equals(Object)",
        ("hashCode", 0) => "java.net.URL.hashCode()",
        _ => return None,
    };
    matches!(declared.erased(), Type::Class(class, _) if class == URL).then(|| wanted.to_string())
}

fn relative(context: &Context, node: Node, called: &str) -> String {
    let class = enclosing_types(context.resolver.scope, node).into_iter().next();
    let shown = class.as_deref().map(|class| names::binary(context, class)).unwrap_or_default();
    format!("function:{called}|{}@{shown}", names::package_of(&shown))
}

fn calls(context: &Context, own: &str, methods: &[Compiled]) {
    for method in methods {
        let mut seen = HashSet::new();
        let mut queried = false;
        for node in method.nodes.iter().copied().filter(|node| node.kind() == "method_invocation") {
            let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { continue };
            let label = method.label.clone();
            if let Some(called) = blocking(context, node, name).filter(|called| context.wants(&[BLOCKING]) && seen.insert((BLOCKING, called.clone()))) {
                let message = format!("Invocation of {called}, which blocks to do domain name resolution, in {label}");
                let place = relative(context, node, &called);
                context.report_listed(BLOCKING, node, call_line(context, node), message, place, 1, vec![called, label.clone()]);
            }
            if !context.wants(&[COLLECTION]) {
                continue;
            }
            if let Some(called) = keyed_call(context, node, name).filter(|called| seen.insert((COLLECTION, called.clone()))) {
                let place = relative(context, node, &called);
                report_at(context, node, call_line(context, node), label.clone(), place);
            }
            if !queried && queries(context, own, node, name) {
                queried = true;
                report_at(context, node, call_line(context, node), label.clone(), place::function(&label));
            }
        }
    }
}

pub fn check(context: &Context, own: &str, class: Node, members: &[Node], methods: &[Compiled]) {
    if context.wants(&[COLLECTION]) && (TYPE_DECLARATIONS.contains(&class.kind()) || matches!(class.kind(), "object_creation_expression" | "enum_constant")) {
        signatures(context, own, class, members);
    }
    calls(context, own, methods);
}
