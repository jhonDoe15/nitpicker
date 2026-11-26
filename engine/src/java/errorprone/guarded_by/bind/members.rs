//! Members and enclosing classes the way javac's symbols answer: `isMemberOf`, `getMember`, `hasOuterInstance`.
use super::{MethodSym, Sym, VarKind, VarSym};
use crate::engine::source::{ancestor, parent};
use crate::java::errorprone::hierarchy::closure;
use crate::java::errorprone::Context;
use crate::java::helpers::has_modifier;
use crate::java::types::index::TypeIndex;
use crate::java::types::classfile::{descriptor_method, descriptor_type};
use crate::java::types::model::{ClassInfo, Hidden, Method, Type, flag};
use super::super::lock::LocalKey;
use tree_sitter::Node;

/// The class a class is declared in; local and anonymous classes name the class around them.
pub fn lexical_parent(index: &TypeIndex, class: &str) -> Option<String> {
    let (outer, _) = class.rsplit_once('.')?;
    index.has(outer).then(|| outer.to_string())
}

/// A class declared directly in another class, not in a method or initializer.
pub fn is_member_class(class: &str) -> bool {
    class.rsplit('.').next().is_some_and(|last| !last.starts_with(|c: char| c.is_ascii_digit()))
}

pub fn class_node<'t>(context: &Context<'t>, class: &str) -> Option<Node<'t>> {
    let id = context.resolver.scope.names.iter().find(|(_, name)| name.as_str() == class).map(|(id, _)| *id)?;
    let mut found = None;
    crate::engine::source::walk(context.file.tree.root_node(), |node| {
        if found.is_none() && node.id() == id {
            found = Some(node);
        }
    });
    found
}

fn static_context(node: Node) -> bool {
    let mut current = parent(node);
    while let Some(at) = current {
        match at.kind() {
            "method_declaration" | "field_declaration" | "constant_declaration" => return has_modifier(at, "static") || at.kind() == "constant_declaration",
            "static_initializer" | "enum_constant" => return true,
            "constructor_declaration" | "compact_constructor_declaration" => return false,
            "class_body" | "interface_body" | "enum_body" | "annotation_type_body" | "program" => return false,
            _ => current = parent(at),
        }
    }
    false
}

