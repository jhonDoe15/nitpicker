//! RestrictedApi: a use of a method or constructor with `@RestrictedApi`, or of a method that overrides one, outside
//! the paths and declarations its annotation allows. Where the engine cannot tell (a use it cannot resolve, or an
//! `allowedOnPath` pattern outside the syntax `pattern` knows), the file goes back to Error Prone for this check.
mod enclosing;
mod pattern;
mod uri;

use super::Context;
use super::hierarchy::super_methods;
use super::nodes::position;
use super::returns::referenced;
use crate::engine::source::children;
use crate::java::types::annotation_values::Kept;
use crate::java::types::expr::Call;
use crate::java::types::index::simple_name;
use crate::java::types::scope::enclosing_type;
use crate::java::types::model::Method;
use tree_sitter::Node;

const CHECK: &str = "RestrictedApi";
const ANNOTATION: &str = "com.google.errorprone.annotations.RestrictedApi";

/// The annotation that restricts a use, and the class that declares the method carrying it.
#[derive(Clone)]
struct Restriction {
    class: String,
    method: String,
    kept: Kept,
}

fn carried(method: &Method) -> Option<&Kept> {
    method.detail.kept.iter().find(|kept| kept.name == ANNOTATION)
}

/// The method's own `@RestrictedApi`, else the first of the methods it overrides that carries one.
fn restriction(context: &Context, declaring: &str, method: &Method) -> Option<Restriction> {
    let index = context.resolver.index;
    let own = |class: &str, method: &Method| {
        carried(method).map(|kept| Restriction { class: class.to_string(), method: format!("{}({})", method.name, method.shown), kept: kept.clone() })
    };
    if let Some(found) = own(declaring, method) {
        return Some(found);
    }
    let info = index.get(declaring)?;
    super_methods(index, info, method).into_iter().find_map(|(class, other)| own(&class.name, other))
}

enum Use {
    /// Resolved: the restriction, if any.
    Known(Option<Restriction>),
    /// The engine cannot tell which method is used.
    Unknown,
}

fn key(found: &Option<Restriction>) -> Option<(String, String)> {
    found.as_ref().map(|one| (one.class.clone(), one.method.clone()))
}

/// Whether the receiver's supertypes hold another abstract interface method of the same signature with a different
/// restriction: javac then picks one of them in a way the engine does not model.
fn ambiguous(context: &Context, receiver: &str, declaring: &str, method: &Method, chosen: &Option<Restriction>) -> bool {
    let index = context.resolver.index;
    if !method.is_abstract || !index.get(declaring).is_some_and(|info| info.is_interface) {
        return false;
    }
    let mut classes: Vec<String> = receiver.split('&').map(String::from).collect();
    for name in receiver.split('&') {
        classes.extend(super::hierarchy::closure(index, name));
    }
    classes.iter().filter_map(|class| index.get(class)).filter(|info| info.is_interface).any(|info| {
        info.methods.iter().any(|other| {
            other.name == method.name && other.is_abstract && other.parameters == method.parameters && key(&restriction(context, &info.name, other)) != key(chosen)
        })
    })
}

fn of_call(context: &Context, call: Option<Call>) -> Use {
    let Some(call) = call else { return Use::Unknown };
    let found = restriction(context, &call.declaring, &call.method);
    if ambiguous(context, &call.receiver.name(), &call.declaring, &call.method, &found) {
        return Use::Unknown;
    }
    Use::Known(found)
}

/// The methods a method reference may stand for, when they agree on the restriction.
fn of_reference(context: &Context, node: Node) -> Use {
    let parts = children(node);
    let (Some(qualifier), Some(last)) = (parts.first().copied(), parts.last().copied()) else { return Use::Unknown };
    let index = context.resolver.index;
    let Some(target) = context.resolver.type_of(node) else { return Use::Unknown };
    let Some((_, function)) = index.functional_method(&target.name()) else { return Use::Unknown };
    let name = if last.kind() == "new" { "<init>" } else { context.text(last) };
    let candidates = referenced(context, qualifier, name, function.parameters.len());
    let mut found: Vec<Option<Restriction>> = candidates.iter().map(|(class, method)| restriction(context, &class.name, method)).collect();
    if found.is_empty() || found.iter().any(|one| key(one) != key(&found[0])) {
        return Use::Unknown;
    }
    let receiver = context.resolver.reference_owner(node).map(|(owner, _)| owner.name()).unwrap_or_default();
    if candidates.iter().any(|(class, method)| ambiguous(context, &receiver, &class.name, method, &found[0])) {
        return Use::Unknown;
    }
    Use::Known(found.swap_remove(0))
}

/// The simple name of the class a constructor use creates, as far as the source spells it or the index gives it.
fn created(context: &Context, node: Node) -> Option<String> {
    let index = context.resolver.index;
    let own = || enclosing_type(context.file, context.resolver.scope, node);
    let above = || own().and_then(|class| index.get(&class)?.superclass.clone());
    let class = match node.kind() {
        "object_creation_expression" => {
            let written = node.child_by_field_name("type").map(|kind| context.text(kind)).unwrap_or_default();
            let bare = written.split('<').next().unwrap_or_default();
            return bare.rsplit('.').next().map(|last| last.split_whitespace().last().unwrap_or_default().to_string());
        }
        "method_reference" => {
            let written = children(node).first().map(|first| context.text(*first)).unwrap_or_default();
            let bare = written.split('<').next().unwrap_or_default();
            return bare.rsplit('.').next().map(|last| last.trim().to_string());
        }
        "explicit_constructor_invocation" if node.child_by_field_name("constructor").is_some_and(|word| word.kind() == "this") => own()?,
        "enum_constant" => own()?,
        _ => above()?,
    };
    Some(simple_name(&class).to_string())
}

