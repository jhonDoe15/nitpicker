//! `GuardedByBinder`: lock expressions bound from a tree or from the string of a `@GuardedBy` annotation.
pub mod ast;
pub mod members;
pub mod text_env;
pub mod tree_env;

use self::ast::Ast;
use super::lock::{Lock, LocalKey, Member};
use crate::java::errorprone::Context;
use crate::java::types::model::Type;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum VarKind {
    Local,
    Parameter,
    Binding,
    Field,
    This,
    Super,
    /// An exception parameter, a resource variable or an enum constant.
    Other,
}

#[derive(Clone, Debug)]
pub struct VarSym {
    pub kind: VarKind,
    /// The class that declares a field; empty for variables.
    pub owner: String,
    pub name: String,
    pub is_static: bool,
    pub ty: Option<Type>,
    pub key: LocalKey,
}

#[derive(Clone, Debug)]
pub struct MethodSym {
    pub owner: String,
    pub name: String,
    pub parameters: Vec<Type>,
    pub returns: Type,
    pub is_static: bool,
}

#[derive(Clone, Debug)]
pub enum Sym {
    Var(VarSym),
    Method(MethodSym),
    Class(String),
}

impl Sym {
    pub fn is_static(&self) -> bool {
        match self {
            Sym::Var(var) => var.is_static,
            Sym::Method(method) => method.is_static,
            Sym::Class(_) => false,
        }
    }
    pub fn owner(&self) -> &str {
        match self {
            Sym::Var(var) => &var.owner,
            Sym::Method(method) => &method.owner,
            Sym::Class(class) => class,
        }
    }
    pub fn member(&self) -> Option<Member> {
        match self {
            Sym::Var(var) => Some(Member::Field { owner: var.owner.clone(), name: var.name.clone(), kind: var.ty.clone().unwrap_or(Type::Null), is_static: var.is_static }),
            Sym::Method(method) => Some(Member::Method { owner: method.owner.clone(), name: method.name.clone(), parameters: method.parameters.clone(), returns: method.returns.clone(), is_static: method.is_static }),
            Sym::Class(_) => None,
        }
    }
}

