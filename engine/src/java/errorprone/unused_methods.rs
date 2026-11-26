//! UnusedMethod: a method or constructor that nothing outside its file can reach and nothing inside it uses.
use super::Context;
use super::fix_helpers::replace_including_comments;
use super::fixes::{Fix, sentence};
use super::boxed::effectively_private;
use super::hierarchy::{declared_method, formals, overrides};
use super::keep::{METHODS, should_keep};
use super::returns::referenced;
use crate::engine::source::{children, named_children, walk};
use crate::java::helpers::{has_modifier, modifiers};
use crate::java::types::model::Type;
use tree_sitter::Node;

const NAME: &str = "UnusedMethod";
const NAMES: [&str; 5] = [NAME, "Unused", "unused", "UnusedParameters", "all"];
const TYPES: [&str; 5] = ["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];
const METHODS_KINDS: [&str; 4] = ["method_declaration", "constructor_declaration", "compact_constructor_declaration", "annotation_type_element_declaration"];

struct Candidate<'t> {
    node: Node<'t>,
    class: String,
    name: String,
    parameters: Vec<Type>,
    varargs: bool,
    used: bool,
}

fn suppressed(context: &Context, node: Node) -> bool {
    NAMES.iter().any(|name| context.suppressed(name, node))
}

fn annotation_nodes<'t>(declaration: Node<'t>) -> Vec<Node<'t>> {
    modifiers(declaration).map(children).unwrap_or_default().into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")).collect()
}

fn annotation_named(context: &Context, annotation: Node, wanted: &str) -> bool {
    annotation.child_by_field_name("name").is_some_and(|name| {
        let written = context.text(name);
        written.rsplit('.').next() == wanted.rsplit('.').next() && context.resolver.class_name(annotation, written).as_deref().unwrap_or(written) == wanted
    })
}

/// A `@Parameters` annotation of JUnitParams that can name a method of the class as its source.
fn names_a_source(context: &Context, method: Node) -> bool {
    for annotation in annotation_nodes(method).into_iter().filter(|annotation| annotation_named(context, *annotation, "junitparams.Parameters")) {
        let arguments = annotation.child_by_field_name("arguments").map(named_children).unwrap_or_default();
        if arguments.is_empty() {
            return true;
        }
        for argument in arguments {
            if argument.kind() != "element_value_pair" {
                return false;
            }
            if argument.child_by_field_name("key").is_some_and(|key| context.text(key) != "value") {
                return true;
            }
        }
    }
    false
}

fn serialization(context: &Context, owner: &str, declared: &crate::java::types::model::Method) -> bool {
    if !context.resolver.index.is_subtype(owner, "java.io.Serializable") {
        return false;
    }
    let only = |wanted: &str| declared.parameters.len() == 1 && declared.parameters[0].name() == wanted;
    match declared.name.as_str() {
        "readObject" => only("java.io.ObjectInputStream"),
        "writeObject" => only("java.io.ObjectOutputStream"),
        "readObjectNoData" => declared.returns == Type::Primitive("void"),
        "readResolve" | "writeReplace" => declared.returns.name() == "java.lang.Object",
        _ => false,
    }
}

fn class_of(context: &Context, declaration: Node) -> Option<String> {
    context.resolver.scope.names.get(&declaration.id()).cloned()
}

