//! The `[module, dynamic]` pairs dependency-cruiser finds again when it reads a file as JavaScript after the
//! transpile: a TypeScript dependency without such a pair is pre-compilation only. The compiler leaves out type-only
//! imports and re-exports, imports whose bindings no value uses, `import x = require()` (which it does not emit for
//! ECMAScript modules) and everything in an ambient (`declare`) context.
use super::extract::{first_argument, literal_text};
use crate::typescript::ParsedFile;
use oxc_ast::ast::{ArrayExpressionElement, CallExpression, Class, Expression, ExpressionStatement, Function};
use oxc_ast::ast::{ImportDeclaration, ImportDeclarationSpecifier, ImportExpression, JSXOpeningElement, JSXOpeningFragment};
use oxc_ast::ast::{PropertyDefinition, Statement, TSExternalModuleDeclaration, TSGlobalDeclaration, VariableDeclaration};
use oxc_ast::ast::{IdentifierReference, TSMethodSignature, TSNamespaceDeclaration, TSPropertySignature};
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::Semantic;
use oxc_syntax::scope::{ScopeFlags, ScopeId};
use std::cell::Cell;
use oxc_syntax::symbol::SymbolId;
use serde_json::{Value, json};
use std::collections::HashSet;

type Kept = Vec<(String, bool)>;

const CARRY: &str = "a module name the engine cannot carry";

fn out(kept: Kept) -> Vec<Value> {
    kept.into_iter().map(|(module, dynamic)| json!([module, dynamic])).collect()
}

/// A JavaScript source, read as it is: every import, re-export, `import()`, `require()` and AMD dependency list.
pub(super) fn read_as_is(parsed: &ParsedFile) -> Result<Vec<Value>, String> {
    let mut calls = Calls { kept: Vec::new(), failed: false };
    for statement in &parsed.program.body {
        if let Some(module) = declared_source(statement) {
            push_named(&mut calls.kept, module)?;
        }
    }
    calls.visit_program(parsed.program);
    if calls.failed { Err(CARRY.to_string()) } else { Ok(out(calls.kept)) }
}

/// A TypeScript source after the compiler's transpile to ECMAScript modules.
pub(super) fn transpiled(parsed: &ParsedFile) -> Result<Vec<Value>, String> {
    if has_factory_pragma(parsed) {
        return Err("a JSX factory pragma".to_string());
    }
    let semantic = parsed.semantic();
    let root = semantic.scoping().root_scope_id();
    let mut factories = Factories { semantic: &semantic, used: HashSet::new(), scopes: vec![root], in_key: false };
    factories.visit_program(parsed.program);
    let mut calls = Calls { kept: Vec::new(), failed: false };
    for statement in &parsed.program.body {
        let emitted = match statement {
            Statement::ImportDeclaration(import) => import_is_emitted(import, &semantic, &factories.used),
            Statement::ExportAllDeclaration(export) => !export.export_kind.is_type(),
            Statement::ExportFromDeclaration(export) => {
                !export.export_kind.is_type() && export.specifiers.iter().any(|specifier| !specifier.export_kind.is_type())
            }
            _ => false,
        };
        if let Some(module) = declared_source(statement).filter(|_| emitted) {
            push_named(&mut calls.kept, module)?;
        }
    }
    calls.visit_program(parsed.program);
    if calls.failed { Err(CARRY.to_string()) } else { Ok(out(calls.kept)) }
}

fn declared_source<'a>(statement: &'a Statement<'a>) -> Option<Option<&'a str>> {
    match statement {
        Statement::ImportDeclaration(import) => Some(import.source.value.as_str()),
        Statement::ExportAllDeclaration(export) => Some(export.source.value.as_str()),
        Statement::ExportFromDeclaration(export) => Some(export.source.value.as_str()),
        _ => None,
    }
}

fn push_named(kept: &mut Kept, module: Option<&str>) -> Result<(), String> {
    let module = module.ok_or_else(|| CARRY.to_string())?;
    if !module.is_empty() {
        kept.push((module.to_string(), false));
    }
    Ok(())
}

fn has_factory_pragma(parsed: &ParsedFile) -> bool {
    parsed.program.comments.iter().any(|comment| {
        let text = parsed.slice(comment.span.start, comment.span.end);
        text.contains("@jsx")
    })
}

fn import_is_emitted(import: &ImportDeclaration, semantic: &Semantic, factories: &HashSet<SymbolId>) -> bool {
    let Some(specifiers) = &import.specifiers else { return true };
    if import.import_kind.is_type() {
        return false;
    }
    specifiers.iter().any(|specifier| {
        let local = match specifier {
            ImportDeclarationSpecifier::ImportSpecifier(named) if named.import_kind.is_type() => return false,
            ImportDeclarationSpecifier::ImportSpecifier(named) => &named.local,
            ImportDeclarationSpecifier::ImportDefaultSpecifier(default) => &default.local,
            ImportDeclarationSpecifier::ImportNamespaceSpecifier(namespace) => &namespace.local,
        };
        let Some(symbol) = local.symbol_id.get() else { return false };
        factories.contains(&symbol)
            || semantic.scoping().get_resolved_references(symbol).any(|reference| {
                let flags = reference.flags();
                flags.is_read() || flags.is_write()
            })
    })
}

