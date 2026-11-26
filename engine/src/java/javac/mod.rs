//! Names the Java compiler makes up for code that has none in source: the hidden method behind each lambda,
//! with the variables it takes from around it as extra parameters, and the constructor of an anonymous class.
//! Tools that read class files show these names, so findings inside such code can only be matched with them.
//! The rules were learned from what `javac` 21 writes for test code (`tests/fixtures/javac`); anonymous and
//! local class names themselves (`Outer$1`) are numbered in `classes.rs`.
mod captures;
pub mod classes;
mod lambdas;
pub mod locals;
mod references;
pub mod rule;

use crate::engine::source::{children, parent};
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use crate::java::types::scope::{Resolver, TYPE_DECLARATIONS, enclosing_types};
use std::collections::HashMap;
use tree_sitter::Node;

/// The hidden method of a lambda, or of a method reference compiled as one.
pub struct Synthetic {
    /// The class that gets the method, by its name in the type index.
    pub owner: String,
    /// `lambda$method$3`. Not known for a serializable lambda, whose name carries a hash.
    pub name: Option<String>,
}

/// The compiler-made names of one file.
pub struct Names<'t> {
    lambdas: HashMap<usize, Synthetic>,
    patterns: locals::Scopes<'t>,
    /// Local and anonymous classes of the file by name.
    locals: HashMap<String, Node<'t>>,
}

impl<'t> Names<'t> {
    pub fn of(resolver: &Resolver, root: Node<'t>) -> Names<'t> {
        let mut names = Names { lambdas: HashMap::new(), patterns: locals::Scopes::of(resolver.file, root), locals: HashMap::new() };
        let mut top = Vec::new();
        crate::engine::source::walk(root, |node| {
            let Some(name) = resolver.scope.names.get(&node.id()) else { return };
            if name.split('.').any(|part| part.starts_with(|first: char| first.is_ascii_digit())) {
                names.locals.insert(name.clone(), node);
            }
            if TYPE_DECLARATIONS.contains(&node.kind()) && parent(node).is_some_and(|holder| holder.kind() == "program") {
                top.push((node, name.clone()));
            }
        });
        let mut numbering = lambdas::Numbering { resolver, names: &mut names };
        for (declaration, name) in top {
            if let Some(body) = declaration.child_by_field_name("body") {
                numbering.class(body, &name);
            }
        }
        names
    }

    pub fn lambda(&self, node: Node) -> Option<&Synthetic> {
        self.lambdas.get(&node.id())
    }

    /// The erased parameter types of a lambda's hidden method: the variables it takes from around it, then its
    /// own parameters. `None` stands for a type that could not be worked out.
    pub fn lambda_parameters(&self, resolver: &Resolver, lambda: Node<'t>) -> Vec<Option<Type>> {
        let mut found: Vec<Option<Type>> = captures::of_lambda(resolver, self, lambda).into_iter().map(|(_, kind)| kind).collect();
        let (Some(list), Some(body)) = (lambda.child_by_field_name("parameters"), lambda.child_by_field_name("body")) else { return found };
        let own: Vec<Node> = if list.kind() == "identifier" { vec![list] } else { children(list).into_iter().filter(|part| part.is_named() && !part.kind().ends_with("comment")).collect() };
        for parameter in own {
            let written = match parameter.kind() {
                "identifier" => Some(parameter),
                "formal_parameter" => parameter.child_by_field_name("name"),
                _ => children(parameter).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|part| part.child_by_field_name("name")),
            };
            found.push(written.and_then(|written| locals::kind(resolver, parameter, body, resolver.file.text_of(written))));
        }
        found.into_iter().map(|kind| kind.map(|kind| kind.erased())).collect()
    }

    /// What the compiler adds after the declared parameters of every constructor of a local class: the
    /// variables its body takes from the method. Nothing for a class that is not local.
    pub fn local_class_extras(&self, resolver: &Resolver, declaration: Node<'t>) -> Vec<Option<Type>> {
        if !declared_locally(declaration) {
            return Vec::new();
        }
        captures::of_local_class(resolver, self, declaration).into_iter().map(|(_, kind)| kind.map(|kind| kind.erased())).collect()
    }

