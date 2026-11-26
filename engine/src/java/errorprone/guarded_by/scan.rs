//! `HeldLockAnalyzer`: walks a method body with the set of locks held and checks accesses to guarded members.
use super::bind::ast::{Ast, from_node, parse};
use super::bind::text_env::{MethodInfo, TextEnv};
use super::bind::tree_env::TreeEnv;
use super::bind::{Env, Sym, VarKind, bind};
use super::check::{Shared, method_env, own_suppressed};
use super::lock::{Held, LocalKey, Lock, expected, is_read_write, message};
use super::release::{released, runs_immediately};
use crate::engine::source::{children, named_children};
use crate::java::errorprone::shape::preferred;
use crate::java::errorprone::Context;
use crate::java::helpers::has_modifier;
use crate::java::javac::locals::is_use;
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

const METHODS: &[&str] = &["method_declaration", "constructor_declaration", "compact_constructor_declaration", "annotation_type_element_declaration"];
const CLASSES: &[&str] = &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];
const VARIABLES: &[&str] = &["local_variable_declaration", "field_declaration", "constant_declaration", "formal_parameter", "spread_parameter", "catch_formal_parameter", "resource"];

pub struct Scanner<'c, 't> {
    pub context: &'c Context<'t>,
    pub shared: &'c Shared<'t>,
    pub env: TreeEnv<'c, 't>,
}

fn dot_position(call: Node) -> usize {
    children(call).into_iter().find(|part| part.kind() == ".").map_or(call.start_byte(), |dot| dot.start_byte())
}

impl<'c, 't> Scanner<'c, 't> {
    pub fn scan(&self, node: Node<'t>, locks: &Held) {
        let kind = node.kind();
        if METHODS.contains(&kind) {
            return self.method(node, locks);
        }
        match kind {
            "try_statement" | "try_with_resources_statement" => self.try_statement(node, locks),
            "synchronized_statement" => self.synchronized(node, locks),
            "field_access" => {
                self.check(node, locks);
                if let Some(object) = node.child_by_field_name("object") {
                    self.scan(object, locks);
                }
            }
            "identifier" => {
                if is_use(node) {
                    self.check(node, locks);
                }
            }
            "method_invocation" => {
                self.check(node, locks);
                self.scan_children(node, locks);
            }
            "object_creation_expression" | "enum_constant" => {
                if kind == "enum_constant" && own_suppressed(self.context, node) {
                    return;
                }
                for child in children(node).into_iter().filter(|child| child.kind() != "class_body") {
                    self.scan(child, locks);
                }
            }
            "lambda_expression" => {
                if runs_immediately(self.context, node) {
                    self.scan_children(node, locks);
                }
            }
            "method_reference" => {
                self.check(node, locks);
                if let Some(qualifier) = node.named_child(0) {
                    self.scan(qualifier, locks);
                }
            }
            _ if VARIABLES.contains(&kind) || CLASSES.contains(&kind) => {
                if !own_suppressed(self.context, node) {
                    self.scan_children(node, locks);
                }
            }
            _ => self.scan_children(node, locks),
        }
    }

    fn scan_children(&self, node: Node<'t>, locks: &Held) {
        for child in children(node) {
            self.scan(child, locks);
        }
    }

    fn method(&self, node: Node<'t>, locks: &Held) {
        if own_suppressed(self.context, node) {
            return;
        }
        let mut locks = locks.clone();
        if has_modifier(node, "synchronized") {
            let owner = enclosing_type(self.context.file, self.context.resolver.scope, node).unwrap_or_default();
            locks = locks.plus(if has_modifier(node, "static") { Lock::Class(owner) } else { Lock::This });
        }
        let guards = self.context.resolver.guard_values(node);
        if !guards.is_empty() {
            if let Some(env) = method_env(self.context, node) {
                for guard in guards {
                    if let Some(lock) = parse(&guard).and_then(|ast| bind(&env, &ast)) {
                        locks = locks.plus(lock);
                    }
                }
            }
        }
        self.scan_children(node, &locks);
    }

    fn try_statement(&self, node: Node<'t>, locks: &Held) {
        let finally = children(node).into_iter().find(|part| part.kind() == "finally_clause");
        let freed = finally.and_then(|clause| named_children(clause).into_iter().find(|part| part.kind() == "block")).map(|block| released(self.context, &self.env, block)).unwrap_or_default();
        let inside = locks.plus_all(freed);
        for child in children(node) {
            match child.kind() {
                "block" | "catch_clause" => self.scan(child, &inside),
                "resource_specification" => {
                    self.scan(child, locks);
                    self.scan(child, locks);
                }
                _ => self.scan(child, locks),
            }
        }
    }

