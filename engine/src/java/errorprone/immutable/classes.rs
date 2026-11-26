//! `ImmutableAnalysis.checkForImmutability`: the fields, the supertypes and the enclosing instances of a class.
use super::super::Context;
use super::super::fix_helpers::add_modifiers;
use super::super::fixes::Fix;
use super::super::hierarchy::simple_name;
use super::safety::{Violation, marker, plus, super_instantiation, thread_safe};
use super::written::{Written, from_type, text, written};
use crate::engine::source::children;
use crate::java::helpers::{has_modifier, modifiers};
use crate::java::types::model::{ClassInfo, Field, OBJECT, Type, flag};
use tree_sitter::Node;

const LAZY: &str = "com.google.errorprone.annotations.concurrent.LazyInit";
const ANNOTATION: &str = "java.lang.annotation.Annotation";

/// Where findings go and how their text starts.
pub struct Reporter<'r> {
    pub check: &'static str,
    pub names: &'static [&'static str],
    pub describe: &'r dyn Fn(&str) -> String,
}

impl Reporter<'_> {
    pub fn quiet(&self, context: &Context, node: Node) -> bool {
        self.names.iter().any(|name| context.suppressed(name, node))
    }
    pub fn report(&self, context: &Context, node: Node, at: usize, why: &[String], fixes: &[Fix]) {
        if self.quiet(context, node) {
            return;
        }
        context.report_always_fixed(self.check, at, &(self.describe)(&why.join(", ")), fixes);
    }
}

/// The name javac's `getPrettyName` gives: the simple name, or what an anonymous class extends.
pub fn pretty(context: &Context, name: &str) -> String {
    let simple = simple_name(name);
    if !simple.chars().all(|part| part.is_ascii_digit()) {
        return simple.trim_start_matches(|part: char| part.is_ascii_digit()).to_string();
    }
    if let Some(constant) = super::vars::class_node(context, name).filter(|node| node.kind() == "enum_constant").and_then(|node| node.child_by_field_name("name")) {
        return context.text(constant).to_string();
    }
    let Some(info) = context.resolver.index.get(name) else { return simple.to_string() };
    let above = match info.superclass.as_deref() {
        Some(OBJECT) | None => info.interfaces.first().map(String::as_str).or(info.superclass.as_deref()),
        other => other,
    };
    above.map_or_else(|| simple.to_string(), |above| simple_name(above).to_string())
}

pub fn own_type(info: &ClassInfo) -> Type {
    Type::Class(info.name.clone(), info.type_parameters.iter().map(|(name, _)| Type::Variable(name.clone())).collect())
}

struct SourceField<'t> {
    declaration: Node<'t>,
    name: Node<'t>,
    kind: Option<Written>,
    fixed: bool,
    lazy: bool,
    suppress_from: Node<'t>,
}

fn marked_lazy(context: &Context, declaration: Node) -> bool {
    modifiers(declaration).map(children).unwrap_or_default().into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")).any(|part| {
        part.child_by_field_name("name").is_some_and(|name| context.resolver.class_name(declaration, context.text(name)).as_deref() == Some(LAZY))
    })
}

fn wrap(mut kind: Written, extra: Option<Node>) -> Written {
    for _ in extra.map(children).unwrap_or_default().iter().filter(|part| part.kind() == "[") {
        kind = Written::Array(Box::new(kind));
    }
    kind
}

/// The instance fields a class body declares, in order; a record starts with its components.
fn source_fields<'t>(context: &Context, class: Node<'t>) -> Vec<SourceField<'t>> {
    let mut found = Vec::new();
    if class.kind() == "record_declaration" {
        for component in class.child_by_field_name("parameters").map(children).unwrap_or_default() {
            let Some(name) = component.child_by_field_name("name").or_else(|| children(component).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|part| part.child_by_field_name("name"))) else { continue };
            let kind = component.child_by_field_name("type").and_then(|kind| written(context, kind)).map(|kind| if component.kind() == "spread_parameter" { Written::Array(Box::new(kind)) } else { kind });
            found.push(SourceField { declaration: component, name, kind, fixed: true, lazy: false, suppress_from: component });
        }
    }
    let Some(body) = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body")) else { return found };
    let members = children(body).into_iter().flat_map(|part| if part.kind() == "enum_body_declarations" { children(part) } else { vec![part] });
    for field in members.filter(|member| member.kind() == "field_declaration" && !has_modifier(*member, "static")) {
        let kind = field.child_by_field_name("type").and_then(|kind| written(context, kind));
        let (fixed, lazy) = (has_modifier(field, "final"), marked_lazy(context, field));
        for declarator in children(field).into_iter().filter(|part| part.kind() == "variable_declarator") {
            let Some(name) = declarator.child_by_field_name("name") else { continue };
            let kind = kind.clone().map(|kind| wrap(kind, declarator.child_by_field_name("dimensions")));
            found.push(SourceField { declaration: field, name, kind, fixed, lazy, suppress_from: field });
        }
    }
    found
}

