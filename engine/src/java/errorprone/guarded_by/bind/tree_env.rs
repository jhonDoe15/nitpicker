//! Names in a tree, bound the way javac attributed them.
use super::ast::Ast;
use super::{Env, MethodSym, Sym, VarKind, VarSym};
use crate::java::errorprone::lookup::field_of;
use crate::java::errorprone::Context;
use crate::java::javac::locals::{Found, declaration, kind as local_kind};
use crate::java::types::expr::{Binding, Receiver};
use crate::java::types::model::{Type, flag};
use crate::java::types::scope::enclosing_type;
use crate::engine::source::{ancestor, children};
use super::super::lock::{Lock, LocalKey};
use super::super::Shared;
use tree_sitter::Node;

pub struct TreeEnv<'c, 't> {
    pub context: &'c Context<'t>,
    pub shared: &'c Shared<'t>,
    pub this_class: String,
}

impl<'c, 't> TreeEnv<'c, 't> {
    fn local(&self, decl: Node<'t>, usage: Node<'t>, name: &str) -> VarSym {
        let kind = match decl.kind() {
            "formal_parameter" | "spread_parameter" | "identifier" => VarKind::Parameter,
            "catch_formal_parameter" | "resource" => VarKind::Other,
            "instanceof_expression" | "type_pattern" | "record_pattern_component" => VarKind::Binding,
            _ => VarKind::Local,
        };
        let ty = local_kind(self.context.resolver, decl, usage, name);
        VarSym { kind, owner: String::new(), name: name.to_string(), is_static: false, ty, key: LocalKey::Declared(decl.start_byte()) }
    }

    /// What a call argument stands for when it is a plain name, `this` or a field access.
    pub fn var_of_argument(&self, node: Node<'t>) -> Option<VarSym> {
        match node.kind() {
            "identifier" | "this" | "field_access" => self.var_of(node),
            _ => None,
        }
    }

    /// The variable a name or field access stands for.
    pub fn var_of(&self, node: Node<'t>) -> Option<VarSym> {
        match self.sym_of(node)? {
            Sym::Var(var) => Some(var),
            _ => None,
        }
    }

    pub fn sym_of(&self, node: Node<'t>) -> Option<Sym> {
        let resolver = self.context.resolver;
        match node.kind() {
            "this" | "super" => {
                let owner = enclosing_type(self.context.file, resolver.scope, node)?;
                let kind = if node.kind() == "this" { VarKind::This } else { VarKind::Super };
                Some(Sym::Var(VarSym { kind, owner: owner.clone(), name: node.kind().to_string(), is_static: false, ty: Some(Type::class(&owner)), key: LocalKey::Declared(0) }))
            }
            "identifier" => {
                let name = self.context.text(node);
                match declaration(resolver, self.shared.scopes(self.context), node, name) {
                    Some(Found::Local(decl)) => return Some(Sym::Var(self.local(decl, node, name))),
                    Some(Found::Field) | None => {}
                }
                match resolver.binding(node, name) {
                    Some(Binding::Field(_, info, field)) => {
                        let kind = if field.flags & flag::ENUM != 0 { VarKind::Other } else { VarKind::Field };
                        Some(Sym::Var(VarSym { kind, owner: info.name.clone(), name: name.to_string(), is_static: field.flags & flag::STATIC != 0, ty: Some(field.kind.clone()), key: LocalKey::Declared(0) }))
                    }
                    Some(Binding::Local(_)) => self.component(node, name),
                    None => resolver.class_name(node, name).filter(|class| resolver.index.has(class)).map(Sym::Class),
                }
            }
            "field_access" => {
                let (object, name) = (node.child_by_field_name("object")?, self.context.text(node.child_by_field_name("field")?));
                if let Some((info, field)) = field_of(self.context, node) {
                    return Some(Sym::Var(VarSym { kind: VarKind::Field, owner: info.name.clone(), name: name.to_string(), is_static: field.flags & flag::STATIC != 0, ty: Some(field.kind.clone()), key: LocalKey::Declared(0) }));
                }
                match resolver.receiver(object)? {
                    Receiver::Value(Type::Array(_)) if name == "length" => {
                        Some(Sym::Var(VarSym { kind: VarKind::Field, owner: "<array>".to_string(), name: name.to_string(), is_static: false, ty: Some(Type::Primitive("int")), key: LocalKey::Declared(0) }))
                    }
                    _ => None,
                }
            }
            _ => None,
        }
    }

