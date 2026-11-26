//! The dependencies the TypeScript extraction of dependency-cruiser lists for a file: top-level imports, then
//! re-exports, then `import x = require()`, then triple-slash directives, then every `require()`, `import()` and
//! `import()` type anywhere in the file in the order the compiler's tree walk meets them.
use super::directives;
use crate::typescript::ParsedFile;
use oxc_ast::ast::{Argument, CallExpression, Declaration, Expression, ImportDeclaration, ImportDeclarationSpecifier};
use oxc_ast::ast::{ImportExpression, ImportOrExportKind, Statement, TSImportEqualsDeclaration, TSImportType};
use oxc_ast::ast::{ModuleExportName, TSModuleReference, TemplateLiteral};
use oxc_ast_visit::{Visit, walk};
use oxc_span::GetSpan;
use serde_json::{Value, json};

/// One dependency as `[module, kind]`, where the kind names the shape dependency-cruiser gives it.
type Found = (String, &'static str);

pub(super) fn dependencies(parsed: &ParsedFile) -> Result<Vec<Value>, String> {
    let mut found: Vec<Found> = Vec::new();
    let body = &parsed.program.body;
    if body.iter().any(has_string_names) {
        return Err("module export names written as strings, which the JavaScript reader refuses".to_string());
    }
    for statement in body {
        if let Statement::ImportDeclaration(import) = statement {
            let kind = if is_type_only_import(import, parsed) { "import-type-only" } else { "import" };
            found.push((text(import.source.value.as_str())?, kind));
        }
    }
    for statement in body {
        let (source, type_only) = match statement {
            Statement::ExportFromDeclaration(export) => {
                (&export.source, export.export_kind.is_type() || export.specifiers.iter().all(|it| it.export_kind.is_type()))
            }
            Statement::ExportAllDeclaration(export) => (&export.source, export.export_kind.is_type()),
            _ => continue,
        };
        found.push((text(source.value.as_str())?, if type_only { "export-type-only" } else { "export" }));
    }
    for statement in body {
        let equals = match statement {
            Statement::TSImportEqualsDeclaration(equals) => equals,
            Statement::ExportDeclaration(export) => match &export.declaration {
                Declaration::TSImportEqualsDeclaration(equals) => equals,
                _ => continue,
            },
            _ => continue,
        };
        if let Some(module) = required_module(equals)? {
            found.push((module, "import-equals"));
        }
    }
    found.extend(directives::of(parsed.text)?);
    let mut nested = Nested { found: Vec::new(), failed: false };
    nested.visit_program(parsed.program);
    if nested.failed {
        return Err("a module name the engine cannot carry".to_string());
    }
    nested.found.sort_by_key(|(start, end, _)| (*start, std::cmp::Reverse(*end)));
    found.extend(nested.found.into_iter().map(|(_, _, found)| found));
    Ok(found.into_iter().map(|(module, kind)| json!([module, kind])).collect())
}

fn has_string_names(statement: &Statement) -> bool {
    let named = |name: &ModuleExportName| matches!(name, ModuleExportName::StringLiteral(_));
    match statement {
        Statement::ImportDeclaration(import) => import.specifiers.iter().flatten().any(|specifier| {
            matches!(specifier, ImportDeclarationSpecifier::ImportSpecifier(it) if named(&it.imported))
        }),
        Statement::ExportFromDeclaration(export) => export.specifiers.iter().any(|it| named(&it.local) || named(&it.exported)),
        Statement::ExportNamedDeclaration(export) => export.specifiers.iter().any(|it| named(&it.exported)),
        Statement::ExportAllDeclaration(export) => export.exported.as_ref().is_some_and(named),
        _ => false,
    }
}

fn text(value: Option<&str>) -> Result<String, String> {
    value.map(String::from).ok_or_else(|| "a module name the engine cannot carry".to_string())
}

fn required_module(equals: &TSImportEqualsDeclaration) -> Result<Option<String>, String> {
    let TSModuleReference::ExternalModuleReference(reference) = &equals.module_reference else { return Ok(None) };
    let module = text(reference.expression.value.as_str())?;
    Ok((!module.is_empty()).then_some(module))
}

/// The compiler's reading: `import type`, or named bindings in braces that are all `type`, which includes empty
/// braces and leaves a default or namespace binding beside them out of the question.
fn is_type_only_import(import: &ImportDeclaration, parsed: &ParsedFile) -> bool {
    if import.import_kind.is_type() {
        return true;
    }
    let Some(specifiers) = &import.specifiers else { return false };
    let mut named = specifiers.iter().filter_map(|specifier| match specifier {
        ImportDeclarationSpecifier::ImportSpecifier(named) => Some(named.import_kind),
        _ => None,
    });
    if specifiers.iter().any(|specifier| matches!(specifier, ImportDeclarationSpecifier::ImportNamespaceSpecifier(_))) {
        return false;
    }
    let first = named.next();
    match first {
        Some(kind) => kind == ImportOrExportKind::Type && named.all(|kind| kind == ImportOrExportKind::Type),
        None => has_braces(import, parsed),
    }
}

fn has_braces(import: &ImportDeclaration, parsed: &ParsedFile) -> bool {
    parsed.slice(import.span.start, import.source.span.start).contains('{')
}

/// `require()`, `import()` and `import()` types with their position, to be put in the order of the tree walk.
struct Nested {
    found: Vec<(u32, u32, Found)>,
    failed: bool,
}

impl Nested {
    fn push(&mut self, node: &impl GetSpan, module: Option<Option<&str>>, kind: &'static str) {
        let Some(module) = module else { return };
        match module {
            Some(module) => self.found.push((node.span().start, node.span().end, (module.to_string(), kind))),
            None => self.failed = true,
        }
    }
}

/// The text of a string literal or of a template literal without substitutions; `Some(None)` for a value the
/// engine cannot carry.
pub(super) fn literal_text<'a>(expression: Option<&'a Expression<'a>>) -> Option<Option<&'a str>> {
    match expression? {
        Expression::StringLiteral(literal) => Some(literal.value.as_str()),
        Expression::TemplateLiteral(template) => template_text(template),
        _ => None,
    }
}

fn template_text<'a>(template: &'a TemplateLiteral<'a>) -> Option<Option<&'a str>> {
    match (template.quasis.as_slice(), template.expressions.as_slice()) {
        ([only], []) => Some(only.value.cooked.map(|cooked| cooked.as_str()).unwrap_or(Some(""))),
        _ => None,
    }
}

pub(super) fn first_argument<'a>(call: &'a CallExpression<'a>) -> Option<&'a Expression<'a>> {
    call.arguments.first().and_then(Argument::as_expression)
}

impl<'a> Visit<'a> for Nested {
    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if matches!(&it.callee, Expression::Identifier(callee) if callee.name == "require") {
            self.push(it, literal_text(first_argument(it)), "require");
        }
        walk::walk_call_expression(self, it);
    }

    fn visit_import_expression(&mut self, it: &ImportExpression<'a>) {
        self.push(it, literal_text(Some(&it.source)), "dynamic-import");
        walk::walk_import_expression(self, it);
    }

    fn visit_ts_import_type(&mut self, it: &TSImportType<'a>) {
        self.push(it, Some(it.source.value.as_str()), "type-import");
        walk::walk_ts_import_type(self, it);
    }
}
