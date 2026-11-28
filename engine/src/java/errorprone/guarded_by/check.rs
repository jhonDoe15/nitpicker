//! What the check shares across a file, the string environments of declarations, and the validation of `@GuardedBy` strings.
use super::bind::ast::parse;
use super::bind::text_env::{MethodInfo, TextEnv};
use super::bind::{MethodSym, Sym, VarKind, VarSym, bind};
use super::lock::{LocalKey, Lock};
use crate::java::errorprone::hierarchy::{declared_method, formals};
use crate::java::errorprone::Context;
use crate::java::helpers::has_modifier;
use crate::java::javac::locals::Scopes;
use crate::java::types::model::{Method, Type};
use crate::java::types::scope::enclosing_type;
use std::cell::OnceCell;
use tree_sitter::Node;

const NAMES: [&str; 3] = ["GuardedBy", "GuardedByChecker", "all"];

/// Facts about the file that every analysis wants: its local variables.
pub struct Shared<'t> {
    scopes: OnceCell<Scopes<'t>>,
}

impl<'t> Shared<'t> {
    pub fn new() -> Shared<'t> {
        Shared { scopes: OnceCell::new() }
    }

    pub fn scopes(&self, context: &Context<'t>) -> &Scopes<'t> {
        self.scopes.get_or_init(|| Scopes::of(context.file, context.file.tree.root_node()))
    }

    /// Reports; the name `GuardedByChecker` suppresses as well.
    pub fn report(&self, context: &Context, node: Node, offset: usize, message: &str) {
        if context.suppressed("GuardedByChecker", node) {
            return;
        }
        context.report_fixed("GuardedBy", node, offset, message, &[]);
    }
}

/// Whether the declaration itself suppresses the check.
pub fn own_suppressed(context: &Context, declaration: Node) -> bool {
    context.suppress_strings(declaration).iter().any(|name| NAMES.contains(&name.as_str()))
}

fn static_member(declaration: Node, interface: bool) -> bool {
    has_modifier(declaration, "static") || interface
}

/// The environment for the strings of a field declared in `class`.
pub fn field_env<'c, 't>(context: &'c Context<'t>, class: String, name: &str, declaration: Node<'t>, ty: Option<Type>) -> TextEnv<'c, 't> {
    let interface = declaration.kind() == "constant_declaration" || declaration.kind() == "enum_constant";
    let itself = VarSym { kind: VarKind::Field, owner: class.clone(), name: name.to_string(), is_static: static_member(declaration, interface), ty, key: LocalKey::Declared(0) };
    TextEnv { context, enclosing: class, itself: Some(Sym::Var(itself)), method: None }
}

fn method_info(context: &Context, method: Node, method_sym: &Method) -> MethodInfo {
    let parameters = formals(method);
    MethodInfo {
        names: parameters.iter().filter_map(|part| part.child_by_field_name("name").or_else(|| crate::engine::source::children(*part).into_iter().find(|kid| kid.kind() == "variable_declarator").and_then(|kid| kid.child_by_field_name("name")))).map(|name| context.text(name).to_string()).collect(),
        keys: parameters.iter().map(|part| LocalKey::Declared(part.start_byte())).collect(),
        types: method_sym.parameters.clone(),
        arguments: None,
    }
}

/// The environment for the strings of a method declaration.
pub fn method_env<'c, 't>(context: &'c Context<'t>, method: Node<'t>) -> Option<TextEnv<'c, 't>> {
    let owner = enclosing_type(context.file, context.resolver.scope, method)?;
    let (_, found) = declared_method(context, method)?;
    let itself = MethodSym { owner: owner.clone(), name: found.name.clone(), parameters: found.parameters.clone(), returns: found.returns.clone(), is_static: found.is_static };
    Some(TextEnv { context, enclosing: owner, itself: Some(Sym::Method(itself)), method: Some(method_info(context, method, found)) })
}

/// `GuardedByUtils.isGuardedByValid`: the message when a string cannot be bound or a static member is guarded by an instance.
pub fn invalid<'t>(env: &TextEnv<'_, 't>, guards: &[String], is_static: bool) -> Option<&'static str> {
    let mut bound: Vec<Lock> = Vec::new();
    for guard in guards {
        match parse(guard).and_then(|ast| bind(env, &ast)) {
            Some(lock) => bound.push(lock),
            None => return Some("could not resolve guard"),
        }
    }
    for lock in &bound {
        let parameter = matches!(lock.root(), Lock::Local { parameter: true, .. });
        let static_guard = matches!(lock, Lock::Class(_)) || matches!(lock, Lock::Select(_, member) if member.is_static());
        if is_static && !static_guard && !parameter {
            return Some("static member guarded by instance");
        }
    }
    None
}
