//! `bindingsOf` and `importedFunction` of `imported-names.mts`: which local names stand for a module or its members.
use super::resolve::{member_name, name_of, resolve_constant, static_key, string_value, unwrapped};
use super::Env;
use crate::typescript::rules::support::scope::DefKind;
use crate::typescript::rules::support::view::Node;
use std::collections::{HashMap, HashSet};

const DEPTHS: usize = 8;

pub struct Bindings {
    named: HashMap<String, String>,
    namespaces: HashSet<String>,
    modules: &'static [&'static str],
}

fn included(modules: &[&str], name: Option<String>) -> bool {
    name.is_some_and(|name| modules.contains(&name.as_str()))
}

fn loaded_module_call(node: Option<Node>) -> Option<String> {
    let target = unwrapped(node?);
    if target.is("ImportExpression") {
        return string_value(target.node("source"));
    }
    let callee = target.node("callee");
    let is_require = target.is("CallExpression") && callee.is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("require"));
    if is_require { string_value(target.nodes("arguments").first().copied()) } else { None }
}

fn module_step(node: Node) -> Option<Node> {
    let target = unwrapped(node);
    if target.is("AwaitExpression") {
        return target.node("argument");
    }
    if target.is("MemberExpression") && member_name(target).as_deref() == Some("default") {
        return target.node("object");
    }
    None
}

/// `loadedModule`: the module a `require(...)` or `import(...)` expression loads, also through `await` and `.default`.
pub fn loaded_module(node: Option<Node>) -> Option<String> {
    let mut last = node?;
    while let Some(next) = module_step(last) {
        last = next;
    }
    loaded_module_call(Some(last))
}

fn import_equals_module(statement: Node) -> Option<String> {
    let reference = statement.node("moduleReference").filter(|reference| reference.is("TSExternalModuleReference"))?;
    if statement.is("TSImportEqualsDeclaration") { string_value(reference.node("expression")) } else { None }
}

fn is_require_of(init: Option<Node>, modules: &[&str]) -> bool {
    let Some(init) = init.filter(|init| init.is("CallExpression")) else { return false };
    let callee = init.node("callee");
    let required = callee.is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("require"));
    required && included(modules, string_value(init.nodes("arguments").first().copied()))
}

fn base_bindings(program: Node, modules: &[&str]) -> (HashMap<String, String>, HashSet<String>) {
    let mut named = HashMap::new();
    let mut namespaces = HashSet::new();
    for statement in program.nodes("body") {
        if statement.is("ImportDeclaration") && included(modules, string_value(statement.node("source"))) {
            if statement.text("importKind").as_deref() == Some("type") {
                continue;
            }
            for specifier in statement.nodes("specifiers") {
                let local = name_of(specifier.node("local")).unwrap_or_default();
                if specifier.is("ImportSpecifier") {
                    let imported = specifier.node("imported");
                    let imported = imported.and_then(|node| if node.is("Identifier") { name_of(Some(node)) } else { string_value(Some(node)) });
                    named.insert(local, imported.unwrap_or_default());
                } else {
                    namespaces.insert(local);
                }
            }
        }
        if !statement.is("VariableDeclaration") {
            continue;
        }
        for declarator in statement.nodes("declarations") {
            if !is_require_of(declarator.node("init"), modules) {
                continue;
            }
            let Some(pattern) = declarator.node("id") else { continue };
            if pattern.is("Identifier") {
                namespaces.insert(name_of(Some(pattern)).unwrap_or_default());
            }
            if pattern.is("ObjectPattern") {
                for property in pattern.nodes("properties") {
                    let key = property.node("key").filter(|key| property.is("Property") && key.is("Identifier"));
                    let value = property.node("value").filter(|value| value.is("Identifier"));
                    if let (Some(key), Some(value)) = (key, value) {
                        named.insert(name_of(Some(value)).unwrap_or_default(), name_of(Some(key)).unwrap_or_default());
                    }
                }
            }
        }
    }
    (named, namespaces)
}

pub fn bindings_of(program: Node, modules: &'static [&'static str]) -> Bindings {
    let (named, namespaces) = module_names(program, modules);
    Bindings { named, namespaces, modules }
}

