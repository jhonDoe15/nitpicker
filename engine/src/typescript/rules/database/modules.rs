//! `orm-modules.mts`: the ORM a file imports, the local names it binds to ORM exports, and the callee and
//! receiver shapes the ORM option rules read.
use crate::typescript::rules::security_values::{defs, member_name, static_key, string_value, unwrapped};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, View};
use crate::typescript::rules::writes::imports::loaded_module;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Family {
    TypeOrm,
    Sequelize,
    MikroOrm,
    Drizzle,
}

const FAMILIES: [Family; 4] = [Family::TypeOrm, Family::Sequelize, Family::MikroOrm, Family::Drizzle];
const SEQUELIZE_MODULES: [&str; 4] = ["sequelize", "sequelize-typescript", "@sequelize/core", "@nestjs/sequelize"];
const FORM_LENGTH: usize = 40;

fn matches(family: Family, source: &str) -> bool {
    match family {
        Family::TypeOrm => source == "typeorm" || source == "@nestjs/typeorm",
        Family::Sequelize => SEQUELIZE_MODULES.contains(&source),
        Family::MikroOrm => source.starts_with("@mikro-orm/"),
        Family::Drizzle => source == "drizzle-orm" || source.starts_with("drizzle-orm/"),
    }
}

/// `ormFamilyOf`.
pub fn orm_family_of(source: &str) -> Option<Family> {
    FAMILIES.into_iter().find(|family| matches(*family, source))
}

pub struct OrmBinding {
    pub source: String,
    pub imported: Option<String>,
}

/// `moduleScope`: the file's text, tree and scopes, its top-level bindings by local name, and the ORMs it loads.
pub struct ModuleScope<'c, 'a, 's> {
    pub scopes: &'c Scopes<'a, 's>,
    pub text: &'a str,
    bindings: Vec<(String, OrmBinding)>,
    pub families: Vec<Family>,
}

fn imported_name(specifier: Node) -> Option<String> {
    if !specifier.is("ImportSpecifier") {
        return Some("*".to_string());
    }
    let imported = specifier.node("imported")?;
    if imported.is("Identifier") { imported.name().map(|name| name.into_owned()) } else { imported.text("value").map(|value| value.into_owned()) }
}

fn pattern_bindings(pattern: Node, source: &str) -> Vec<(String, OrmBinding)> {
    if pattern.is("Identifier") {
        return pattern.name().map(|name| (name.into_owned(), OrmBinding { source: source.to_string(), imported: Some("*".to_string()) })).into_iter().collect();
    }
    let properties = if pattern.is("ObjectPattern") { pattern.nodes("properties") } else { Vec::new() };
    properties
        .into_iter()
        .filter(|property| property.is("Property"))
        .filter_map(|property| {
            let value = property.node("value").filter(|value| value.is("Identifier"))?;
            Some((value.name()?.into_owned(), OrmBinding { source: source.to_string(), imported: static_key(property) }))
        })
        .collect()
}

fn statement_bindings(statement: Node) -> Vec<(String, OrmBinding)> {
    if statement.is("ImportDeclaration") {
        let source = statement.node("source").and_then(|source| source.text("value")).map(|value| value.into_owned()).unwrap_or_default();
        return statement
            .nodes("specifiers")
            .into_iter()
            .filter_map(|specifier| {
                let local = specifier.node("local")?.name()?.into_owned();
                Some((local, OrmBinding { source: source.clone(), imported: imported_name(specifier) }))
            })
            .collect();
    }
    if statement.is("TSImportEqualsDeclaration") {
        let reference = statement.node("moduleReference").filter(|reference| reference.is("TSExternalModuleReference"));
        let source = reference.and_then(|reference| string_value(reference.node("expression")));
        let local = statement.node("id").and_then(|id| id.name()).map(|name| name.into_owned());
        return match (source, local) {
            (Some(source), Some(local)) => vec![(local, OrmBinding { source, imported: Some("*".to_string()) })],
            _ => Vec::new(),
        };
    }
    let declarators = if statement.is("VariableDeclaration") { statement.nodes("declarations") } else { Vec::new() };
    declarators
        .into_iter()
        .flat_map(|declarator| match (loaded_module(declarator.node("init")), declarator.node("id")) {
            (Some(source), Some(id)) => pattern_bindings(id, &source),
            _ => Vec::new(),
        })
        .collect()
}

fn statements_of(program: Node) -> Vec<Node> {
    program
        .nodes("body")
        .into_iter()
        .map(|statement| if statement.is("ExportNamedDeclaration") { statement.node("declaration").unwrap_or(statement) } else { statement })
        .collect()
}