/// `ClassSymbol.hasOuterInstance`: an inner class, or a local or anonymous class in a non-static context.
pub fn has_outer_instance(context: &Context, class: &str) -> bool {
    let index = context.resolver.index;
    let Some(outer) = lexical_parent(index, class) else { return false };
    if let Some(node) = class_node(context, class) {
        if !matches!(node.kind(), "class_declaration" | "object_creation_expression") {
            return false;
        }
        if is_member_class(class) {
            let above = parent(node).and_then(parent);
            let interface = above.is_some_and(|above| matches!(above.kind(), "interface_declaration" | "annotation_type_declaration"));
            return !has_modifier(node, "static") && !interface;
        }
        return !static_context(node) && ancestor(node, &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration"]).is_some();
    }
    let Some(info) = index.get(class) else { return false };
    if let Some(inner) = info.outer_instance {
        return inner && is_member_class(class) && !info.is_interface;
    }
    let interface_outer = index.get(&outer).is_some_and(|above| above.is_interface);
    is_member_class(class) && !info.is_interface && info.flags & (flag::STATIC | flag::ENUM | flag::RECORD | flag::ANNOTATION) == 0 && !interface_outer
}

fn find_member<T>(context: &Context, class: &str, lookup: &dyn Fn(&ClassInfo) -> Option<T>, is_static: &dyn Fn(&T) -> bool) -> Option<T> {
    let index = context.resolver.index;
    for name in std::iter::once(class.to_string()).chain(closure(index, class)) {
        if let Some(found) = index.get(&name).and_then(lookup) {
            return Some(found);
        }
    }
    let parent = lexical_parent(index, class)?;
    if has_outer_instance(context, class) {
        if let Some(found) = find_member(context, &parent, lookup, is_static) {
            return Some(found);
        }
    }
    if is_member_class(class) {
        return find_member(context, &parent, lookup, is_static).filter(|found| is_static(found));
    }
    None
}

/// `GuardedBySymbolResolver.getMember` for a field: the class, its supertypes, then the classes around it.
pub fn find_field(context: &Context, class: &str, name: &str) -> Option<VarSym> {
    let lookup = |info: &ClassInfo| {
        let var = |is_static: bool, ty: Option<Type>| VarSym { kind: VarKind::Field, owner: info.name.clone(), name: name.to_string(), is_static, ty, key: LocalKey::Declared(0) };
        if let Some(field) = info.fields.iter().find(|field| field.name == name && field.flags & flag::ENUM == 0) {
            return Some(var(field.flags & flag::STATIC != 0, Some(field.kind.clone())));
        }
        let hidden = info.hidden.iter().find(|hidden| !hidden.is_method && hidden.name == name)?;
        Some(var(hidden.is_static, descriptor_type(&hidden.descriptor)))
    };
    find_member(context, class, &lookup, &|found: &VarSym| found.is_static)
}

/// The same for a method: the last one declared with that name comes first, as in javac's scopes.
pub fn find_method(context: &Context, class: &str, name: &str) -> Option<MethodSym> {
    let lookup = |info: &ClassInfo| {
        let declared = info.methods.iter().enumerate().rev().find(|(_, method)| method.name == name);
        let private = info.hidden.iter().rev().find(|hidden| hidden.is_method && hidden.name == name);
        let own = |method: &Method| MethodSym { owner: info.name.clone(), name: name.to_string(), parameters: method.parameters.clone(), returns: method.returns.clone(), is_static: method.is_static };
        match (declared, private) {
            (Some((at, _)), Some(hidden)) if hidden.before > at => hidden_method(info, hidden),
            (Some((_, method)), _) => Some(own(method)),
            (None, Some(hidden)) => hidden_method(info, hidden),
            (None, None) => None,
        }
    };
    find_member(context, class, &lookup, &|found: &MethodSym| found.is_static)
}

fn hidden_method(info: &ClassInfo, hidden: &Hidden) -> Option<MethodSym> {
    let (parameters, returns) = descriptor_method(&hidden.descriptor)?;
    Some(MethodSym { owner: info.name.clone(), name: hidden.name.clone(), parameters, returns, is_static: hidden.is_static })
}

fn method_member(index: &TypeIndex, method: &MethodSym, class: &str) -> bool {
    if method.owner == class {
        return true;
    }
    if !index.is_subtype(class, &method.owner) {
        return false;
    }
    let (Some(info), Some(own)) = (index.get(&method.owner), index.get(class)) else { return false };
    let Some(declared) = info.methods.iter().find(|other| other.name == method.name && other.parameters == method.parameters) else { return false };
    if declared.is_private {
        return false;
    }
    !declared.package_private || info.package == own.package
}

/// `Symbol.isMemberOf`: declared in the class, or inherited by it and not hidden.
pub fn is_member_of(context: &Context, sym: &Sym, class: &str) -> bool {
    let index = context.resolver.index;
    match sym {
        Sym::Var(var) => match var.kind {
            VarKind::Field => var.owner == class || index.field(class, &var.name).is_some_and(|(info, _)| info.name == var.owner),
            VarKind::Super | VarKind::This => var.owner == class,
            _ => false,
        },
        Sym::Method(method) => method_member(index, method, class),
        Sym::Class(_) => false,
    }
}

/// What javac calls the owner of a class, as far as `getLexicallyEnclosing` looks.
pub enum Owner {
    Class(String),
    Package(String),
    /// A method or a field a local or anonymous class sits in, and the class that declares it.
    Symbol(Sym, String),
    /// An initializer or a constructor: nothing a name can match; the class around it.
    Anonymous(String),
    Nothing,
}

fn field_symbol(context: &Context, class: &str, name: &str) -> Option<Sym> {
    let (info, field) = context.resolver.index.field(class, name)?;
    Some(Sym::Var(VarSym { kind: VarKind::Field, owner: info.name.clone(), name: name.to_string(), is_static: field.flags & flag::STATIC != 0, ty: Some(field.kind.clone()), key: LocalKey::Declared(0) }))
}

fn local_owner(context: &Context, class: &str, parent: String) -> Owner {
    let Some(node) = class_node(context, class) else { return Owner::Class(parent) };
    let mut lambda = false;
    let mut current = crate::engine::source::parent(node);
    while let Some(at) = current {
        match at.kind() {
            "method_declaration" => {
                let Some((info, found)) = crate::java::errorprone::hierarchy::declared_method(context, at) else { return Owner::Nothing };
                let is_static = found.is_static;
                let method = MethodSym { owner: info.name.clone(), name: found.name.clone(), parameters: found.parameters.clone(), returns: found.returns.clone(), is_static };
                return Owner::Symbol(Sym::Method(method), parent);
            }
            "constructor_declaration" | "compact_constructor_declaration" | "static_initializer" => return Owner::Anonymous(parent),
            "block" if crate::engine::source::parent(at).is_some_and(|above| above.kind() == "class_body") => return Owner::Anonymous(parent),
            "lambda_expression" => lambda = true,
            "variable_declarator" if crate::engine::source::parent(at).is_some_and(|above| matches!(above.kind(), "field_declaration" | "constant_declaration")) => {
                let Some(name) = at.child_by_field_name("name") else { return Owner::Nothing };
                return match field_symbol(context, &parent, context.text(name)) {
                    Some(sym) if !lambda => Owner::Symbol(sym, parent),
                    _ => Owner::Nothing,
                };
            }
            "enum_constant" => {
                let Some(name) = at.child_by_field_name("name") else { return Owner::Nothing };
                return match field_symbol(context, &parent, context.text(name)) {
                    Some(sym) if !lambda => Owner::Symbol(sym, parent),
                    _ => Owner::Nothing,
                };
            }
            _ => {}
        }
        current = crate::engine::source::parent(at);
    }
    Owner::Class(parent)
}

/// The owner of a class: a member class has its class, a top-level class its package, a local class what it sits in.
pub fn owner(context: &Context, class: &str) -> Owner {
    let index = context.resolver.index;
    let Some(parent) = lexical_parent(index, class) else {
        return Owner::Package(class.rsplit_once('.').map_or("", |(package, _)| package).to_string());
    };
    if is_member_class(class) {
        return Owner::Class(parent);
    }
    local_owner(context, class, parent)
}