/// The `named` and `namespaces` maps of `bindingsOf` for any list of module names.
pub fn module_names(program: Node, modules: &[&str]) -> (HashMap<String, String>, HashSet<String>) {
    let (base_named, mut namespaces) = base_bindings(program, modules);
    let mut named = HashMap::new();
    for (local, imported) in base_named {
        if imported == "default" {
            namespaces.insert(local);
        } else {
            named.insert(local, imported);
        }
    }
    for statement in program.nodes("body") {
        if included(modules, import_equals_module(statement)) {
            namespaces.insert(name_of(statement.node("id")).unwrap_or_default());
        }
        if !statement.is("VariableDeclaration") {
            continue;
        }
        for declarator in statement.nodes("declarations") {
            if !included(modules, loaded_module(declarator.node("init"))) {
                continue;
            }
            let Some(pattern) = declarator.node("id") else { continue };
            if pattern.is("Identifier") {
                namespaces.insert(name_of(Some(pattern)).unwrap_or_default());
            }
            if pattern.is("ObjectPattern") {
                for property in pattern.nodes("properties") {
                    let value = property.node("value").filter(|value| property.is("Property") && value.is("Identifier"));
                    if let (Some(key), Some(value)) = (static_key(property), value) {
                        named.insert(name_of(Some(value)).unwrap_or_default(), key);
                    }
                }
            }
        }
    }
    (named, namespaces)
}

fn unaliased<'a, 'v>(env: &Env<'a, 'v>, node: Node<'v>) -> Node<'v> {
    resolve_constant(env, Some(unwrapped(node))).map(unwrapped).unwrap_or(node)
}

/// `isBindCall`: `<callee>.bind(...)`.
fn is_bind_call(node: Node) -> bool {
    node.is("CallExpression") && node.node("callee").is_some_and(|callee| callee.is("MemberExpression") && member_name(callee).as_deref() == Some("bind"))
}

fn alias_target<'a, 'v>(env: &Env<'a, 'v>, callee: Node<'v>) -> Node<'v> {
    let mut current = unaliased(env, callee);
    for _ in 0..DEPTHS {
        match current.node("callee").filter(|_| is_bind_call(current)).and_then(|callee| callee.node("object")) {
            Some(object) => current = unaliased(env, object),
            None => break,
        }
    }
    current
}

/// `isModuleValue`: whether an expression is the module itself.
pub fn is_module_value<'a, 'v>(env: &Env<'a, 'v>, node: Option<Node<'v>>, bindings: &Bindings) -> bool {
    let target = node.map(|node| unaliased(env, node));
    match target {
        Some(target) if target.is("Identifier") => name_of(Some(target)).is_some_and(|name| bindings.namespaces.contains(&name)),
        _ => included(bindings.modules, loaded_module(target)),
    }
}

fn imported_callee_name(callee: Node, bindings: &Bindings) -> Option<String> {
    if callee.is("Identifier") {
        return bindings.named.get(name_of(Some(callee))?.as_str()).cloned();
    }
    if !callee.is("MemberExpression") || callee.flag("computed") {
        return None;
    }
    let object = callee.node("object").filter(|object| object.is("Identifier"))?;
    let property = callee.node("property").filter(|property| property.is("Identifier"))?;
    bindings.namespaces.contains(name_of(Some(object))?.as_str()).then(|| name_of(Some(property))).flatten()
}

fn destructured_name<'a, 'v>(env: &Env<'a, 'v>, node: Node<'v>, bindings: &Bindings) -> Option<String> {
    if !node.is("Identifier") {
        return None;
    }
    let name = name_of(Some(node))?;
    let definitions = env.scopes.defs(env.scopes.variable_named(node)?);
    let definition = definitions.first().filter(|definition| definition.kind == DefKind::Variable)?;
    let pattern = definition.node.node("id").filter(|pattern| pattern.is("ObjectPattern"))?;
    if !is_module_value(env, definition.node.node("init"), bindings) {
        return None;
    }
    let property = pattern.nodes("properties").into_iter().find(|entry| {
        entry.is("Property")
            && entry.node("value").is_some_and(|value| {
                name_of(Some(value)).as_deref() == Some(name.as_str())
                    || (value.is("AssignmentPattern") && name_of(value.node("left")).as_deref() == Some(name.as_str()))
            })
    })?;
    static_key(property)
}

fn module_member_name<'a, 'v>(env: &Env<'a, 'v>, target: Node<'v>, bindings: &Bindings) -> Option<String> {
    let is_member = target.is("MemberExpression") && !target.flag("computed");
    if is_member && is_module_value(env, target.node("object"), bindings) { member_name(target) } else { None }
}

/// `importedFunction`: the exported name of the module member a callee stands for.
pub fn imported_function<'a, 'v>(env: &Env<'a, 'v>, callee: Node<'v>, bindings: &Bindings) -> Option<String> {
    let target = unwrapped(alias_target(env, callee));
    imported_callee_name(target, bindings).or_else(|| destructured_name(env, target, bindings)).or_else(|| module_member_name(env, target, bindings))
}
