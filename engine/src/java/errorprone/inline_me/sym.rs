//! The javac symbol behind a name, member select, call or `new` in a method body, with the facts the InlineMe checks
//! ask about it: what it is, the class that owns it, whether it is static, its access and whether it is deprecated.
use super::super::Context;
use super::super::lookup::field_of;
use crate::engine::source::parent;
use crate::java::javac::locals::{Found, Scopes, declaration};
use crate::java::types::expr::{Binding, Call, Receiver};
use crate::java::types::model::{ClassInfo, flag};
use crate::java::types::scope::type_parameter;
use tree_sitter::Node;

/// `Visibility` of `InlinabilityResult`, in its order.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub enum Visibility {
    Private,
    Package,
    Protected,
    Public,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    /// A local variable or parameter, or a type variable of a method: `isDirectlyOrIndirectlyLocal`.
    Local,
    Field,
    Method,
    Class,
    /// A type variable of a class.
    TypeVariable,
    Package,
    /// `super`, or `X.this` and `X.super`: variables javac gives no access modifier.
    Special,
}

#[derive(Clone, Debug)]
pub struct Sym {
    pub kind: Kind,
    /// The class the symbol belongs to; `None` for a top-level class, a package or a local.
    pub owner: Option<String>,
    /// `getQualifiedName`: the full name of a class, the simple name of a member.
    pub qualified: String,
    pub is_static: bool,
    pub visibility: Visibility,
    pub deprecated: bool,
    pub varargs: bool,
}

impl Sym {
    fn new(kind: Kind, qualified: impl Into<String>) -> Sym {
        Sym { kind, owner: None, qualified: qualified.into(), is_static: false, visibility: Visibility::Package, deprecated: false, varargs: false }
    }
    pub fn is_local(&self) -> bool {
        self.kind == Kind::Local
    }
}

/// javac's full name of a class: a local class by its simple name, an anonymous class by none.
pub fn javac_name(name: &str) -> String {
    let mut parts = name.split('.').peekable();
    let mut kept: Vec<&str> = Vec::new();
    while let Some(part) = parts.next() {
        if part.starts_with(|c: char| c.is_ascii_digit()) {
            kept = vec![part.trim_start_matches(|c: char| c.is_ascii_digit())];
            continue;
        }
        kept.push(part);
    }
    if kept.first().is_some_and(|first| first.is_empty()) {
        return if kept.len() == 1 { String::new() } else { kept[1..].join(".") };
    }
    kept.join(".")
}

/// The class a member class is declared in.
fn outer_class(context: &Context, class: &str) -> Option<String> {
    let (outer, _) = class.rsplit_once('.')?;
    context.resolver.index.has(outer).then(|| outer.to_string())
}

fn class_visibility(info: &ClassInfo, in_interface: bool) -> Visibility {
    if info.flags & flag::PUBLIC != 0 || in_interface {
        Visibility::Public
    } else if info.flags & flag::PROTECTED != 0 {
        Visibility::Protected
    } else if info.flags & flag::PRIVATE != 0 {
        Visibility::Private
    } else {
        Visibility::Package
    }
}

pub fn class(context: &Context, name: &str) -> Sym {
    let index = context.resolver.index;
    let mut sym = Sym::new(Kind::Class, javac_name(name));
    let Some(info) = index.get(name) else { return sym };
    sym.owner = outer_class(context, name);
    let outer_interface = sym.owner.as_deref().and_then(|outer| index.get(outer)).is_some_and(|outer| outer.is_interface);
    sym.visibility = class_visibility(info, outer_interface);
    sym.deprecated = info.flags & flag::DEPRECATED != 0;
    let implicit = info.is_interface || info.flags & (flag::ENUM | flag::RECORD | flag::ANNOTATION) != 0 || outer_interface;
    sym.is_static = sym.owner.is_some() && (info.flags & flag::STATIC != 0 || implicit || info.outer_instance == Some(false));
    sym
}

fn access_visibility(access: u16) -> Visibility {
    if access & 1 != 0 {
        Visibility::Public
    } else if access & 4 != 0 {
        Visibility::Protected
    } else if access & 2 != 0 {
        Visibility::Private
    } else {
        Visibility::Package
    }
}

pub fn method(call: &Call) -> Sym {
    let method = &call.method;
    let mut sym = Sym::new(Kind::Method, method.name.clone());
    sym.owner = Some(call.declaring.clone());
    sym.is_static = method.is_static;
    sym.visibility = access_visibility(method.detail.access);
    sym.deprecated = method.flags & flag::DEPRECATED != 0;
    sym.varargs = method.varargs;
    sym
}

