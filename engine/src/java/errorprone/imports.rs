//! Checks on imports: static imports of types, and imports of names that read badly without their class.
use super::fixes::Fix;
use super::qualify::qualify;
use super::Context;
use crate::engine::source::{children, parent, walk};
use crate::java::types::model::flag;
use tree_sitter::Node;

#[derive(Clone)]
pub(super) struct Member {
    pub(super) owner: String,
    pub(super) class: bool,
}

fn lookup(context: &Context, class: &str, name: &str, package: &str, out: &mut Vec<Member>) {
    let index = context.resolver.index;
    let Some(info) = index.get(class) else { return };
    if let Some(parent) = &info.superclass {
        lookup(context, parent, name, package, out);
    }
    for interface in &info.interfaces {
        lookup(context, interface, name, package, out);
    }
    let visible = |public: bool, protected: bool, private: bool| !private && (public || info.package == package || (protected && info.package == package));
    let methods = info.methods.iter().any(|method| method.name == name && method.is_static && visible(method.flags & flag::PUBLIC != 0, method.flags & flag::PROTECTED != 0, method.is_private));
    let fields = info.fields.iter().any(|field| field.name == name && field.flags & flag::STATIC != 0 && visible(field.flags & flag::PUBLIC != 0 || info.is_interface, field.flags & flag::PROTECTED != 0, field.is_private));
    if methods || fields {
        out.push(Member { owner: class.to_string(), class: false });
    }
    let nested = format!("{class}.{name}");
    if let Some(inner) = index.get(&nested) {
        if inner.flags & flag::PRIVATE == 0 {
            out.push(Member { owner: nested, class: true });
        }
    }
}

pub(super) struct StaticImport<'t> {
    pub(super) owner: String,
    pub(super) name: String,
    pub(super) members: Vec<Member>,
    pub(super) declaration: Node<'t>,
}

pub(super) fn static_import<'t>(context: &Context, declaration: Node<'t>) -> Option<StaticImport<'t>> {
    let parts = children(declaration);
    if !parts.iter().any(|part| part.kind() == "static") || parts.iter().any(|part| part.kind() == "asterisk") {
        return None;
    }
    let path = parts.iter().find(|part| part.kind() == "scoped_identifier")?;
    let (owner, name) = context.text(*path).rsplit_once('.')?;
    let owner = context.resolver.class_name(declaration, owner)?;
    context.resolver.index.get(&owner)?;
    let mut members = Vec::new();
    lookup(context, &owner, name, &context.resolver.scope.package, &mut members);
    (!members.is_empty()).then(|| StaticImport { owner, name: name.to_string(), members, declaration })
}

pub fn unnecessary_static_import(context: &Context, node: Node) {
    if node.kind() != "import_declaration" {
        return;
    }
    let Some(found) = static_import(context, node) else { return };
    if let [only] = found.members.as_slice() {
        if only.class {
            let fix = Fix::replace(node.start_byte(), node.end_byte(), format!("import {};", only.owner));
            context.report_fixed("UnnecessaryStaticImport", node, node.start_byte(), "Using static imports for types is unnecessary", &[fix]);
        }
    }
}

const BAD_NESTED_CLASSES: [&str; 10] = ["Builder", "BuilderFactory", "Callback", "Class", "Enum", "Factory", "Type", "Key", "Id", "Provider"];
const BAD_STATIC_IDENTIFIERS: [&str; 11] =
    ["INSTANCE", "builder", "copyOf", "create", "from", "getDefaultInstance", "newBuilder", "newInstance", "of", "valueOf", "values"];

fn outermost(context: &Context, class: &str) -> String {
    let package = context.resolver.index.get(class).map(|info| info.package.clone()).unwrap_or_default();
    let rest = class.strip_prefix(&format!("{package}.")).unwrap_or(class);
    let first = rest.split('.').next().unwrap_or(rest);
    if package.is_empty() { first.to_string() } else { format!("{package}.{first}") }
}

fn in_imports(node: Node) -> bool {
    let mut current = parent(node);
    while let Some(above) = current {
        if above.kind() == "import_declaration" {
            return true;
        }
        current = parent(above);
    }
    false
}

fn type_usage(context: &Context, node: Node, name: &str, full: &str) -> bool {
    if node.kind() != "type_identifier" && node.kind() != "identifier" || context.text(node) != name || in_imports(node) {
        return false;
    }
    if let Some(above) = parent(node) {
        if matches!(above.kind(), "scoped_type_identifier" | "scoped_identifier") && above.child(0).is_some_and(|first| first.id() != node.id()) {
            return false;
        }
        if above.kind() == "field_access" && above.child_by_field_name("field").is_some_and(|field| field.id() == node.id()) {
            return false;
        }
        if above.kind() == "method_invocation" && above.child_by_field_name("name").is_some_and(|field| field.id() == node.id()) {
            return false;
        }
        if node.kind() == "identifier" && !matches!(above.kind(), "method_invocation" | "field_access" | "annotation" | "marker_annotation" | "scoped_identifier" | "method_reference") {
            return false;
        }
    }
    context.resolver.class_name(node, name).as_deref() == Some(full)
}

