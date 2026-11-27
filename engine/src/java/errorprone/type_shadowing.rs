//! TypeNameShadowing: a type parameter named like a type that is visible where it is declared. Error Prone looks in
//! javac's scopes from the class around the declaration outwards: the member types of each enclosing class, the
//! top-level classes of the file, the single-type imports, every class file of `java.lang`, and the classes of the
//! package.
use super::Context;
use super::fixes::Fix;
use super::nodes::{class_position, name_position};
use super::shadow::{CLASS_LIKE, METHOD_LIKE, parameters_of, replacement};
use super::typevars::{rename, valid_name};
use crate::engine::source::{children, parent};
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

/// The class files of `java.lang` in `java.base` of JDK 21, by their names after the package.
const JAVA_LANG: &str = include_str!("java_lang_21.txt");

/// The types declared directly in a class body, with their full names.
fn member_types<'t>(context: &Context, class: Node<'t>) -> Vec<(String, Node<'t>)> {
    let Some(body) = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body")) else {
        return Vec::new();
    };
    let mut members = children(body);
    if let Some(rest) = members.iter().copied().find(|part| part.kind() == "enum_body_declarations") {
        members.extend(children(rest));
    }
    members
        .into_iter()
        .filter(|member| CLASS_LIKE.contains(&member.kind()))
        .filter_map(|member| member.child_by_field_name("name").map(|name| (context.text(name).to_string(), member)))
        .collect()
}

fn flat_name(context: &Context, class: &str) -> String {
    let package = context.resolver.index.get(class).map(|info| info.package.clone()).unwrap_or_default();
    match class.strip_prefix(&format!("{package}.")).filter(|_| !package.is_empty()) {
        Some(rest) => format!("{package}.{}", rest.replace('.', "$")),
        None => class.replace('.', "$"),
    }
}

struct Scope<'t> {
    /// The visible types declared in the file, innermost first: name and flat name.
    local: Vec<(String, String)>,
    imports: Vec<(String, String)>,
    package: String,
    /// The type parameters of the class whose scope Error Prone starts from.
    own: Vec<String>,
    context: &'t Context<'t>,
}

impl Scope<'_> {
    /// The flat name of the type the name stands for, in Error Prone's order.
    fn shadowed(&self, name: &str) -> Option<String> {
        if let Some((_, flat)) = self.local.iter().chain(&self.imports).find(|(known, _)| known == name) {
            return Some(flat.clone());
        }
        if JAVA_LANG.lines().any(|line| line == name) {
            return Some(format!("java.lang.{name}"));
        }
        let full = if self.package.is_empty() { name.to_string() } else { format!("{}.{name}", self.package) };
        let index = self.context.resolver.index;
        index.get(&full).filter(|info| info.package == self.package).map(|_| full)
    }

    fn visible(&self, name: &str) -> bool {
        self.own.iter().any(|known| known == name) || self.shadowed(name).is_some()
    }
}

fn scope<'t>(context: &'t Context<'t>, start: Node) -> Scope<'t> {
    let mut local = Vec::new();
    let mut class = Some(start);
    let mut skip = false;
    while let Some(at) = class {
        if !skip {
            for (name, member) in member_types(context, at) {
                let full = enclosing_type(context.file, context.resolver.scope, member).unwrap_or(name.clone());
                local.push((name, flat_name(context, &full)));
            }
        }
        skip = !is_member(at);
        class = enclosing_class(at);
    }
    let program = context.file.tree.root_node();
    for member in children(program).into_iter().filter(|member| CLASS_LIKE.contains(&member.kind())) {
        if let Some(name) = member.child_by_field_name("name") {
            let full = enclosing_type(context.file, context.resolver.scope, member).unwrap_or_default();
            local.push((context.text(name).to_string(), flat_name(context, &full)));
        }
    }
    let root = context.file.tree.root_node();
    let mut imports = Vec::new();
    let mut package = String::new();
    for declaration in children(root) {
        let text: String = context.text(declaration).split_whitespace().collect::<Vec<_>>().join(" ");
        if declaration.kind() == "package_declaration" {
            package = text.trim_start_matches("package").trim_end_matches(';').chars().filter(|letter| !letter.is_whitespace()).collect();
        }
        if declaration.kind() != "import_declaration" || text.ends_with(".*;") {
            continue;
        }
        let is_static = text.starts_with("import static ");
        let full: String = text.trim_start_matches("import").trim_start_matches(" static").trim_end_matches(';').chars().filter(|letter| !letter.is_whitespace()).collect();
        if is_static && !context.resolver.index.has(&full) {
            continue;
        }
        let simple = full.rsplit('.').next().unwrap_or_default().to_string();
        imports.push((simple, flat_name(context, &full)));
    }
    let own_class = if CLASS_LIKE.contains(&start.kind()) { Some(start) } else { None };
    let own = own_class.map(|class| parameters_of(context, class).into_iter().map(|(name, _)| name).collect()).unwrap_or_default();
    Scope { local, imports, package, own, context }
}

/// A member class: javac's environment of a local or anonymous class leads past the class around it, since the
/// environment of a method or initializer is a copy of the class's that keeps the class's own outer environment.
fn is_member(class: Node) -> bool {
    let holder = parent(class);
    let holder = holder.filter(|at| at.kind() == "enum_body_declarations").and_then(parent).or(holder);
    holder.is_some_and(|at| matches!(at.kind(), "class_body" | "interface_body" | "enum_body" | "annotation_type_body" | "program"))
}

fn enclosing_class(node: Node) -> Option<Node> {
    let mut current = parent(node);
    while let Some(at) = current {
        if CLASS_LIKE.contains(&at.kind()) || (at.kind() == "object_creation_expression" && children(at).iter().any(|part| part.kind() == "class_body")) {
            return Some(at);
        }
        current = parent(at);
    }
    None
}

pub fn type_name_shadowing(context: &Context, node: Node) {
    let is_class = CLASS_LIKE.contains(&node.kind());
    if !is_class && !METHOD_LIKE.contains(&node.kind()) {
        return;
    }
    let parameters = parameters_of(context, node);
    if parameters.is_empty() {
        return;
    }
    let Some(start) = (if is_class { Some(node) } else { enclosing_class(node) }) else { return };
    let scope = scope(context, start);
    let shadowed: Vec<(&String, Node, String)> =
        parameters.iter().filter_map(|(name, parameter)| scope.shadowed(name).map(|flat| (name, *parameter, flat))).collect();
    if shadowed.is_empty() {
        return;
    }
    let lines: Vec<String> = shadowed.iter().map(|(name, _, flat)| format!("Type parameter {name} shadows visible type {flat}")).collect();
    let message = format!("Found type parameters shadowing other declared types:\n\t{}", lines.join("\n\t"));
    let mut fix = Fix::new();
    for (name, parameter, _) in shadowed.iter().filter(|(name, ..)| valid_name(name)) {
        let mut taken: Vec<String> = Vec::new();
        let mut candidate = replacement(name, &taken);
        while scope.visible(&candidate) {
            taken.push(candidate);
            candidate = replacement(name, &taken);
        }
        fix = fix.merged(rename(context, node, *parameter, name, &candidate));
    }
    let at = if is_class { class_position(node) } else { name_position(node) };
    context.report_fixed("TypeNameShadowing", node, at, &message, &[fix]);
}