    /// A record component read in the body of its record: the field.
    fn component(&self, node: Node<'t>, name: &str) -> Option<Sym> {
        let resolver = self.context.resolver;
        let record = ancestor(node, &["record_declaration"])?;
        let body = record.child_by_field_name("body")?;
        let inside = body.start_byte() <= node.start_byte() && node.end_byte() <= body.end_byte();
        let listed = record.child_by_field_name("parameters").map(children).unwrap_or_default();
        let declared = |part: &Node| part.child_by_field_name("name").or_else(|| children(*part).into_iter().find(|kid| kid.kind() == "variable_declarator").and_then(|kid| kid.child_by_field_name("name"))).is_some_and(|found| self.context.text(found) == name);
        if !inside || !listed.iter().any(declared) {
            return None;
        }
        let owner = resolver.scope.names.get(&record.id())?;
        let (info, field) = resolver.index.field(owner, name)?;
        Some(Sym::Var(VarSym { kind: VarKind::Field, owner: info.name.clone(), name: name.to_string(), is_static: false, ty: Some(field.kind.clone()), key: LocalKey::Declared(0) }))
    }

    pub fn method_sym(&self, node: Node<'t>) -> Option<MethodSym> {
        let call = self.context.resolver.resolve_call(node)?;
        Some(MethodSym { owner: call.declaring, name: call.method.name.clone(), parameters: call.method.parameters.clone(), returns: call.method.returns.clone(), is_static: call.method.is_static })
    }
}

fn node_of<'t>(ast: &Ast<'t>) -> Option<Node<'t>> {
    match ast {
        Ast::Ident(_, node) | Ast::Select(_, _, node) | Ast::MemberRef(_, _, node) => *node,
        Ast::Call { node, .. } => *node,
        _ => None,
    }
}

impl<'c, 't> Env<'t> for TreeEnv<'c, 't> {
    fn context(&self) -> &Context<'t> {
        self.context
    }
    fn this_class(&self) -> &str {
        &self.this_class
    }
    fn ident(&self, ast: &Ast<'t>) -> Option<Sym> {
        let node = node_of(ast)?;
        if node.kind() == "method_invocation" {
            return self.method_sym(node).map(Sym::Method);
        }
        self.sym_of(node)
    }
    fn method_ident(&self, ast: &Ast<'t>, _: &str) -> Option<MethodSym> {
        self.method_sym(node_of(ast)?)
    }
    fn method_select(&self, ast: &Ast<'t>, _: &Lock, _: &str) -> Option<MethodSym> {
        self.method_sym(node_of(ast)?)
    }
    fn select(&self, _: &Lock, ast: &Ast<'t>, _: &str) -> Option<Sym> {
        let node = node_of(ast)?;
        if node.kind() == "method_invocation" {
            return self.method_sym(node).map(Sym::Method);
        }
        self.sym_of(node)
    }
    fn member_ref(&self, _: &Lock, ast: &Ast<'t>, name: &str) -> Option<MethodSym> {
        let node = node_of(ast)?;
        let resolver = self.context.resolver;
        let qualifier = node.named_child(0)?;
        let class = match resolver.receiver(qualifier)? {
            Receiver::Static(class) => class,
            Receiver::Value(Type::Class(class, _)) => class,
            Receiver::Value(_) => return None,
        };
        let candidates = resolver.index.methods(&class, name);
        let (info, method) = match candidates.as_slice() {
            [only] => *only,
            _ => {
                let (_, info, method, _) = resolver.reference_method(node, &[])?;
                (info, method)
            }
        };
        Some(MethodSym { owner: info.name.clone(), name: name.to_string(), parameters: method.parameters.clone(), returns: method.returns.clone(), is_static: method.is_static })
    }
    fn type_literal(&self, ast: &Ast<'t>) -> Option<String> {
        let Ast::Ident(text, Some(node)) = ast else { return None };
        self.context.resolver.class_name(*node, text).filter(|class| self.context.resolver.index.has(class))
    }
    fn enclosing_class(&self, ast: &Ast<'t>) -> Option<String> {
        self.type_literal(ast)
    }
}