/// The bindings the compiler counts as used beyond value references: the `React` that JSX elements and fragments
/// reach, and the names in computed keys of type members, which it reads as values.
struct Factories<'s, 'a> {
    semantic: &'s Semantic<'a>,
    used: HashSet<SymbolId>,
    scopes: Vec<ScopeId>,
    in_key: bool,
}

impl Factories<'_, '_> {
    fn reach(&mut self) {
        let Some(&scope) = self.scopes.last() else { return };
        if let Some(symbol) = self.semantic.scoping().find_binding(scope, "React".into()) {
            self.used.insert(symbol);
        }
    }
}

impl<'a> Visit<'a> for Factories<'_, 'a> {
    fn visit_jsx_opening_element(&mut self, it: &JSXOpeningElement<'a>) {
        self.reach();
        walk::walk_jsx_opening_element(self, it);
    }

    fn visit_ts_property_signature(&mut self, it: &TSPropertySignature<'a>) {
        self.in_key = it.computed;
        self.visit_property_key(&it.key);
        self.in_key = false;
        if let Some(annotation) = &it.type_annotation {
            self.visit_ts_type_annotation(annotation);
        }
    }

    fn visit_ts_method_signature(&mut self, it: &TSMethodSignature<'a>) {
        self.in_key = it.computed;
        self.visit_property_key(&it.key);
        self.in_key = false;
        walk::walk_ts_method_signature(self, it);
    }

    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        let scoping = self.semantic.scoping();
        if let Some(symbol) = it.reference_id.get().and_then(|id| scoping.get_reference(id).symbol_id()).filter(|_| self.in_key) {
            self.used.insert(symbol);
        }
    }

    fn visit_jsx_opening_fragment(&mut self, _: &JSXOpeningFragment) {
        self.reach();
    }

    fn enter_scope(&mut self, _: ScopeFlags, scope: &Cell<Option<ScopeId>>) {
        let current = self.scopes.last().copied();
        self.scopes.extend(scope.get().or(current));
    }

    fn leave_scope(&mut self) {
        self.scopes.pop();
    }
}

/// `require()`, `import()` and AMD dependency lists outside ambient declarations.
struct Calls {
    kept: Kept,
    failed: bool,
}

impl Calls {
    fn push(&mut self, module: Option<Option<&str>>, dynamic: bool) {
        match module {
            Some(Some(module)) if dynamic || !module.is_empty() => self.kept.push((module.to_string(), dynamic)),
            Some(None) => self.failed = true,
            _ => {}
        }
    }

    fn unless_ambient(&mut self, declare: bool, walk: impl FnOnce(&mut Self)) {
        if !declare {
            walk(self);
        }
    }
}

fn is_amd(callee: &Expression) -> bool {
    matches!(callee, Expression::Identifier(name) if name.name == "define" || name.name == "require")
}

impl<'a> Visit<'a> for Calls {
    fn visit_expression_statement(&mut self, it: &ExpressionStatement<'a>) {
        if let Expression::CallExpression(call) = &it.expression
            && is_amd(&call.callee)
        {
            for argument in &call.arguments {
                let Some(Expression::ArrayExpression(list)) = argument.as_expression() else { continue };
                for element in &list.elements {
                    if let ArrayExpressionElement::StringLiteral(literal) = element {
                        self.push(Some(literal.value.as_str()), false);
                    }
                }
            }
        }
        walk::walk_expression_statement(self, it);
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if matches!(it.callee.without_parentheses(), Expression::Identifier(callee) if callee.name == "require") {
            self.push(literal_text(first_argument(it).map(Expression::without_parentheses)), false);
        }
        walk::walk_call_expression(self, it);
    }

    fn visit_import_expression(&mut self, it: &ImportExpression<'a>) {
        self.push(literal_text(Some(it.source.without_parentheses())), true);
        walk::walk_import_expression(self, it);
    }

    fn visit_variable_declaration(&mut self, it: &VariableDeclaration<'a>) {
        self.unless_ambient(it.declare, |this| walk::walk_variable_declaration(this, it));
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        self.unless_ambient(it.declare, |this| walk::walk_function(this, it, flags));
    }

    fn visit_class(&mut self, it: &Class<'a>) {
        self.unless_ambient(it.declare, |this| walk::walk_class(this, it));
    }

    fn visit_property_definition(&mut self, it: &PropertyDefinition<'a>) {
        self.unless_ambient(it.declare, |this| walk::walk_property_definition(this, it));
    }

    fn visit_ts_namespace_declaration(&mut self, it: &TSNamespaceDeclaration<'a>) {
        self.unless_ambient(it.declare, |this| walk::walk_ts_namespace_declaration(this, it));
    }

    fn visit_ts_external_module_declaration(&mut self, _: &TSExternalModuleDeclaration<'a>) {}

    fn visit_ts_global_declaration(&mut self, _: &TSGlobalDeclaration<'a>) {}
}