/// `GuardedByBinder.Resolver`: what each name in an expression stands for. `None` is a failed lookup.
pub trait Env<'t> {
    fn context(&self) -> &Context<'t>;
    /// The class `this` stands for.
    fn this_class(&self) -> &str;
    fn ident(&self, node: &Ast<'t>) -> Option<Sym>;
    fn method_ident(&self, node: &Ast<'t>, name: &str) -> Option<MethodSym>;
    fn method_select(&self, node: &Ast<'t>, base: &Lock, name: &str) -> Option<MethodSym>;
    fn select(&self, base: &Lock, node: &Ast<'t>, name: &str) -> Option<Sym>;
    fn member_ref(&self, base: &Lock, node: &Ast<'t>, name: &str) -> Option<MethodSym>;
    fn type_literal(&self, expression: &Ast<'t>) -> Option<String>;
    fn enclosing_class(&self, expression: &Ast<'t>) -> Option<String>;
}

/// Binds an expression; `None` where Error Prone throws `IllegalGuardedBy`.
pub fn bind<'t>(env: &dyn Env<'t>, ast: &Ast<'t>) -> Option<Lock> {
    match visit(env, ast)? {
        Lock::Type(_) => None,
        lock => Some(lock),
    }
}

fn visit<'t>(env: &dyn Env<'t>, ast: &Ast<'t>) -> Option<Lock> {
    match ast {
        Ast::Paren(inner) => visit(env, inner),
        Ast::Ident(..) => ident(env, ast),
        Ast::Call { object: None, name, nullary, .. } => {
            if !nullary {
                return None;
            }
            let method = env.method_ident(ast, name)?;
            let base = normalize(env, &Sym::Method(method.clone()), None)?;
            select(&base, &Sym::Method(method))
        }
        Ast::Call { object: Some(object), name, nullary, .. } => {
            if !nullary {
                return None;
            }
            let base = visit(env, object)?;
            let method = env.method_select(ast, &base, name)?;
            let base = normalize(env, &Sym::Method(method.clone()), Some(base))?;
            select(&base, &Sym::Method(method))
        }
        Ast::Select(object, name, _) => match name.as_str() {
            "this" => {
                let base = env.enclosing_class(object);
                if base.as_deref() == Some(env.this_class()) {
                    return Some(Lock::This);
                }
                qualified_this(env, &base?)
            }
            "class" => Some(Lock::Class(env.type_literal(object)?)),
            _ => {
                let base = visit(env, object)?;
                let sym = env.select(&base, ast, name)?;
                if matches!(sym, Sym::Class(_)) {
                    return None;
                }
                let base = normalize(env, &sym, Some(base))?;
                select(&base, &sym)
            }
        },
        Ast::MemberRef(qualifier, name, _) => {
            let base = visit(env, qualifier)?;
            let method = env.member_ref(&base, ast, name)?;
            let base = normalize(env, &Sym::Method(method.clone()), Some(base))?;
            select(&base, &Sym::Method(method))
        }
        Ast::Other => None,
    }
}

fn ident<'t>(env: &dyn Env<'t>, ast: &Ast<'t>) -> Option<Lock> {
    let Ast::Ident(name, _) = ast else { return None };
    match env.ident(ast)? {
        Sym::Var(var) => match var.kind {
            VarKind::Local | VarKind::Parameter | VarKind::Binding => {
                Some(Lock::Local { key: var.key.clone(), name: var.name.clone(), parameter: var.kind == VarKind::Parameter, kind: var.ty.clone() })
            }
            VarKind::This => Some(Lock::This),
            VarKind::Field | VarKind::Super => {
                let sym = Sym::Var(var);
                let base = normalize(env, &sym, None)?;
                select(&base, &sym)
            }
            VarKind::Other => None,
        },
        Sym::Method(method) => {
            let base = normalize(env, &Sym::Method(method.clone()), None)?;
            select(&base, &Sym::Method(method))
        }
        Sym::Class(class) => Some(if name == "this" { Lock::This } else { Lock::Type(class) }),
    }
}

fn select(base: &Lock, sym: &Sym) -> Option<Lock> {
    if matches!(base, Lock::Type(_)) && !sym.is_static() {
        return None;
    }
    Some(Lock::select(base, sym.member()?))
}

/// The receiver of a select expression: type names for static members, `this`, or a path to an enclosing instance.
fn normalize<'t>(env: &dyn Env<'t>, sym: &Sym, base: Option<Lock>) -> Option<Lock> {
    if sym.is_static() {
        return Some(Lock::Type(sym.owner().to_string()));
    }
    if let Some(base) = base.filter(|base| !matches!(base, Lock::This)) {
        return Some(base);
    }
    let index = env.context().resolver.index;
    let this = env.this_class();
    if members::is_member_of(env.context(), sym, this) {
        return Some(Lock::This);
    }
    let mut scope = members::lexical_parent(index, this);
    while let Some(class) = scope {
        if members::is_member_of(env.context(), sym, &class) {
            return qualified_this(env, &class);
        }
        scope = members::lexical_parent(index, &class);
    }
    None
}

/// `this.outer$.outer$`: from an instance of the current class out to the lexically enclosing class `enclosing`.
fn qualified_this<'t>(env: &dyn Env<'t>, enclosing: &str) -> Option<Lock> {
    let index = env.context().resolver.index;
    let mut lock = Lock::This;
    let mut current = env.this_class().to_string();
    loop {
        current = members::lexical_parent(index, &current)?;
        lock = Lock::select(&lock, Member::Outer { owner: current.clone() });
        if current == enclosing {
            return Some(lock);
        }
    }
}