fn candidates<'t>(context: &Context, root: Node<'t>) -> Option<Vec<Candidate<'t>>> {
    let index = context.resolver.index;
    let mut native = false;
    let mut visible = Vec::new();
    let mut methods = Vec::new();
    walk(root, |node| {
        if TYPES.contains(&node.kind()) && !effectively_private(node) {
            visible.extend(class_of(context, node));
        }
        if METHODS_KINDS.contains(&node.kind()) {
            native |= has_modifier(node, "native");
            methods.push(node);
        }
    });
    if native {
        return None;
    }
    let mut found = Vec::new();
    let mut sourced = false;
    for node in methods {
        let marked = modifiers(node).is_some_and(|list| children(list).iter().any(|part| part.kind().ends_with("annotation")));
        if marked && !suppressed(context, node) {
            sourced |= names_a_source(context, node);
        }
        let written = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
        let constructor = node.kind().ends_with("constructor_declaration");
        if !effectively_private(node) || (!constructor && written.to_ascii_lowercase().starts_with("unused")) {
            continue;
        }
        if suppressed(context, node) || (marked && should_keep(context, node, METHODS)) {
            continue;
        }
        if constructor && formals(node).is_empty() {
            continue;
        }
        let Some((origin, declared)) = declared_method(context, node) else { continue };
        if overrides(context, node) || serialization(context, &origin.name, declared) {
            continue;
        }
        if declared.parameters.last().is_some_and(|last| index.has("com.google.gwt.core.client.JavaScriptObject") && index.is_subtype(&last.name(), "com.google.gwt.core.client.JavaScriptObject")) {
            continue;
        }
        if !super::boxed::is_private(node) && visible.iter().any(|class| index.is_subtype(class, &origin.name)) {
            continue;
        }
        found.push(Candidate { node, class: origin.name.clone(), name: declared.name.clone(), parameters: declared.parameters.clone(), varargs: declared.varargs, used: false });
    }
    (!sourced).then_some(found)
}

fn mark(found: &mut [Candidate], class: &str, name: &str, parameters: &[Type]) {
    for candidate in found.iter_mut().filter(|candidate| candidate.name == name && candidate.class == class && candidate.parameters == parameters) {
        candidate.used = true;
    }
}

/// A use that could not be worked out counts for every method of that name that can take as many arguments.
fn mark_named(found: &mut [Candidate], name: &str, count: Option<usize>) {
    let fits = |candidate: &Candidate| count.is_none_or(|count| candidate.parameters.len() == count || (candidate.varargs && candidate.parameters.len() <= count + 1));
    for candidate in found.iter_mut().filter(|candidate| candidate.name == name && fits(candidate)) {
        candidate.used = true;
    }
}

fn method_sources(context: &Context, method: Node, found: &mut [Candidate]) {
    for annotation in annotation_nodes(method).into_iter().filter(|annotation| annotation_named(context, *annotation, "org.junit.jupiter.params.provider.MethodSource")) {
        let mut names = Vec::new();
        if let Some(arguments) = annotation.child_by_field_name("arguments") {
            let keyed: Vec<Node> = named_children(arguments).into_iter().filter(|part| part.kind() == "element_value_pair").collect();
            let values: Vec<Node> = if keyed.is_empty() {
                vec![arguments]
            } else {
                keyed.into_iter().filter(|pair| pair.child_by_field_name("key").is_some_and(|key| context.text(key) == "value")).collect()
            };
            for value in values {
                walk(value, |part| {
                    if part.kind() == "string_literal" {
                        names.extend(crate::java::types::expr::literal_text(context.file, part));
                    }
                });
            }
        }
        if names.is_empty() {
            names.extend(method.child_by_field_name("name").map(|name| context.text(name).to_string()));
        }
        for candidate in found.iter_mut() {
            let qualified = format!("{}#{}", candidate.class, candidate.name);
            candidate.used |= names.contains(&candidate.name) || names.contains(&qualified);
        }
    }
}

