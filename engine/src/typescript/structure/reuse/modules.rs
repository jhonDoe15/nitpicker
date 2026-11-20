//! Imports, exports, dynamic loads and JSX tags of one file.
use super::references::by_code_unit;
use crate::typescript::ParsedFile;
use crate::typescript::tree::Tree;
use oxc_ast::AstKind;
use oxc_ast::ast::{
    Argument, Declaration, ExportDefaultDeclarationKind, Expression, ImportDeclarationSpecifier, ImportOrExportKind, ModuleExportName, Statement,
};
use oxc_span::GetSpan;
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct NamedImport {
    pub imported: String,
    pub local: String,
    #[serde(rename = "typeOnly")]
    pub type_only: bool,
}

#[derive(Serialize, Debug, Clone)]
pub struct Import {
    pub specifier: String,
    #[serde(rename = "defaultName", skip_serializing_if = "Option::is_none")]
    pub default_name: Option<String>,
    #[serde(rename = "namespaceName", skip_serializing_if = "Option::is_none")]
    pub namespace_name: Option<String>,
    #[serde(rename = "typeOnly")]
    pub type_only: bool,
    pub named: Vec<NamedImport>,
}

#[derive(Serialize, Debug, Clone)]
pub struct LocalExport {
    pub local: String,
    pub exported: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct NamespaceExport {
    pub specifier: String,
    pub name: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct NamedExport {
    pub imported: String,
    pub exported: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct Reexport {
    pub specifier: String,
    pub star: bool,
    pub names: Vec<NamedExport>,
}

#[derive(Serialize, Debug, Default, Clone)]
pub struct Exports {
    pub aliases: Vec<LocalExport>,
    pub locals: Vec<LocalExport>,
    pub namespaces: Vec<NamespaceExport>,
    pub reexports: Vec<Reexport>,
}

fn export_name(name: &ModuleExportName) -> String {
    match name {
        ModuleExportName::IdentifierName(name) => name.name.to_string(),
        ModuleExportName::IdentifierReference(name) => name.name.to_string(),
        ModuleExportName::StringLiteral(name) => name.value.display().to_string(),
    }
}

pub fn imports(file: &ParsedFile) -> Vec<Import> {
    let mut found = Vec::new();
    for statement in &file.program.body {
        let Statement::ImportDeclaration(declaration) = statement else { continue };
        let Some(specifiers) = &declaration.specifiers else { continue };
        let type_only = declaration.import_kind == ImportOrExportKind::Type;
        let mut import =
            Import { specifier: declaration.source.value.display().to_string(), default_name: None, namespace_name: None, type_only, named: Vec::new() };
        for specifier in specifiers {
            match specifier {
                ImportDeclarationSpecifier::ImportDefaultSpecifier(default) => import.default_name = Some(default.local.name.to_string()),
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(namespace) => import.namespace_name = Some(namespace.local.name.to_string()),
                ImportDeclarationSpecifier::ImportSpecifier(named) => import.named.push(NamedImport {
                    imported: export_name(&named.imported),
                    local: named.local.name.to_string(),
                    type_only: type_only || named.import_kind == ImportOrExportKind::Type,
                }),
            }
        }
        found.push(import);
    }
    found
}

fn string_like(expression: &Expression) -> Option<String> {
    match expression {
        Expression::StringLiteral(literal) => Some(literal.value.display().to_string()),
        Expression::TemplateLiteral(template) if template.expressions.is_empty() => {
            Some(template.quasis.first().and_then(|quasi| quasi.value.cooked).map(|text| text.display().to_string()).unwrap_or_default())
        }
        _ => None,
    }
}

pub fn dynamic_imports(tree: &Tree) -> Vec<String> {
    let mut found: Vec<String> = tree
        .nodes
        .iter()
        .filter_map(|node| match node.kind {
            AstKind::ImportExpression(import) => string_like(&import.source),
            AstKind::CallExpression(call) => match (&call.callee, call.arguments.first()) {
                (Expression::Identifier(callee), Some(first)) if callee.name == "require" => match first {
                    Argument::SpreadElement(_) => None,
                    argument => string_like(argument.to_expression()),
                },
                _ => None,
            },
            _ => None,
        })
        .collect();
    found.sort_by(|left, right| by_code_unit(left, right));
    found
}

fn alias_exports(declaration: &Declaration, exports: &mut Exports) {
    let Declaration::VariableDeclaration(variable) = declaration else { return };
    for declarator in &variable.declarations {
        if let (oxc_ast::ast::BindingPattern::BindingIdentifier(name), Some(Expression::Identifier(read))) = (&declarator.id, &declarator.init) {
            exports.aliases.push(LocalExport { local: read.name.to_string(), exported: name.name.to_string() });
        }
    }
}

pub fn exports(file: &ParsedFile) -> Exports {
    let mut exports = Exports::default();
    let mut defaults = Vec::new();
    for statement in &file.program.body {
        match statement {
            Statement::ExportDeclaration(export) => alias_exports(&export.declaration, &mut exports),
            Statement::ExportNamedDeclaration(export) => exports.locals.extend(
                export.specifiers.iter().map(|specifier| LocalExport { local: export_name(&specifier.local), exported: export_name(&specifier.exported) }),
            ),
            Statement::ExportFromDeclaration(export) => exports.reexports.push(Reexport {
                specifier: export.source.value.display().to_string(),
                star: false,
                names: export
                    .specifiers
                    .iter()
                    .map(|specifier| NamedExport { imported: export_name(&specifier.local), exported: export_name(&specifier.exported) })
                    .collect(),
            }),
            Statement::ExportAllDeclaration(export) => {
                let specifier = export.source.value.display().to_string();
                match &export.exported {
                    Some(name) => exports.namespaces.push(NamespaceExport { specifier, name: export_name(name) }),
                    None => exports.reexports.push(Reexport { specifier, star: true, names: Vec::new() }),
                }
            }
            Statement::ExportDefaultDeclaration(export) => {
                if let ExportDefaultDeclarationKind::Identifier(read) = &export.declaration {
                    defaults.push(LocalExport { local: read.name.to_string(), exported: "default".to_string() });
                }
            }
            Statement::TSExportAssignment(export) => {
                if let Expression::Identifier(read) = &export.expression {
                    defaults.push(LocalExport { local: read.name.to_string(), exported: "default".to_string() });
                }
            }
            _ => {}
        }
    }
    exports.locals.extend(defaults);
    exports
}

pub fn jsx_tags(file: &ParsedFile, tree: &Tree) -> Vec<String> {
    let mut tags: Vec<String> = tree
        .nodes
        .iter()
        .filter_map(|node| match node.kind {
            AstKind::JSXOpeningElement(element) => {
                let span = element.name.span();
                Some(file.slice(span.start, span.end).to_string())
            }
            _ => None,
        })
        .collect();
    tags.sort_by(|left, right| by_code_unit(left, right));
    tags.dedup();
    tags
}