    /// The erased parameter types of the constructor the compiler writes for an anonymous class: the instance
    /// around it unless it is created in a static place, the parameters of the constructor it passes its
    /// arguments to (the argument types when that constructor is not found), then the variables its body takes
    /// from the method, after `constructor_outer`. An enum constant with a body starts with the constant's name and position instead.
    pub fn anonymous_constructor(&self, resolver: &Resolver, creation: Node<'t>) -> Vec<Option<Type>> {
        let mut found: Vec<Option<Type>> = Vec::new();
        if creation.kind() == "enum_constant" {
            found.extend([Some(Type::class("java.lang.String")), Some(Type::Primitive("int"))]);
        } else if let Some(outer) = outer_instance(resolver, creation) {
            found.push(Some(Type::class(&outer)));
        }
        if let Some(qualifier) = creation.child(0).filter(|first| creation.kind() == "object_creation_expression" && first.kind() != "new") {
            found.push(resolver.type_of(qualifier));
        }
        match resolver.call_formals(creation) {
            Some((_, formals)) => found.extend(formals.into_iter().map(Some)),
            None => {
                let passed = creation.child_by_field_name("arguments").map(children).unwrap_or_default();
                found.extend(passed.into_iter().filter(|part| part.is_named() && !part.kind().ends_with("comment")).map(|argument| resolver.type_of(argument)));
            }
        }
        if creation.kind() != "enum_constant" {
            found.extend(constructor_outer(resolver, creation).map(|outer| Some(Type::class(&outer))));
        }
        found.extend(captures::of_local_class(resolver, self, creation).into_iter().map(|(_, kind)| kind));
        found.into_iter().map(|kind| kind.map(|kind| kind.erased())).collect()
    }
}

/// The class whose instance code at `node` runs in, when it runs in one: not in a static method, a static
/// initializer, a static or interface field or an enum constant's arguments. The arguments of `this(...)` and
/// `super(...)` run before the object exists, in the instance around an inner class if there is one.
pub fn outer_instance(resolver: &Resolver, node: Node) -> Option<String> {
    let mut current = parent(node);
    while let Some(around) = current {
        let fixed = match around.kind() {
            "explicit_constructor_invocation" => return crate::engine::source::ancestor(around, TYPE_DECLARATIONS).and_then(|declaration| instance_around(resolver, declaration)),
            "static_initializer" | "enum_constant" | "constant_declaration" => Some(false),
            "method_declaration" | "field_declaration" => Some(!has_modifier(around, "static") && parent(around).is_none_or(|holder| holder.kind() != "interface_body" || around.kind() == "method_declaration")),
            "constructor_declaration" | "compact_constructor_declaration" => Some(true),
            "block" if parent(around).is_some_and(|holder| holder.kind() == "class_body") => Some(true),
            _ => None,
        };
        if let Some(instance) = fixed {
            return if instance { enclosing_types(resolver.scope, around).into_iter().next() } else { None };
        }
        current = parent(around);
    }
    None
}

/// `pkg.Outer$Inner` for the type index's `pkg.Outer.Inner`.
pub fn binary(index: &crate::java::types::index::TypeIndex, class: &str) -> String {
    let package = match index.get(class) {
        Some(info) => info.package.clone(),
        None => {
            let parts: Vec<&str> = class.split('.').collect();
            let first_class = parts.iter().position(|part| part.starts_with(|c: char| c.is_uppercase() || c.is_ascii_digit()));
            parts[..first_class.unwrap_or(parts.len().saturating_sub(1))].join(".")
        }
    };
    if package.is_empty() || !class.starts_with(&format!("{package}.")) {
        return class.replace('.', "$");
    }
    format!("{package}.{}", class[package.len() + 1..].replace('.', "$"))
}

/// An erased type with binary class names, as a class file descriptor would spell it out.
pub fn spelled(index: &crate::java::types::index::TypeIndex, kind: &Type) -> String {
    match kind {
        Type::Array(element) => format!("{}[]", spelled(index, element)),
        Type::Class(name, _) => binary(index, name.split('&').next().unwrap_or(name)),
        other => other.erased().name(),
    }
}

/// The class an instance of an inner class is tied to: the class around a member class that is not static, or
/// the instance a local class is declared in.
pub fn instance_around(resolver: &Resolver, declaration: Node) -> Option<String> {
    if declaration.kind() != "class_declaration" || has_modifier(declaration, "static") {
        return None;
    }
    match parent(declaration).map(|holder| holder.kind()) {
        Some("class_body" | "enum_body_declarations") => enclosing_types(resolver.scope, declaration).into_iter().nth(1),
        Some("interface_body" | "annotation_type_body" | "program") | None => None,
        Some(_) => outer_instance(resolver, declaration),
    }
}

/// An anonymous class written straight in a constructor of an inner class also takes the instance that
/// constructor received for the class around it.
fn constructor_outer(resolver: &Resolver, creation: Node) -> Option<String> {
    let around = crate::engine::source::ancestor(creation, &["constructor_declaration", "lambda_expression", "class_body", "explicit_constructor_invocation"])?;
    if around.kind() != "constructor_declaration" {
        return None;
    }
    instance_around(resolver, crate::engine::source::ancestor(around, TYPE_DECLARATIONS)?)
}

/// Whether a class declaration stands among statements rather than among the members of a class or at the top of a file.
pub fn declared_locally(declaration: Node) -> bool {
    parent(declaration).is_some_and(|holder| !holder.kind().ends_with("_body") && !matches!(holder.kind(), "program" | "enum_body_declarations"))
}