    fn synchronized(&self, node: Node<'t>, locks: &Held) {
        let held = named_children(node).into_iter().find(|part| part.kind() == "parenthesized_expression").and_then(|lock| bind(&self.env, &from_node(self.context, lock)));
        if let Some(body) = node.child_by_field_name("body") {
            self.scan(body, &held.map_or_else(|| locks.clone(), |lock| locks.plus(lock)));
        }
    }

    fn sym_of(&self, node: Node<'t>) -> Option<Sym> {
        match node.kind() {
            "method_invocation" => self.env.method_sym(node).map(Sym::Method),
            "method_reference" => self.env.member_ref(&Lock::This, &from_node(self.context, node), self.context.text(node.named_child(1)?)).map(Sym::Method),
            _ => self.env.sym_of(node),
        }
    }

    /// The tree as the binder reads an access: a method call is read as the select of its method.
    fn access(&self, node: Node<'t>) -> Ast<'t> {
        if node.kind() != "method_invocation" {
            return from_node(self.context, node);
        }
        let name = node.child_by_field_name("name").map(|name| self.context.text(name).to_string()).unwrap_or_default();
        match node.child_by_field_name("object") {
            Some(object) => Ast::Select(Box::new(from_node(self.context, object)), name, Some(node)),
            None => Ast::Ident(name, Some(node)),
        }
    }

    fn text_env(&self, sym: &Sym, node: Node<'t>) -> TextEnv<'c, 't> {
        let index = self.context.resolver.index;
        let method = match sym {
            Sym::Method(method) => index.get(&method.owner).and_then(|info| info.methods.iter().find(|other| other.name == method.name && other.parameters == method.parameters)).map(|found| {
                let arguments = (node.kind() == "method_invocation").then(|| {
                    let list = node.child_by_field_name("arguments").map(named_children).unwrap_or_default();
                    list.into_iter().filter(|part| !part.kind().ends_with("comment")).map(|part| self.env.var_of_argument(part)).collect()
                });
                let id = format!("{}#{}#{}", method.owner, method.name, found.shown);
                MethodInfo {
                    names: found.names.clone(),
                    keys: (0..found.parameters.len()).map(|at| LocalKey::Parameter(id.clone(), at)).collect(),
                    types: found.parameters.clone(),
                    arguments,
                }
            }),
            _ => None,
        };
        TextEnv { context: self.context, enclosing: sym.owner().to_string(), itself: Some(sym.clone()), method }
    }

    /// The name of the member an access reads.
    fn accessed(&self, node: Node<'t>) -> Option<&str> {
        let name = match node.kind() {
            "field_access" => node.child_by_field_name("field")?,
            "method_invocation" => node.child_by_field_name("name")?,
            "method_reference" => node.named_child(1)?,
            _ => node,
        };
        Some(self.context.text(name))
    }

    fn check(&self, node: Node<'t>, locks: &Held) {
        let guarded = self.context.resolver.index.guarded_names();
        if !self.accessed(node).is_some_and(|name| guarded.contains(name)) {
            return;
        }
        let Some(sym) = self.sym_of(node) else { return };
        let guards = guards_of(self.context, &sym);
        if guards.is_empty() {
            return;
        }
        let offset = match node.kind() {
            "field_access" => preferred(node),
            "method_invocation" if node.child_by_field_name("object").is_some() => dot_position(node),
            "method_invocation" => node.child_by_field_name("name").map_or(node.start_byte(), |name| name.start_byte()),
            _ => node.start_byte(),
        };
        let env = self.text_env(&sym, node);
        for guard in guards {
            let Some(bound) = parse(&guard).and_then(|ast| bind(&env, &ast)) else {
                self.invalid(node, offset, locks, &guard);
                continue;
            };
            let access = bind(&self.env, &self.access(node));
            let Some(needed) = expected(bound, access) else {
                self.invalid(node, offset, locks, &guard);
                continue;
            };
            if is_read_write(&needed, self.context.resolver.index) || locks.contains(&needed) {
                continue;
            }
            self.shared.report(self.context, node, offset, &message(&needed, locks));
        }
    }

    fn invalid(&self, node: Node<'t>, offset: usize, locks: &Held, guard: &str) {
        self.shared.report(self.context, node, offset, &message(&Lock::Error(guard.to_string()), locks));
    }
}

/// The `@GuardedBy` strings of the member a symbol stands for.
fn guards_of(context: &Context, sym: &Sym) -> Vec<String> {
    let index = context.resolver.index;
    match sym {
        Sym::Var(var) if matches!(var.kind, VarKind::Field | VarKind::Other) => {
            let field = index.get(&var.owner).and_then(|info| info.fields.iter().find(|field| field.name == var.name));
            field.map(|field| index.guard_texts(&var.owner, &field.guards)).unwrap_or_default()
        }
        Sym::Method(method) => index
            .get(&method.owner)
            .and_then(|info| info.methods.iter().find(|other| other.name == method.name && other.parameters == method.parameters))
            .map(|found| index.guard_texts(&method.owner, &found.detail.guards))
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