fn field(context: &Context, declaring: &ClassInfo, field: &crate::java::types::model::Field) -> Sym {
    let mut sym = Sym::new(Kind::Field, field.name.clone());
    sym.owner = Some(declaring.name.clone());
    let interface = declaring.is_interface || context.resolver.index.get(&declaring.name).is_some_and(|info| info.is_interface);
    sym.is_static = field.flags & flag::STATIC != 0 || interface;
    sym.visibility = if field.flags & flag::PUBLIC != 0 || interface {
        Visibility::Public
    } else if field.flags & flag::PROTECTED != 0 {
        Visibility::Protected
    } else if field.is_private {
        Visibility::Private
    } else {
        Visibility::Package
    };
    sym.deprecated = field.flags & flag::DEPRECATED != 0;
    sym
}

/// The call a method name belongs to when the name is written without an object.
fn called_by_name<'t>(node: Node<'t>) -> Option<Node<'t>> {
    let call = parent(node).filter(|call| call.kind() == "method_invocation")?;
    (call.child_by_field_name("name") == Some(node) && call.child_by_field_name("object").is_none()).then_some(call)
}

/// The symbol of a call: the method, or the constructor of `this(...)` and `super(...)`.
pub fn invoked(context: &Context, call: Node) -> Option<Sym> {
    let resolved = match call.kind() {
        "method_invocation" => context.resolver.resolve_call(call),
        "explicit_constructor_invocation" => context.resolver.resolve_delegation(call),
        _ => None,
    }?;
    Some(method(&resolved))
}

/// The constructor a `new` calls.
pub fn constructed(context: &Context, creation: Node) -> Option<Sym> {
    context.resolver.resolve_constructor(creation).map(|call| method(&call))
}

fn type_name(context: &Context, node: Node) -> Option<Sym> {
    let name = context.text(node);
    if let Some(parameter) = type_parameter(context.file, node, name) {
        let holder = parent(parameter).and_then(parent)?;
        let on_class = matches!(holder.kind(), "class_declaration" | "interface_declaration" | "record_declaration");
        let mut sym = Sym::new(if on_class { Kind::TypeVariable } else { Kind::Local }, name);
        sym.owner = on_class.then(|| context.resolver.scope.names.get(&holder.id()).cloned()).flatten();
        return Some(sym);
    }
    context.resolver.class_name(node, name).map(|full| class(context, &full))
}

/// The symbol of a javac identifier: a name, a method name written without an object, a simple type name, `this` or
/// `super`.
pub fn ident(context: &Context, scopes: &Scopes, node: Node) -> Option<Sym> {
    match node.kind() {
        "this" => return Some(Sym::new(Kind::Local, "this")),
        "super" => return Some(Sym::new(Kind::Special, "super")),
        "type_identifier" => return type_name(context, node),
        _ => {}
    }
    if let Some(call) = called_by_name(node) {
        return invoked(context, call);
    }
    let name = context.text(node);
    match declaration(context.resolver, scopes, node, name) {
        Some(Found::Local(_)) => return Some(Sym::new(Kind::Local, name)),
        Some(Found::Field) | None => {}
    }
    if let Some(Binding::Field(_, declaring, found)) = context.resolver.binding(node, name) {
        return Some(field(context, declaring, found));
    }
    if let Some(full) = context.resolver.class_name(node, name).filter(|full| context.resolver.index.has(full)) {
        return Some(class(context, &full));
    }
    Some(Sym::new(Kind::Package, name))
}

/// The symbol of a member select: a field access, a qualified type or package name, a class literal, `X.this`, or the
/// method part of a call with an object.
pub fn select(context: &Context, node: Node) -> Option<Sym> {
    match node.kind() {
        "method_invocation" => invoked(context, node),
        "class_literal" => {
            let written = super::tree::selected(node)?;
            let owner = match written.kind() {
                "array_type" => Some("Array".to_string()),
                _ => context.resolver.class_name(written, &context.text(written).split_whitespace().collect::<String>()),
            };
            Some(Sym { visibility: Visibility::Public, is_static: true, owner, ..Sym::new(Kind::Field, "class") })
        }
        "field_access" => {
            let name = node.child_by_field_name("field").map(|part| context.text(part)).unwrap_or_default();
            if matches!(name, "this" | "super") {
                return Some(Sym::new(Kind::Special, name));
            }
            if let Some((declaring, found)) = field_of(context, node) {
                return Some(field(context, declaring, found));
            }
            let object = node.child_by_field_name("object")?;
            if name == "length" && matches!(context.resolver.receiver(object), Some(Receiver::Value(crate::java::types::model::Type::Array(_)))) {
                return Some(Sym { visibility: Visibility::Public, ..Sym::new(Kind::Field, "length") });
            }
            qualified_name(context, node)
        }
        "scoped_type_identifier" | "scoped_identifier" => qualified_name(context, node),
        _ => None,
    }
}

/// A dotted name that stands for a class or a package.
fn qualified_name(context: &Context, node: Node) -> Option<Sym> {
    let text: String = context.text(node).split_whitespace().collect();
    if let Some(Receiver::Static(full)) = context.resolver.receiver(node) {
        return Some(class(context, &full));
    }
    if let Some(full) = context.resolver.class_name(node, &text).filter(|full| context.resolver.index.has(full)) {
        return Some(class(context, &full));
    }
    Some(Sym::new(Kind::Package, text))
}
