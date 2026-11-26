//! Names in the string of a `@GuardedBy` annotation: `GuardedBySymbolResolver`.
use super::ast::Ast;
use super::members::{find_field, find_method, is_member_class, lexical_parent, owner, Owner};
use super::{Env, MethodSym, Sym, VarKind, VarSym};
use crate::java::errorprone::hierarchy::closure;
use crate::java::errorprone::Context;
use crate::java::types::model::Type;
use super::super::lock::{Lock, LocalKey, simple_name};

/// The method an annotation sits on: its parameters, and the arguments of the call that reads the annotation.
pub struct MethodInfo {
    pub names: Vec<String>,
    pub keys: Vec<LocalKey>,
    pub types: Vec<Type>,
    pub arguments: Option<Vec<Option<VarSym>>>,
}

pub struct TextEnv<'c, 't> {
    pub context: &'c Context<'t>,
    /// The class that declares the annotated member.
    pub enclosing: String,
    /// What `itself` stands for.
    pub itself: Option<Sym>,
    pub method: Option<MethodInfo>,
}

impl TextEnv<'_, '_> {
    fn param(&self, name: &str) -> Option<VarSym> {
        let method = self.method.as_ref()?;
        let at = method.names.iter().position(|param| param == name)?;
        if let Some(Some(argument)) = method.arguments.as_ref().and_then(|arguments| arguments.get(at)) {
            return Some(argument.clone());
        }
        Some(VarSym { kind: VarKind::Parameter, owner: String::new(), name: name.to_string(), is_static: false, ty: method.types.get(at).cloned(), key: method.keys.get(at)?.clone() })
    }

    /// The class a lock expression's type stands for.
    fn base_class(&self, base: &Lock) -> Option<String> {
        if matches!(base, Lock::This) {
            return Some(self.enclosing.clone());
        }
        match base.kind()? {
            Type::Class(class, _) => Some(class),
            Type::Array(_) => Some(crate::java::types::model::OBJECT.to_string()),
            _ => None,
        }
    }

    /// `getLexicallyEnclosing`: the first owner of the class, or of the owners, that is named `name`.
    fn lexical(&self, name: &str) -> Lexical {
        let mut current = owner(self.context, &self.enclosing);
        loop {
            current = match current {
                Owner::Nothing => return Lexical::Nothing,
                Owner::Package(package) => return if package.rsplit('.').next() == Some(name) { Lexical::Package } else { Lexical::Nothing },
                Owner::Class(class) => {
                    if simple_name(&class) == name {
                        return Lexical::Found(Sym::Class(class));
                    }
                    if !is_member_class(&class) {
                        return Lexical::Nothing;
                    }
                    match lexical_parent(self.context.resolver.index, &class) {
                        Some(parent) => Owner::Class(parent),
                        None => return Lexical::Nothing,
                    }
                }
                Owner::Symbol(sym, class) => {
                    let named = match &sym {
                        Sym::Method(method) => method.name == name,
                        Sym::Var(var) => var.name == name,
                        Sym::Class(_) => false,
                    };
                    if named {
                        return Lexical::Found(sym);
                    }
                    Owner::Class(class)
                }
                Owner::Anonymous(class) => Owner::Class(class),
            };
        }
    }

    /// `resolveType`: supertypes, the class itself, the classes around it, then what the file imports.
    fn resolve_sym(&self, name: &str, supers: bool) -> Option<Sym> {
        let index = self.context.resolver.index;
        let mut found: Option<Sym> = None;
        if supers {
            found = std::iter::once(self.enclosing.clone()).chain(closure(index, &self.enclosing)).find(|class| simple_name(class) == name).map(Sym::Class);
        }
        if simple_name(&self.enclosing) == name {
            found = Some(Sym::Class(self.enclosing.clone()));
        }
        if found.is_none() {
            match self.lexical(name) {
                Lexical::Package => return None,
                Lexical::Found(sym) => found = Some(sym),
                Lexical::Nothing => {}
            }
        }
        found.or_else(|| {
            let resolver = self.context.resolver;
            resolver.class_name(self.context.file.tree.root_node(), name).filter(|class| index.has(class)).map(Sym::Class)
        })
    }

    fn resolve_type(&self, name: &str, supers: bool) -> Option<String> {
        match self.resolve_sym(name, supers)? {
            Sym::Class(class) => Some(class),
            _ => None,
        }
    }
}

enum Lexical {
    Found(Sym),
    Package,
    Nothing,
}

impl<'t> Env<'t> for TextEnv<'_, 't> {
    fn context(&self) -> &Context<'t> {
        self.context
    }
    fn this_class(&self) -> &str {
        &self.enclosing
    }
    fn ident(&self, ast: &Ast<'t>) -> Option<Sym> {
        let Ast::Ident(name, _) = ast else { return None };
        if name == "this" {
            return Some(Sym::Class(self.enclosing.clone()));
        }
        if name == "itself" {
            return self.itself.clone();
        }
        if let Some(field) = find_field(self.context, &self.enclosing, name) {
            return Some(Sym::Var(field));
        }
        if let Some(param) = self.param(name) {
            return Some(Sym::Var(param));
        }
        self.resolve_sym(name, true)
    }
    fn method_ident(&self, _: &Ast<'t>, name: &str) -> Option<MethodSym> {
        find_method(self.context, &self.enclosing, name)
    }
    fn method_select(&self, _: &Ast<'t>, base: &Lock, name: &str) -> Option<MethodSym> {
        find_method(self.context, &self.base_class(base)?, name)
    }
    fn select(&self, base: &Lock, _: &Ast<'t>, name: &str) -> Option<Sym> {
        if matches!(base.kind(), Some(Type::Array(_))) && name == "length" {
            return Some(Sym::Var(VarSym { kind: VarKind::Field, owner: "<array>".to_string(), name: name.to_string(), is_static: false, ty: Some(Type::Primitive("int")), key: LocalKey::Declared(0) }));
        }
        find_field(self.context, &self.base_class(base)?, name).map(Sym::Var)
    }
    fn member_ref(&self, base: &Lock, _: &Ast<'t>, name: &str) -> Option<MethodSym> {
        find_method(self.context, &self.base_class(base)?, name)
    }
    fn type_literal(&self, expression: &Ast<'t>) -> Option<String> {
        let Ast::Ident(name, _) = expression else { return None };
        self.resolve_type(name, true)
    }
    fn enclosing_class(&self, expression: &Ast<'t>) -> Option<String> {
        let Ast::Ident(name, _) = expression else { return None };
        self.resolve_type(name, false)
    }
}