fn member_usage(context: &Context, node: Node, import: &StaticImport) -> bool {
    if node.kind() != "identifier" || context.text(node) != import.name || in_imports_or_declaring(node) {
        return false;
    }
    let Some(above) = parent(node) else { return false };
    match above.kind() {
        "method_invocation" => {
            above.child_by_field_name("name").is_some_and(|name| name.id() == node.id())
                && above.child_by_field_name("object").is_none()
                && context.resolver.resolve_call(above).is_some_and(|call| import.members.iter().any(|member| member.owner == call.declaring || context.resolver.index.is_subtype(&call.declaring, &member.owner)))
        }
        "switch_label" => false,
        "variable_declarator" => above.child_by_field_name("value").is_none_or(|written| written.id() != node.id()) || context.resolver.binding(node, &import.name).is_none() && !context.resolver.is_variable(node, &import.name),
        "field_access" | "scoped_identifier" | "formal_parameter" | "method_declaration" | "annotation" | "marker_annotation" | "method_reference" => false,
        _ => context.resolver.binding(node, &import.name).is_none() && !context.resolver.is_variable(node, &import.name),
    }
}

fn in_imports_or_declaring(node: Node) -> bool {
    in_imports(node) || parent(node).is_some_and(|above| matches!(above.kind(), "enum_constant" | "label" | "labeled_statement" | "continue_statement" | "break_statement"))
}

pub fn bad_import(context: &Context, node: Node) {
    if node.kind() != "import_declaration" {
        return;
    }
    let parts = children(node);
    let is_static = parts.iter().any(|part| part.kind() == "static");
    if parts.iter().any(|part| part.kind() == "asterisk") {
        return;
    }
    let Some(path) = parts.iter().find(|part| part.kind() == "scoped_identifier") else { return };
    let (owner, name) = match context.text(*path).rsplit_once('.') {
        Some(split) => split,
        None => return,
    };
    let index = context.resolver.index;
    let (class_import, import, enclosing, usage_name): (Option<String>, Option<StaticImport>, String, String);
    if is_static {
        let Some(found) = static_import(context, node) else { return };
        if found.members.len() == 1 && found.members[0].class || !BAD_STATIC_IDENTIFIERS.contains(&name) {
            return;
        }
        let first = found.members[0].owner.clone();
        class_import = None;
        enclosing = first;
        usage_name = name.to_string();
        import = Some(found);
    } else {
        if !BAD_NESTED_CLASSES.contains(&name) {
            return;
        }
        let Some(full) = context.resolver.class_name(node, &context.text(*path).to_string()) else { return };
        let Some(outer) = index.get(&full).and(context.resolver.class_name(node, owner)).filter(|outer| index.has(outer)) else { return };
        if outer == full || !full.starts_with(&format!("{outer}.")) {
            return;
        }
        class_import = Some(full);
        enclosing = outer;
        import = None;
        usage_name = name.to_string();
    }
    let symbol_class = class_import.clone().unwrap_or_else(|| enclosing.clone());
    let top_level = children(context.file.tree.root_node()).into_iter().filter(|part| matches!(part.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration"));
    let own: Vec<String> = top_level.filter_map(|part| context.resolver.scope.names.get(&part.id()).cloned()).collect();
    if own.contains(&outermost(context, &symbol_class)) {
        return;
    }
    if class_import.as_ref().is_some_and(|full| index.is_subtype(full, "com.google.protobuf.MessageLite")) {
        return;
    }
    let mut uses = Vec::new();
    walk(context.file.tree.root_node(), |part| {
        let hit = match (&class_import, &import) {
            (Some(full), _) => type_usage(context, part, &usage_name, full),
            (None, Some(found)) => member_usage(context, part, found),
            _ => false,
        };
        if hit && !context.suppressed("BadImport", part) {
            uses.push(part);
        }
    });
    let Some(last) = uses.first().copied() else { return };
    let anchor = children(context.file.tree.root_node())
        .into_iter()
        .find(|part| matches!(part.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration"))
        .and_then(|class| class.child_by_field_name("body"))
        .and_then(|body| body.named_child(0))
        .unwrap_or(node);
    let replacement = format!("{}.", qualify(context, anchor, &enclosing));
    let message = format!("Importing nested classes/static methods/static fields with commonly-used names can make code harder to read, because it may not be clear from the context exactly which type is being referred to. Qualifying the name with that of the containing class can make the code clearer. Here we recommend using qualified class: {replacement}");
    let mut fix = Fix::new().with_imports();
    for part in &uses {
        fix = fix.insert(part.start_byte(), replacement.clone());
    }
    let _ = import.as_ref().map(|found| found.declaration);
    context.report_fixed("BadImport", last, last.start_byte(), &message, &[fix]);
}