/// The one method a call can mean when a single method of that name takes that many arguments: the types of the
/// arguments need not be worked out then.
fn only_fit(context: &Context, call: Node, name: &str, given: usize, found: &[Candidate]) -> Option<(String, Vec<Type>)> {
    let index = context.resolver.index;
    let takes = |method: &crate::java::types::model::Method| method.parameters.len() == given && !method.varargs;
    let variable = |method: &crate::java::types::model::Method| method.varargs && method.parameters.len() <= given + 1;
    let owner = match call.kind() {
        "object_creation_expression" => {
            if children(call).iter().any(|part| part.kind() == "class_body") || call.child_by_field_name("object").is_some() {
                return None;
            }
            let written = call.child_by_field_name("type")?;
            context.resolver.type_node(written).map(|kind| kind.name())?
        }
        "method_invocation" if call.child_by_field_name("object").is_none() => {
            let around = crate::java::types::scope::enclosing_types(context.resolver.scope, call);
            around.into_iter().find(|owner| !index.methods(owner, name).is_empty())?
        }
        _ => return None,
    };
    if !found.iter().any(|candidate| candidate.name == name && index.is_subtype(&owner, &candidate.class)) {
        return None;
    }
    let methods = index.methods(&owner, name);
    if methods.iter().any(|(_, method)| variable(method)) {
        return None;
    }
    let mut fits = methods.into_iter().filter(|(_, method)| takes(method));
    let (class, method) = fits.next()?;
    fits.next().is_none().then(|| (class.name.clone(), method.parameters.clone()))
}

fn usages(context: &Context, root: Node, found: &mut [Candidate]) {
    walk(root, |node| match node.kind() {
        "method_invocation" | "object_creation_expression" | "explicit_constructor_invocation" | "enum_constant" => {
            let name = match node.kind() {
                "method_invocation" => node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default(),
                _ => "<init>",
            };
            let created = node.child_by_field_name("type").map(|written| context.text(written).split('<').next().unwrap_or_default().trim());
            let created = created.map(|written| written.rsplit('.').next().unwrap_or(written));
            let open = |candidate: &Candidate| {
                candidate.name == name && !candidate.used && created.is_none_or(|created| super::hierarchy::simple_name(&candidate.class) == created)
            };
            if !found.iter().any(open) {
                return;
            }
            let given = node.child_by_field_name("arguments").map(named_children).unwrap_or_default().iter().filter(|part| !part.kind().ends_with("comment")).count();
            if let Some((class, parameters)) = only_fit(context, node, name, given, found) {
                return mark(found, &class, name, &parameters);
            }
            let resolved = match node.kind() {
                "method_invocation" => context.resolver.resolve_call(node),
                _ => context.resolver.call_formals(node).map(|(resolved, _)| resolved),
            };
            match resolved {
                Some(resolved) => mark(found, &resolved.declaring, name, &resolved.method.parameters),
                None => {
                    let given = node.child_by_field_name("arguments").map(named_children).unwrap_or_default();
                    mark_named(found, name, Some(given.iter().filter(|part| !part.kind().ends_with("comment")).count()));
                }
            }
        }
        "method_reference" => {
            let parts = children(node);
            let (Some(qualifier), Some(last)) = (parts.first().copied(), parts.last().copied()) else { return };
            let name = if last.kind() == "new" { "<init>" } else { context.text(last) };
            if !found.iter().any(|candidate| candidate.name == name && !candidate.used) {
                return;
            }
            let index = context.resolver.index;
            let arity = context.resolver.type_of(node).and_then(|target| index.functional_method(&target.name()).map(|(_, function)| function.parameters.len()));
            let named = arity.map(|arity| referenced(context, qualifier, name, arity)).unwrap_or_default();
            if named.is_empty() {
                return mark_named(found, name, None);
            }
            for (class, method) in named {
                mark(found, &class.name, name, &method.parameters);
            }
        }
        "element_value_pair" => {
            if let Some(key) = node.child_by_field_name("key") {
                let name = context.text(key);
                for candidate in found.iter_mut().filter(|candidate| candidate.name == name && candidate.node.kind() == "annotation_type_element_declaration") {
                    candidate.used = true;
                }
            }
        }
        "record_pattern" => {
            let written = named_children(node).into_iter().find(|part| part.kind().ends_with("identifier") || part.kind() == "generic_type");
            let class = written.and_then(|written| context.resolver.type_node(written)).map(|kind| kind.name());
            for candidate in found.iter_mut().filter(|candidate| candidate.parameters.is_empty() && Some(&candidate.class) == class.as_ref()) {
                candidate.used = true;
            }
        }
        kind if METHODS_KINDS.contains(&kind) => method_sources(context, node, found),
        _ => {}
    });
}