impl<'c, 'a, 's> ModuleScope<'c, 'a, 's> {
    pub fn of(view: &'s View, scopes: &'c Scopes<'a, 's>, text: &'a str) -> ModuleScope<'c, 'a, 's> {
        let mut bindings: Vec<(String, OrmBinding)> = Vec::new();
        for (local, binding) in statements_of(view.program()).into_iter().flat_map(statement_bindings) {
            match bindings.iter_mut().find(|(known, _)| *known == local) {
                Some(entry) => entry.1 = binding,
                None => bindings.push((local, binding)),
            }
        }
        let families = FAMILIES.into_iter().filter(|family| bindings.iter().any(|(_, binding)| matches(*family, &binding.source))).collect();
        ModuleScope { scopes, text, bindings, families }
    }

    pub fn has(&self, family: Family) -> bool {
        self.families.contains(&family)
    }

    /// The module each top-level binding comes from.
    pub fn sources(&self) -> impl Iterator<Item = &str> {
        self.bindings.iter().map(|(_, binding)| binding.source.as_str())
    }

    pub fn binding(&self, name: &str) -> Option<&OrmBinding> {
        self.bindings.iter().find(|(local, _)| local == name).map(|(_, binding)| binding)
    }

    /// `ormLocals(scope, name)` with the name itself added.
    pub fn orm_locals(&self, name: &str) -> Vec<String> {
        let mut locals: Vec<String> = self
            .bindings
            .iter()
            .filter(|(_, binding)| orm_family_of(&binding.source).is_some() && binding.imported.as_deref() == Some(name))
            .map(|(local, _)| local.clone())
            .collect();
        locals.push(name.to_string());
        locals
    }

    /// `sourceCode.getText(node)`.
    pub fn source(&self, node: Node) -> &'a str {
        &self.text[node.start() as usize..node.end() as usize]
    }

    /// `shortText`: the node's text when it fits on one line in forty characters.
    pub fn short_text(&self, node: Node) -> Option<&'a str> {
        let text = self.source(node);
        (text.encode_utf16().count() <= FORM_LENGTH && !text.contains('\n')).then_some(text)
    }

    /// `isForeignReceiver`: the receiver chain starts at an import of a module that is no ORM.
    pub fn is_foreign_receiver(&self, receiver: Node) -> bool {
        let binding = root_name(receiver).and_then(|name| self.binding(&name));
        binding.is_some_and(|binding| !binding.source.starts_with('.') && orm_family_of(&binding.source).is_none())
    }

    /// `initializerOf`: what the variable a receiver names is first declared with, through `await`.
    pub fn initializer_of(&self, receiver: Node<'s>) -> Option<Node<'s>> {
        let target = unwrapped(receiver);
        if !target.is("Identifier") {
            return None;
        }
        let definition = defs(self.scopes, target).into_iter().next().filter(|definition| definition.kind == DefKind::Variable)?;
        let init = unwrapped(definition.node.node("init")?);
        if init.is("AwaitExpression") { init.node("argument").map(unwrapped) } else { Some(init) }
    }
}

/// `rootName`: the identifier a chain of members and calls starts from.
pub fn root_name(node: Node) -> Option<String> {
    let mut current = unwrapped(node);
    loop {
        let next = match current.kind() {
            "MemberExpression" => current.node("object"),
            "CallExpression" => current.node("callee"),
            _ => None,
        };
        match next {
            Some(next) => current = unwrapped(next),
            None => break,
        }
    }
    if current.is("Identifier") { current.name().map(|name| name.into_owned()) } else { None }
}

/// `calleeLabel`: `name` or `owner.name` of what a call or construction calls.
pub fn callee_label(call: Node) -> Option<String> {
    let callee = unwrapped(call.node("callee")?);
    if callee.is("Identifier") {
        return callee.name().map(|name| name.into_owned());
    }
    if !callee.is("MemberExpression") {
        return None;
    }
    let owner = callee.node("object").map(unwrapped);
    let name = member_name(callee)?;
    match owner.filter(|owner| owner.is("Identifier")).and_then(|owner| owner.name()) {
        Some(owner) => Some(format!("{owner}.{name}")),
        None => Some(name),
    }
}

/// `constructedName`: the last part of the callee label.
pub fn constructed_name(call: Node) -> Option<String> {
    callee_label(call).map(|label| label.rsplit('.').next().unwrap_or_default().to_string())
}
