//! The `[module, dynamic]` pairs dependency-cruiser finds again when it reads a file as JavaScript after the
//! transpile: a TypeScript dependency without such a pair is pre-compilation only. The compiler leaves out type-only
//! imports and re-exports, imports whose bindings no value uses, `import x = require()` and `export =` (which it does
//! not emit for ECMAScript modules) and everything in an ambient (`declare`) context.
use super::extract::{first_argument, literal_text};
use super::factories::Factories;
use crate::typescript::ParsedFile;
use oxc_ast::ast::{ArrayExpressionElement, CallExpression, Class, Expression, ExpressionStatement, Function};
use oxc_ast::ast::{ImportExpression, PropertyDefinition, Statement, TSEnumDeclaration, TSExportAssignment};
use oxc_ast::ast::{TSExternalModuleDeclaration, TSGlobalDeclaration, TSNamespaceDeclaration, VariableDeclaration};
use oxc_ast_visit::{Visit, walk};
use oxc_syntax::scope::ScopeFlags;
use serde_json::{Value, json};

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
    let factories = Factories::of(&semantic, parsed);
    let mut calls = Calls { kept: Vec::new(), failed: false };
    for statement in &parsed.program.body {
        let emitted = match statement {
            Statement::ImportDeclaration(import) => factories.emits(import),
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

/// `require()`, `import()` and AMD dependency lists outside ambient declarations and `export =`, which the compiler
/// drops for ECMAScript modules.
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

    fn visit_ts_enum_declaration(&mut self, it: &TSEnumDeclaration<'a>) {
        self.unless_ambient(it.declare, |this| walk::walk_ts_enum_declaration(this, it));
    }

    fn visit_ts_export_assignment(&mut self, _: &TSExportAssignment<'a>) {}

    fn visit_ts_external_module_declaration(&mut self, _: &TSExternalModuleDeclaration<'a>) {}

    fn visit_ts_global_declaration(&mut self, _: &TSGlobalDeclaration<'a>) {}
}