/// The class a constructor belongs to.
fn owner_of(constructor: Node) -> Option<Node> {
    let mut at = constructor.parent();
    while let Some(node) = at {
        if TYPES.contains(&node.kind()) {
            return Some(node);
        }
        at = node.parent();
    }
    None
}

fn members_of<'t>(class: Node<'t>) -> Vec<Node<'t>> {
    let Some(body) = class.child_by_field_name("body") else { return Vec::new() };
    let mut members = Vec::new();
    for part in children(body) {
        if part.kind() == "enum_body_declarations" {
            members.extend(children(part));
        } else {
            members.push(part);
        }
    }
    members
}

/// How many constructors the class has, the implicit ones included.
fn constructor_count(context: &Context, class: Node) -> usize {
    let explicit: Vec<Node> = members_of(class).into_iter().filter(|part| part.kind().ends_with("constructor_declaration")).collect();
    if class.kind() != "record_declaration" {
        return explicit.len().max(1);
    }
    let components: Vec<String> = class.child_by_field_name("parameters").map(named_children).unwrap_or_default().iter().map(|part| written_type(context, *part)).collect();
    let canonical = explicit.iter().any(|part| part.kind() == "compact_constructor_declaration" || formals(*part).iter().map(|formal| written_type(context, *formal)).eq(components.iter().cloned()));
    explicit.len() + usize::from(!canonical)
}

fn written_type(context: &Context, parameter: Node) -> String {
    parameter.child_by_field_name("type").map(|kind| context.text(kind).split_whitespace().collect()).unwrap_or_default()
}

fn has_final_field(class: Node) -> bool {
    class.kind() == "record_declaration" && class.child_by_field_name("parameters").is_some_and(|list| !named_children(list).is_empty())
        || members_of(class).into_iter().any(|part| part.kind() == "field_declaration" && has_modifier(part, "final"))
}

fn constructor_fix(context: &Context, unused: &[&Candidate]) -> Option<Fix> {
    let class = owner_of(unused[0].node)?;
    let mut fix = Fix::new();
    let all = constructor_count(context, class) == unused.len();
    if all {
        let last = unused[unused.len() - 1].node;
        let name = class.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
        fix = fix.insert(last.end_byte(), format!("private {name}() {{}}"));
        if has_final_field(class) {
            return None;
        }
    }
    for candidate in unused {
        fix = fix.merged(replace_including_comments(context, candidate.node, ""));
    }
    Some(fix)
}

fn report(context: &Context, at: usize, message: &str, fixes: &[Fix]) {
    context.report_always(NAME, at, &format!("{message}{}", sentence(&context.file.text, fixes)));
}

pub fn unused_method(context: &Context, root: Node) {
    if root.kind() != "program" {
        return;
    }
    let Some(mut found) = candidates(context, root).filter(|found| !found.is_empty()) else { return };
    usages(context, root, &mut found);
    let mut constructed: Vec<String> = Vec::new();
    for candidate in found.iter().filter(|candidate| !candidate.used) {
        let at = candidate.node.child_by_field_name("name").map_or(candidate.node.start_byte(), |name| name.start_byte());
        if candidate.name != "<init>" {
            let fix = replace_including_comments(context, candidate.node, "");
            report(context, at, &format!("Method '{}' is never used.", candidate.name), &[fix]);
        } else if !constructed.contains(&candidate.class) {
            constructed.push(candidate.class.clone());
            let simple = super::hierarchy::simple_name(&candidate.class);
            let siblings: Vec<&Candidate> = found.iter().filter(|other| !other.used && other.name == "<init>" && other.class == candidate.class).collect();
            let fixes: Vec<Fix> = constructor_fix(context, &siblings).into_iter().collect();
            report(context, at, &format!("Constructor '{simple}' is never used."), &fixes);
        }
    }
}