/// Whether the use spells a name that some restricted method has; other uses need no resolving.
fn named(context: &Context, node: Node) -> bool {
    let names = context.resolver.index.restricted_names();
    let constructor = |node: Node| created(context, node).is_none_or(|class| names.contains(&format!("new {class}")));
    match node.kind() {
        "method_invocation" => node.child_by_field_name("name").is_some_and(|name| names.contains(context.text(name))),
        "method_reference" => children(node).last().is_some_and(|last| if last.kind() == "new" { constructor(node) } else { names.contains(context.text(*last)) }),
        _ => constructor(node),
    }
}

/// The body of a constructor that starts without `this(...)` or `super(...)`, where javac adds `super()`.
fn implicit_super(node: Node) -> Option<Node> {
    let body = node.child_by_field_name("body")?;
    let first = children(body).into_iter().find(|part| part.is_named() && !part.kind().ends_with("comment"));
    if first.is_some_and(|part| part.kind() == "explicit_constructor_invocation") {
        return None;
    }
    let class = crate::engine::source::parent(crate::engine::source::parent(node)?)?;
    (class.kind() == "class_declaration").then_some(body)
}

/// A file the parse could not read whole may hold uses the walk does not see: when it spells a restricted name,
/// Error Prone decides.
fn unparsed(context: &Context, root: Node) {
    let names = context.resolver.index.restricted_names();
    let text = &context.file.text;
    let spelled = text.contains("\\u") || names.iter().any(|name| {
        let word = name.strip_prefix("new ").unwrap_or(name);
        text.match_indices(word).any(|(at, _)| {
            let part = |c: char| c.is_alphanumeric() || c == '_' || c == '$';
            !text[..at].chars().next_back().is_some_and(part) && !text[at + word.len()..].chars().next().is_some_and(part)
        })
    });
    if spelled {
        context.hand_back(CHECK, root);
    }
}

pub fn restricted_api(context: &Context, node: Node) {
    if node.kind() == "program" {
        if node.has_error() && !context.resolver.index.restricted_names().is_empty() && context.resolver.index.has(ANNOTATION) {
            unparsed(context, node);
        }
        return;
    }
    let kinds = ["method_invocation", "explicit_constructor_invocation", "object_creation_expression", "method_reference", "enum_constant", "constructor_declaration"];
    if !kinds.contains(&node.kind()) || context.resolver.index.restricted_names().is_empty() || !context.resolver.index.has(ANNOTATION) || !named(context, node) {
        return;
    }
    let resolver = context.resolver;
    let (used, at) = match node.kind() {
        "method_invocation" => (of_call(context, resolver.resolve_call(node)), position(node)),
        "explicit_constructor_invocation" => {
            let at = node.child_by_field_name("arguments").map_or(node.start_byte(), |list| list.start_byte());
            (of_call(context, resolver.resolve_delegation(node)), at)
        }
        "object_creation_expression" => (of_call(context, resolver.resolve_constructor(node)), position(node)),
        "method_reference" => (of_reference(context, node), node.start_byte()),
        "enum_constant" => {
            let after = node.child_by_field_name("arguments").or_else(|| children(node).into_iter().find(|part| part.kind() == "class_body"));
            let at = after.or_else(|| node.child_by_field_name("name")).map_or(node.start_byte(), |part| part.start_byte());
            (of_call(context, resolver.resolve_enum_constant(node)), at)
        }
        _ => {
            let Some(body) = implicit_super(node) else { return };
            (of_call(context, resolver.resolve_implicit_super(node)), body.start_byte())
        }
    };
    match used {
        Use::Unknown => context.hand_back(CHECK, node),
        Use::Known(Some(found)) => check(context, node, at, &found),
        Use::Known(None) => {}
    }
}

/// The node whose parent javac's tree path continues from: an enum constant is a variable around its own `new`, and
/// the `super()` javac adds sits in the constructor's body.
fn path_start(node: Node) -> Node {
    match node.kind() {
        "enum_constant" => children(node).into_iter().next().unwrap_or(node),
        "constructor_declaration" => node.child_by_field_name("body").unwrap_or(node),
        _ => node,
    }
}

fn check(context: &Context, node: Node, at: usize, found: &Restriction) {
    let index = context.resolver.index;
    let text = |name: &str| found.kept.get(name).map(|element| index.element_text(&found.class, element));
    if let Some(path) = text("allowedOnPath") {
        let Some(path) = path else { return context.hand_back(CHECK, node) };
        if !path.is_empty() {
            match uri::file_uri(std::path::Path::new(&context.file.path)).and_then(|uri| pattern::matches(&path, &uri)) {
                Some(true) => return,
                Some(false) => {}
                None => return context.hand_back(CHECK, node),
            }
        }
    }
    let Some(Some(explanation)) = text("explanation") else { return context.hand_back(CHECK, node) };
    let listed = |first: &str, legacy: &str| found.kept.get(first).or_else(|| found.kept.get(legacy)).map(|element| element.classes()).unwrap_or_default();
    let start = path_start(node);
    let warn = enclosing::enclosing_has(context, start, &listed("allowlistWithWarningAnnotations", "whitelistWithWarningAnnotations"));
    let allow = enclosing::enclosing_has(context, start, &listed("allowlistAnnotations", "whitelistAnnotations"));
    if warn && allow {
        let message = format!(
            "The Restricted API ({explanation}) call here is both allowlisted-as-warning and silently allowlisted. Please remove one of the conflicting suppression annotations."
        );
        context.report(CHECK, node, at, &message);
    } else if !allow {
        context.report(CHECK, node, at, &explanation);
    }
}