fn own_quiet(context: &Context, names: &[&str], declaration: Node) -> bool {
    let strings = context.suppress_strings(declaration);
    strings.iter().any(|name| name == "all" || names.contains(&name.as_str()))
}

fn fields_of_tree(context: &Context, reporter: &Reporter, class: Node, name: &str, containers: &[String]) {
    let pretty = pretty(context, name);
    for field in source_fields(context, class) {
        if own_quiet(context, reporter.names, field.suppress_from) {
            continue;
        }
        let label = context.text(field.name);
        if !field.fixed && !field.lazy {
            let fix = add_modifiers(Fix::new(), field.declaration, &["final"]);
            reporter.report(context, field.name, field.name.start_byte(), &[format!("'{pretty}' has non-final field '{label}'")], &[fix]);
            continue;
        }
        let Some(kind) = field.kind else { continue };
        if let Some(why) = thread_safe(context, true, containers, &kind, &mut Vec::new()) {
            let why = plus(why, format!("'{pretty}' has field '{label}' of type '{}'", text(&kind)));
            reporter.report(context, field.name, field.name.start_byte(), &why, &[]);
        }
    }
}

/// What javac's `memberType` makes of a field read from the index, seen through the type arguments of `site`.
fn member(context: &Context, scope: &str, site: &Type, info: &ClassInfo, kind: &Type, generic: &Type) -> Written {
    let Type::Class(_, given) = site else { return from_type(context, generic, scope) };
    if given.is_empty() && !info.type_parameters.is_empty() {
        return from_type(context, kind, scope);
    }
    let map = info.type_parameters.iter().map(|(name, _)| name.clone()).zip(given.iter().cloned()).collect();
    from_type(context, &generic.substitute(&map), scope)
}

fn index_field(context: &Context, scope: &str, site: &Type, info: &ClassInfo, field: &Field, containers: &[String]) -> Violation {
    let pretty = pretty(context, &info.name);
    if field.flags & flag::FINAL == 0 && !field.annotations.iter().any(|name| name == LAZY) {
        return Some(vec![format!("'{pretty}' has non-final field '{}'", field.name)]);
    }
    let kind = member(context, scope, site, info, &field.kind, &field.generic);
    thread_safe(context, true, containers, &kind, &mut Vec::new()).map(|why| plus(why, format!("'{pretty}' has field '{}' of type '{}'", field.name, text(&kind))))
}

fn fields_of_index(context: &Context, names: &[&str], scope: &str, site: &Type, containers: &[String]) -> Violation {
    let info = context.resolver.index.get(&site.name())?;
    let source = super::vars::class_node(context, &info.name).map(|class| source_fields(context, class));
    let quiet = |field: &Field| source.as_ref().is_some_and(|all| all.iter().any(|known| context.text(known.name) == field.name && own_quiet(context, names, known.suppress_from)));
    info.fields.iter().filter(|field| field.flags & flag::STATIC == 0 && !field.name.contains('$') && !quiet(field)).find_map(|field| index_field(context, scope, site, info, field, containers))
}

/// `areFieldsImmutable`: with a tree each finding is reported at its field and nothing is returned.
pub fn fields_immutable(context: &Context, reporter: &Reporter, tree: Option<Node>, scope: &str, site: &Type, containers: &[String]) -> Violation {
    match tree {
        Some(class) => {
            fields_of_tree(context, reporter, class, &site.name(), containers);
            None
        }
        None => fields_of_index(context, reporter.names, scope, site, containers),
    }
}

/// `Types.supertype` and `Types.interfaces`: the direct supertypes seen through the type arguments of `site`.
fn supertypes(context: &Context, site: &Type) -> (Option<Type>, Vec<Type>) {
    let index = context.resolver.index;
    let Some(info) = index.get(&site.name()) else { return (None, Vec::new()) };
    let Type::Class(_, given) = site else { return (None, Vec::new()) };
    let raw = given.is_empty() && !info.type_parameters.is_empty();
    let map = info.type_parameters.iter().map(|(name, _)| name.clone()).zip(given.iter().cloned()).collect();
    let see = |kind: &Type| if raw { kind.erased() } else { kind.substitute(&map) };
    let mut above: Vec<Type> = info.generic_supers.iter().map(|kind| see(kind)).collect();
    let parent = info.superclass.as_ref().and_then(|name| above.iter().position(|kind| kind.name() == *name));
    let parent = parent.map(|at| above.remove(at)).or_else(|| info.superclass.as_ref().map(|name| Type::class(name)));
    above.retain(|kind| info.interfaces.contains(&kind.name()));
    (parent, above)
}

fn given(context: &Context, scope: &str, kind: &Type) -> Written {
    from_type(context, kind, scope)
}

