//! `imported-names.mts` of the ESLint plugin: the names a file binds to a set of modules, by import, `require`,
//! `import x = require()` or `await import()`, and the module function a callee calls through those names, aliases
//! and `bind` included.
use crate::typescript::rules::handlers::walk::first_def;
use crate::typescript::rules::security_values::{member_name, resolve_constant, static_key, unwrapped};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_assertions::unowned_async::nodes::module_bindings;
use crate::typescript::rules::urls::values::string_value;
use std::collections::{HashMap, HashSet};

const DEPTHS: usize = 8;
const DEFAULT: &str = "default";

/// `ModuleBindings`: local names bound to functions of the modules, local names bound to the modules themselves, and
/// the modules.
pub struct Bindings {
    pub named: HashMap<String, String>,
    pub namespaces: HashSet<String>,
    pub modules: &'static [&'static str],
}

fn includes(modules: &[&str], name: Option<String>) -> bool {
    name.is_some_and(|name| modules.contains(&name.as_str()))
}

fn loaded_module_call(node: Option<Node>) -> Option<String> {
    let target = unwrapped(node?);
    if target.is("ImportExpression") {
        return string_value(target.node("source"));
    }
    let callee = target.node("callee").filter(|callee| target.is("CallExpression") && callee.is("Identifier"))?;
    (callee.name().as_deref() == Some("require")).then(|| string_value(target.list("arguments").first().copied().flatten())).flatten()
}

fn module_step(node: Node) -> Option<Node> {
    let target = unwrapped(node);
    if target.is("AwaitExpression") {
        return target.node("argument");
    }
    (target.is("MemberExpression") && member_name(target).as_deref() == Some(DEFAULT)).then(|| target.node("object")).flatten()
}

/// `loadedModule`: the module a `require`, `import()` or `await import()` expression loads, `.default` read or not.
pub fn loaded_module(node: Option<Node>) -> Option<String> {
    let mut current = node?;
    while let Some(next) = module_step(current) {
        current = next;
    }
    loaded_module_call(Some(current))
}

fn import_equals_module(statement: Node) -> Option<String> {
    let reference = statement.node("moduleReference").filter(|reference| reference.is("TSExternalModuleReference"))?;
    statement.is("TSImportEqualsDeclaration").then(|| string_value(reference.node("expression"))).flatten()
}

fn add_declarator(declarator: Node, bindings: &mut Bindings) {
    if !includes(bindings.modules, loaded_module(declarator.node("init"))) {
        return;
    }
    let Some(id) = declarator.node("id") else { return };
    if id.is("Identifier") {
        bindings.namespaces.extend(id.name().map(|name| name.into_owned()));
    }
    if !id.is("ObjectPattern") {
        return;
    }
    for property in id.nodes("properties") {
        let value = property.node("value").filter(|value| property.is("Property") && value.is("Identifier"));
        if let (Some(key), Some(local)) = (static_key(property), value.and_then(|value| value.name())) {
            bindings.named.insert(local.into_owned(), key);
        }
    }
}

/// `bindingsOf`.
pub fn bindings_of(program: Node, modules: &'static [&'static str]) -> Bindings {
    let base = module_bindings(program, modules);
    let mut bindings = Bindings { named: HashMap::new(), namespaces: base.namespaces, modules };
    for (local, imported) in base.named {
        if imported == DEFAULT {
            bindings.namespaces.insert(local);
        } else {
            bindings.named.insert(local, imported);
        }
    }
    for statement in program.nodes("body") {
        if includes(modules, import_equals_module(statement)) {
            bindings.namespaces.extend(statement.node("id").and_then(|id| id.name()).map(|name| name.into_owned()));
        }
        if statement.is("VariableDeclaration") {
            for declarator in statement.nodes("declarations") {
                add_declarator(declarator, &mut bindings);
            }
        }
    }
    bindings
}

fn is_bind_call(node: Node) -> Option<Node> {
    let callee = node.node("callee").filter(|callee| node.is("CallExpression") && callee.is("MemberExpression"))?;
    (member_name(callee).as_deref() == Some("bind")).then_some(callee)
}

fn unaliased<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Node<'s> {
    resolve_constant(scopes, Some(unwrapped(node))).map_or(node, unwrapped)
}

fn alias_target<'s>(scopes: &Scopes<'_, 's>, callee: Node<'s>) -> Node<'s> {
    let mut current = unaliased(scopes, callee);
    for _ in 0..DEPTHS {
        if let Some(object) = is_bind_call(current).and_then(|callee| callee.node("object")) {
            current = unaliased(scopes, object);
        }
    }
    current
}

/// `isModuleValue`: a name bound to one of the modules, or an expression that loads one.
pub fn is_module_value<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>, bindings: &Bindings) -> bool {
    let target = node.map(|node| unaliased(scopes, node));
    if let Some(target) = target.filter(|target| target.is("Identifier")) {
        return target.name().is_some_and(|name| bindings.namespaces.contains(name.as_ref()));
    }
    includes(bindings.modules, loaded_module(target))
}

fn imported_callee_name(callee: Node, bindings: &Bindings) -> Option<String> {
    if callee.is("Identifier") {
        return bindings.named.get(callee.name()?.as_ref()).cloned();
    }
    let object = callee.node("object").filter(|object| object.is("Identifier"))?;
    let property = callee.node("property").filter(|property| property.is("Identifier"))?;
    let namespaced = callee.is("MemberExpression") && !callee.flag("computed") && bindings.namespaces.contains(object.name()?.as_ref());
    if namespaced { property.name().map(|name| name.into_owned()) } else { None }
}

fn destructured_name<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>, bindings: &Bindings) -> Option<String> {
    let name = node.name().filter(|_| node.is("Identifier"))?;
    let definition = first_def(scopes, node).filter(|definition| definition.kind == DefKind::Variable)?;
    let pattern = definition.node.node("id").filter(|pattern| pattern.is("ObjectPattern"))?;
    if !is_module_value(scopes, definition.node.node("init"), bindings) {
        return None;
    }
    let named = |value: Option<Node>| value.and_then(|value| value.name()).is_some_and(|found| found == name);
    let property = pattern.nodes("properties").into_iter().find(|entry| {
        let value = entry.node("value");
        entry.is("Property")
            && (named(value) || value.is_some_and(|value| value.is("AssignmentPattern") && named(value.node("left"))))
    })?;
    static_key(property)
}

fn module_member_name<'s>(scopes: &Scopes<'_, 's>, target: Node<'s>, bindings: &Bindings) -> Option<String> {
    let member = target.is("MemberExpression") && !target.flag("computed");
    (member && is_module_value(scopes, target.node("object"), bindings)).then(|| member_name(target)).flatten()
}

/// `importedFunction`: the function of the modules a callee calls.
pub fn imported_function<'s>(scopes: &Scopes<'_, 's>, callee: Node<'s>, bindings: &Bindings) -> Option<String> {
    let target = unwrapped(alias_target(scopes, callee));
    imported_callee_name(target, bindings)
        .or_else(|| destructured_name(scopes, target, bindings))
        .or_else(|| module_member_name(scopes, target, bindings))
}
