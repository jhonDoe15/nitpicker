//! The constants, exported names and re-exports a parsed module holds: `readModule` on the oxc tree.
use super::module::{DEFAULT_EXPORT, Module, Reexport, Value, is_constant_name, is_constant_path, renamed_head};
use oxc_ast::ast::{
    BindingPattern, Class, ClassElement, Declaration, ExportDefaultDeclarationKind, Expression, Function,
    ModuleExportName, Program, PropertyKey, Statement, TSAccessibility, UnaryOperator, VariableDeclaration,
    VariableDeclarationKind,
};
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Default)]
struct Ordered {
    items: Vec<(String, Value)>,
    index: HashMap<String, usize>,
}

impl Ordered {
    /// A `Map`: a later value for a name replaces the earlier, which keeps its place.
    fn put(&mut self, name: String, value: Value) {
        match self.index.get(&name) {
            Some(at) => self.items[*at].1 = value,
            None => {
                self.index.insert(name.clone(), self.items.len());
                self.items.push((name, value));
            }
        }
    }
}

fn unwrapped<'a, 'b>(mut node: &'b Expression<'a>) -> &'b Expression<'a> {
    loop {
        node = match node {
            Expression::TSAsExpression(wrapper) => &wrapper.expression,
            Expression::TSSatisfiesExpression(wrapper) => &wrapper.expression,
            Expression::ParenthesizedExpression(wrapper) => &wrapper.expression,
            Expression::TSTypeAssertion(wrapper) => &wrapper.expression,
            other => return other,
        }
    }
}

fn number_of(node: &Expression) -> Option<f64> {
    match node {
        Expression::NumericLiteral(number) => Some(number.value),
        _ => None,
    }
}

/// `literalValue`: a text, a number or a negated number, seen through type wrappers.
fn literal_value(initializer: Option<&Expression>) -> Option<Value> {
    match unwrapped(initializer?) {
        Expression::StringLiteral(text) => text.value.as_str().map(|value| Value::Text(value.to_string())),
        Expression::TemplateLiteral(template) if template.expressions.is_empty() && template.quasis.len() == 1 => {
            let cooked = template.quasis[0].value.cooked.and_then(|cooked| cooked.as_str());
            cooked.map(|value| Value::Text(value.to_string()))
        }
        Expression::UnaryExpression(unary) if unary.operator == UnaryOperator::UnaryNegation => {
            number_of(unwrapped(&unary.argument)).map(|value| Value::Number(-value))
        }
        other => number_of(other).map(Value::Number),
    }
}

fn class_constants(class: &Class, javascript: bool, found: &mut Vec<(String, Value)>) {
    let Some(owner) = class.id.as_ref() else { return };
    for member in &class.body.body {
        let (key, value, readonly, accessibility) = match member {
            ClassElement::PropertyDefinition(property) if property.r#static => {
                (&property.key, &property.value, property.readonly, property.accessibility)
            }
            ClassElement::AccessorProperty(property) if property.r#static => {
                (&property.key, &property.value, false, property.accessibility)
            }
            _ => continue,
        };
        let PropertyKey::StaticIdentifier(name) = key else { continue };
        let hidden = matches!(accessibility, Some(TSAccessibility::Private | TSAccessibility::Protected));
        let allowed = javascript || readonly;
        if allowed && !hidden && is_constant_name(name.name.as_str()) {
            if let Some(value) = literal_value(value.as_ref()) {
                found.push((format!("{}.{}", owner.name, name.name), value));
            }
        }
    }
}

fn variable_constants(declaration: &VariableDeclaration, found: &mut Vec<(String, Value)>) {
    if !matches!(declaration.kind, VariableDeclarationKind::Const | VariableDeclarationKind::AwaitUsing) {
        return;
    }
    for declarator in &declaration.declarations {
        let value = literal_value(declarator.init.as_ref());
        if let (BindingPattern::BindingIdentifier(name), Some(value)) = (&declarator.id, value) {
            found.push((name.name.to_string(), value));
        }
    }
}

/// What one statement declares: a variable list, a function, a class or an enum, and whether it is exported.
enum Declared<'p, 'a> {
    Variables(&'p VariableDeclaration<'a>),
    Function(&'p Function<'a>, bool),
    Class(&'p Class<'a>, bool),
    Enum(String),
    Nothing,
}

fn declared<'p, 'a>(declaration: &'p Declaration<'a>) -> Declared<'p, 'a> {
    match declaration {
        Declaration::VariableDeclaration(variables) => Declared::Variables(variables),
        Declaration::FunctionDeclaration(function) => Declared::Function(function, false),
        Declaration::ClassDeclaration(class) => Declared::Class(class, false),
        Declaration::TSEnumDeclaration(found) => Declared::Enum(found.id.name.to_string()),
        _ => Declared::Nothing,
    }
}