fn extends_text(context: &Context, below: &str, above: &str) -> String {
    format!("'{}' extends '{}'", pretty(context, below), pretty(context, above))
}

fn check_super(context: &Context, reporter: &Reporter, scope: &str, site: &Type, containers: &[String]) -> Violation {
    let index = context.resolver.index;
    let (Some(above), _) = supertypes(context, site) else { return None };
    if above.name() == OBJECT || index.is_subtype(&site.name(), ANNOTATION) {
        return None;
    }
    let message = extends_text(context, &site.name(), &above.name());
    let Written::Class(name, args, _) = given(context, scope, &above) else { return None };
    let why = match marker(context, &name) {
        Some(found) => super_instantiation(context, containers, &found, &name, args.as_ref()),
        None => for_type(context, reporter, None, scope, &above, containers),
    };
    why.map(|why| plus(why, message))
}

/// The enclosing instance types of a class read from the index, nearest first.
fn index_enclosing(context: &Context, name: &str) -> Vec<Type> {
    let index = context.resolver.index;
    let mut found = Vec::new();
    let mut current = name.to_string();
    while let Some((outer, _)) = current.rsplit_once('.') {
        let (Some(inner), Some(holder)) = (index.get(&current), index.get(outer)) else { break };
        if inner.flags & (flag::STATIC | flag::ENUM | flag::RECORD | flag::ANNOTATION) != 0 || inner.is_interface || holder.is_interface {
            break;
        }
        found.push(own_type(holder));
        current = outer.to_string();
    }
    found
}

pub fn mutable_enclosing(context: &Context, tree: Option<Node>, name: &str, scope: &str) -> Option<String> {
    let chain = match tree {
        Some(class) => {
            if !super::enclosing::references_outer(context, scan_root(class), name) {
                return None;
            }
            super::enclosing::instance_chain(context, class)
        }
        None => index_enclosing(context, name),
    };
    for outer in chain {
        let kind = from_type(context, &outer, scope);
        let Written::Class(class, _, _) = &kind else { continue };
        if marker(context, class).is_none() && thread_safe(context, false, &[], &kind, &mut Vec::new()).is_some() {
            return Some(text(&kind));
        }
    }
    None
}

/// `checkForImmutability` for the type `site` (the class itself when it has a tree).
pub fn for_type(context: &Context, reporter: &Reporter, tree: Option<Node>, scope: &str, site: &Type, containers: &[String]) -> Violation {
    let index = context.resolver.index;
    let name = site.name();
    let info = index.get(&name)?;
    if let Some(why) = fields_immutable(context, reporter, tree, scope, site, containers) {
        return Some(why);
    }
    let (_, interfaces) = supertypes(context, site);
    for interface in interfaces {
        let Written::Class(above, args, _) = given(context, scope, &interface) else { continue };
        let Some(found) = marker(context, &above) else { continue };
        if let Some(why) = super_instantiation(context, containers, &found, &above, args.as_ref()) {
            return Some(plus(why, extends_text(context, &name, &above)));
        }
    }
    let enum_body = tree.is_some_and(|class| class.kind() == "enum_constant");
    if info.flags & flag::ENUM == 0 && !enum_body {
        if let Some(why) = check_super(context, reporter, scope, site, containers) {
            return Some(why);
        }
    }
    let outer = mutable_enclosing(context, tree, &name, scope)?;
    Some(vec![format!("'{}' has mutable enclosing instance '{}'", pretty(context, &name), outer)])
}

pub fn declaration_name(context: &Context, class: Node) -> Option<String> {
    context.resolver.scope.names.get(&class.id()).cloned()
}

pub fn annotation_node<'t>(context: &Context, class: Node<'t>, simple: &str) -> Option<Node<'t>> {
    modifiers(class).map(children).unwrap_or_default().into_iter().find(|part| {
        matches!(part.kind(), "annotation" | "marker_annotation") && part.child_by_field_name("name").is_some_and(|name| context.text(name).rsplit('.').next() == Some(simple))
    })
}

/// The members of an anonymous class are all javac's class tree holds of it.
pub fn scan_root(class: Node) -> Node {
    match class.kind() {
        "object_creation_expression" => children(class).into_iter().find(|part| part.kind() == "class_body").unwrap_or(class),
        "enum_constant" => class.child_by_field_name("body").unwrap_or(class),
        _ => class,
    }
}

/// Where javac reports a class: its keyword, or the brace of an anonymous class.
pub fn keyword(class: Node) -> usize {
    if matches!(class.kind(), "object_creation_expression" | "enum_constant") {
        return scan_root(class).start_byte();
    }
    let words = ["class", "interface", "enum", "record", "@interface"];
    children(class).into_iter().find(|part| words.contains(&part.kind())).map_or(class.start_byte(), |word| word.start_byte())
}
