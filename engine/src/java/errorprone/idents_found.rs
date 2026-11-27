//! The variables that `FindIdentifiers.findAllIdents` collects: locals, fields with their access, and static imports.
use super::Context;
use super::finals::considered_final;
use super::hierarchy::closure;
use super::idents::{class_body, is_class_tree};
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::flag;
use tree_sitter::Node;

pub(super) enum Kind {
    /// A local, parameter or binding: the method that owns it, if any.
    Local(Option<usize>),
    Field { owner: String, is_static: bool, is_private: bool, public_or_protected: bool, package: String },
    Always,
}

pub(super) struct Var {
    pub(super) name: String,
    pub(super) kind: Kind,
    pub(super) final_local: bool,
}

impl Var {
    pub(super) fn local(context: &Context, name: Node, declaration: Node) -> Var {
        let owner = std::iter::successors(parent(declaration), |at| parent(*at))
            .find(|at| matches!(at.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration") || is_class_tree(*at))
            .filter(|at| !is_class_tree(*at))
            .map(|at| at.id());
        let final_local = considered_final(context, name);
        Var { name: context.text(name).to_string(), kind: Kind::Local(owner), final_local }
    }
}

pub(super) fn names_of<'t>(declaration: Node<'t>) -> Vec<Node<'t>> {
    match declaration.kind() {
        "local_variable_declaration" | "field_declaration" | "constant_declaration" => declarators(declaration).into_iter().filter_map(|part| part.child_by_field_name("name")).collect(),
        "formal_parameter" | "spread_parameter" | "catch_formal_parameter" | "resource" | "enhanced_for_statement" => {
            let named = declaration.child_by_field_name("name").or_else(|| named_children(declaration).into_iter().filter(|part| part.kind() == "variable_declarator").find_map(|part| part.child_by_field_name("name")));
            named.into_iter().collect()
        }
        _ => Vec::new(),
    }
}

pub(super) fn add_locals(context: &Context, declaration: Node, out: &mut Vec<Var>) {
    for name in names_of(declaration) {
        out.push(Var::local(context, name, declaration));
    }
}

pub(super) fn add_fields(context: &Context, class: Node, prev: Node, out: &mut Vec<Var>) {
    let Some(owner) = context.resolver.scope.names.get(&class.id()).cloned() else { return };
    let package = context.resolver.scope.package.clone();
    let interface = matches!(class.kind(), "interface_declaration" | "annotation_type_declaration");
    if let Some(components) = (class.kind() == "record_declaration").then(|| class.child_by_field_name("parameters")).flatten() {
        for component in named_children(components).into_iter().filter(|part| part.kind() == "formal_parameter") {
            if let Some(name) = component.child_by_field_name("name") {
                out.push(Var { name: context.text(name).to_string(), kind: Kind::Field { owner: owner.clone(), is_static: false, is_private: true, public_or_protected: false, package: package.clone() }, final_local: true });
            }
        }
    }
    let Some(body) = class_body(class) else { return };
    let mut members: Vec<Node> = Vec::new();
    for part in named_children(body) {
        if part.kind() == "enum_body_declarations" {
            members.extend(named_children(part));
        } else {
            members.push(part);
        }
    }
    for member in members {
        if member.id() == prev.id() {
            break;
        }
        match member.kind() {
            "enum_constant" => {
                if let Some(name) = member.child_by_field_name("name") {
                    out.push(Var { name: context.text(name).to_string(), kind: Kind::Field { owner: owner.clone(), is_static: true, is_private: false, public_or_protected: true, package: package.clone() }, final_local: true });
                }
            }
            "field_declaration" | "constant_declaration" => {
                let is_static = interface || member.kind() == "constant_declaration" || has_modifier(member, "static");
                let is_private = has_modifier(member, "private");
                let public_or_protected = interface || has_modifier(member, "public") || has_modifier(member, "protected");
                for name in names_of(member) {
                    out.push(Var { name: context.text(name).to_string(), kind: Kind::Field { owner: owner.clone(), is_static, is_private, public_or_protected, package: package.clone() }, final_local: true });
                }
            }
            _ => {}
        }
    }
    let index = context.resolver.index;
    for parent_class in closure(index, &owner) {
        let Some(info) = index.get(&parent_class) else { continue };
        for field in &info.fields {
            let public_or_protected = field.flags & (flag::PUBLIC | flag::PROTECTED) != 0;
            let kind = Kind::Field { owner: parent_class.clone(), is_static: field.flags & flag::STATIC != 0, is_private: field.is_private, public_or_protected, package: info.package.clone() };
            out.push(Var { name: field.name.clone(), kind, final_local: true });
        }
    }
}

pub(super) fn static_imports(context: &Context, root: Node, out: &mut Vec<Var>) {
    let index = context.resolver.index;
    for import in children(root).into_iter().filter(|part| part.kind() == "import_declaration") {
        if !children(import).iter().any(|part| part.kind() == "static") || children(import).iter().any(|part| part.kind() == "asterisk") {
            continue;
        }
        let Some(path) = named_children(import).into_iter().find(|part| part.kind() == "scoped_identifier") else { continue };
        let (Some(scope), Some(name)) = (path.child_by_field_name("scope"), path.child_by_field_name("name")) else { continue };
        let (class, name) = (context.text(scope).to_string(), context.text(name));
        let Some(owner) = index.get(&class).map(|info| info.name.clone()) else { continue };
        for searched in std::iter::once(owner.clone()).chain(closure(index, &owner)) {
            let Some(info) = index.get(&searched) else { continue };
            for field in info.fields.iter().filter(|field| field.name == name) {
                let public_or_protected = field.flags & (flag::PUBLIC | flag::PROTECTED) != 0;
                out.push(Var { name: field.name.clone(), kind: Kind::Field { owner: searched.clone(), is_static: field.flags & flag::STATIC != 0, is_private: field.is_private, public_or_protected, package: info.package.clone() }, final_local: true });
            }
        }
    }
}