fn export_name(name: &ModuleExportName) -> String {
    match name {
        ModuleExportName::IdentifierName(identifier) => identifier.name.to_string(),
        ModuleExportName::IdentifierReference(identifier) => identifier.name.to_string(),
        ModuleExportName::StringLiteral(text) => text.value.as_str().unwrap_or_default().to_string(),
    }
}

pub fn read(program: &Program, javascript: bool) -> Module {
    let mut module = Module::default();
    let mut locals = Ordered::default();
    let mut exported_constants: Vec<(String, Value)> = Vec::new();
    let mut listed: Vec<(String, String)> = Vec::new();
    for statement in &program.body {
        let (found, exported) = match statement {
            Statement::VariableDeclaration(variables) => (Declared::Variables(variables), false),
            Statement::FunctionDeclaration(function) => (Declared::Function(function, false), false),
            Statement::ClassDeclaration(class) => (Declared::Class(class, false), false),
            Statement::TSEnumDeclaration(found) => (Declared::Enum(found.id.name.to_string()), false),
            Statement::ExportDeclaration(export) => (declared(&export.declaration), true),
            Statement::ExportDefaultDeclaration(export) => match &export.declaration {
                ExportDefaultDeclarationKind::FunctionDeclaration(function) => {
                    (Declared::Function(function, true), true)
                }
                ExportDefaultDeclarationKind::ClassDeclaration(class) => (Declared::Class(class, true), true),
                ExportDefaultDeclarationKind::TSInterfaceDeclaration(_) => (Declared::Nothing, true),
                _ => {
                    module.defined.insert(DEFAULT_EXPORT.to_string());
                    continue;
                }
            },
            Statement::TSExportAssignment(_) => {
                module.defined.insert(DEFAULT_EXPORT.to_string());
                continue;
            }
            Statement::ExportNamedDeclaration(export) if export.export_kind.is_value() => {
                let names = export.specifiers.iter().filter(|specifier| specifier.export_kind.is_value());
                let names = names.map(|name| (export_name(&name.exported), export_name(&name.local)));
                let names: Vec<(String, String)> = names.collect();
                module.defined.extend(names.iter().map(|(exported, _)| exported.clone()));
                listed.extend(names);
                continue;
            }
            Statement::ExportFromDeclaration(export) if export.export_kind.is_value() => {
                let names = export.specifiers.iter().filter(|specifier| specifier.export_kind.is_value());
                let names = names.map(|name| (export_name(&name.exported), export_name(&name.local))).collect();
                let specifier = export.source.value.as_str().unwrap_or_default().to_string();
                module.reexports.push(Reexport { specifier, names: Some(names), target: OnceLock::new() });
                continue;
            }
            Statement::ExportAllDeclaration(export) if export.export_kind.is_value() && export.exported.is_none() => {
                let specifier = export.source.value.as_str().unwrap_or_default().to_string();
                module.reexports.push(Reexport { specifier, names: None, target: OnceLock::new() });
                continue;
            }
            _ => continue,
        };
        let mut own: Vec<(String, Value)> = Vec::new();
        match &found {
            Declared::Variables(variables) => variable_constants(variables, &mut own),
            Declared::Class(class, _) => class_constants(class, javascript, &mut own),
            _ => {}
        }
        if exported {
            module.defined.extend(match found {
                Declared::Variables(variables) => variables
                    .declarations
                    .iter()
                    .filter_map(|declarator| match &declarator.id {
                        BindingPattern::BindingIdentifier(name) => Some(name.name.to_string()),
                        _ => None,
                    })
                    .collect(),
                Declared::Function(function, default) => {
                    named(function.id.as_ref().map(|id| id.name.to_string()), default)
                }
                Declared::Class(class, default) => named(class.id.as_ref().map(|id| id.name.to_string()), default),
                Declared::Enum(name) => vec![name],
                Declared::Nothing => Vec::new(),
            });
            exported_constants.extend(own.iter().filter(|(name, _)| is_constant_path(name)).cloned());
        }
        for (name, value) in own {
            locals.put(name, value);
        }
    }
    module.constants = constants(exported_constants, &locals, &listed);
    module
}

fn named(name: Option<String>, default: bool) -> Vec<String> {
    if default { vec![DEFAULT_EXPORT.to_string()] } else { name.into_iter().collect() }
}

/// The exported declarations first, then the constants an export list names; a later value replaces an earlier one.
fn constants(declared: Vec<(String, Value)>, locals: &Ordered, listed: &[(String, String)]) -> Vec<(String, Value)> {
    let mut found = Ordered::default();
    for (name, value) in declared {
        found.put(name, value);
    }
    for (name, value) in &locals.items {
        for (exported, local) in listed {
            let shown = if exported == DEFAULT_EXPORT && name.contains('.') { local } else { exported };
            let renamed = renamed_head(name, |head| (head == local).then(|| shown.clone()));
            if let Some(renamed) = renamed.filter(|renamed| is_constant_path(renamed)) {
                found.put(renamed, value.clone());
            }
        }
    }
    found.items
}

