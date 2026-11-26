//! `importedBindings`: every local name a file binds to a module's export, by `import`, `import x = require()`,
//! `require()` or `await import()`: a namespace or default import as the module's `default`, a named one as
//! the export it names.
use super::syntax::{member_name, static_key, string_value, unwrapped};
use crate::typescript::rules::support::view::Node;
use std::collections::HashMap;

const DEFAULT: &str = "default";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ImportedBinding {
    pub module: String,
    pub name: String,
}

#[derive(Default)]
struct ModuleBindings {
    named: Vec<(String, String)>,
    namespaces: Vec<String>,
}

impl ModuleBindings {
    fn name(&mut self, local: String, imported: String) {
        self.named.retain(|(each, _)| *each != local);
        self.named.push((local, imported));
    }

    fn namespace(&mut self, local: String) {
        if !self.namespaces.contains(&local) {
            self.namespaces.push(local);
        }
    }
}

fn text(node: Option<Node>, key: &str) -> Option<String> {
    node.and_then(|node| node.text(key)).map(|text| text.into_owned())
}

fn loaded_module_call(node: Option<Node>) -> Option<String> {
    let target = unwrapped(node?);
    if target.is("ImportExpression") {
        return string_value(target.node("source"));
    }
    let callee = target.node("callee").filter(|_| target.is("CallExpression"))?;
    let requires = callee.is("Identifier") && callee.name().as_deref() == Some("require");
    if requires { string_value(target.nodes("arguments").first().copied()) } else { None }
}

fn module_step(node: Node) -> Option<Node> {
    let target = unwrapped(node);
    if target.is("AwaitExpression") {
        return target.node("argument");
    }
    let default = target.is("MemberExpression") && member_name(target).as_deref() == Some(DEFAULT);
    if default { target.node("object") } else { None }
}

/// `loadedModule`: the module a `require()` or `import()` loads, through `await` and `.default`.
pub fn loaded_module(node: Option<Node>) -> Option<String> {
    let mut last = node?;
    while let Some(next) = module_step(last) {
        last = next;
    }
    loaded_module_call(Some(last))
}

fn import_equals_module(statement: Node) -> Option<String> {
    let reference = statement.node("moduleReference").filter(|_| statement.is("TSImportEqualsDeclaration"))?;
    if reference.is("TSExternalModuleReference") { string_value(reference.node("expression")) } else { None }
}

fn import_bindings(statement: Node, bindings: &mut ModuleBindings) {
    if text(Some(statement), "importKind").as_deref() == Some("type") {
        return;
    }
    for specifier in statement.nodes("specifiers") {
        let Some(local) = text(specifier.node("local"), "name") else { continue };
        if specifier.is("ImportSpecifier") {
            let imported = specifier.node("imported");
            let name = if imported.is_some_and(|imported| imported.is("Identifier")) { text(imported, "name") } else { text(imported, "value") };
            bindings.name(local, name.unwrap_or_default());
        } else {
            bindings.namespace(local);
        }
    }
}

fn is_require_of(init: Option<Node>, module: &str) -> bool {
    let Some(init) = init.filter(|init| init.is("CallExpression")) else { return false };
    let callee = init.node("callee");
    let source = string_value(init.nodes("arguments").first().copied());
    callee.is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("require")) && source.as_deref() == Some(module)
}

fn require_bindings(pattern: Node, bindings: &mut ModuleBindings) {
    if pattern.is("Identifier") {
        bindings.namespace(text(Some(pattern), "name").unwrap_or_default());
    }
    if !pattern.is("ObjectPattern") {
        return;
    }
    for property in pattern.nodes("properties") {
        let (key, value) = (property.node("key"), property.node("value"));
        if property.is("Property") && key.is_some_and(|key| key.is("Identifier")) && value.is_some_and(|value| value.is("Identifier")) {
            bindings.name(text(value, "name").unwrap_or_default(), text(key, "name").unwrap_or_default());
        }
    }
}

/// `moduleBindings` of one module.
fn module_bindings(program: Node, module: &str) -> ModuleBindings {
    let mut bindings = ModuleBindings::default();
    for statement in program.nodes("body") {
        if statement.is("ImportDeclaration") && text(statement.node("source"), "value").as_deref() == Some(module) {
            import_bindings(statement, &mut bindings);
        }
        if statement.is("VariableDeclaration") {
            for declarator in statement.nodes("declarations") {
                if is_require_of(declarator.node("init"), module)
                    && let Some(id) = declarator.node("id")
                {
                    require_bindings(id, &mut bindings);
                }
            }
        }
    }
    bindings
}

fn pattern_bindings(pattern: Node, bindings: &mut ModuleBindings) {
    for property in pattern.nodes("properties") {
        let value = property.node("value").filter(|value| property.is("Property") && value.is("Identifier"));
        if let (Some(key), Some(value)) = (static_key(property), value) {
            bindings.name(text(Some(value), "name").unwrap_or_default(), key);
        }
    }
}

fn loaded_bindings(statement: Node, module: &str, bindings: &mut ModuleBindings) {
    if statement.is("TSImportEqualsDeclaration") && import_equals_module(statement).as_deref() == Some(module) {
        bindings.namespace(text(statement.node("id"), "name").unwrap_or_default());
    }
    if !statement.is("VariableDeclaration") {
        return;
    }
    for declarator in statement.nodes("declarations") {
        if loaded_module(declarator.node("init")).as_deref() != Some(module) {
            continue;
        }
        let Some(id) = declarator.node("id") else { continue };
        if id.is("Identifier") {
            bindings.namespace(text(Some(id), "name").unwrap_or_default());
        }
        if id.is("ObjectPattern") {
            pattern_bindings(id, bindings);
        }
    }
}

/// `bindingsOf` for one module: default imports count as namespaces.
fn bindings_of(program: Node, module: &str) -> ModuleBindings {
    let base = module_bindings(program, module);
    let mut bindings = ModuleBindings { named: Vec::new(), namespaces: base.namespaces };
    for (local, imported) in base.named {
        if imported == DEFAULT {
            bindings.namespace(local);
        } else {
            bindings.name(local, imported);
        }
    }
    for statement in program.nodes("body") {
        loaded_bindings(statement, module, &mut bindings);
    }
    bindings
}

fn statement_modules(statement: Node) -> Vec<Option<String>> {
    if statement.is("ImportDeclaration") {
        return if text(Some(statement), "importKind").as_deref() == Some("type") { Vec::new() } else { vec![text(statement.node("source"), "value")] };
    }
    let declarations = if statement.is("VariableDeclaration") { statement.nodes("declarations") } else { Vec::new() };
    std::iter::once(import_equals_module(statement)).chain(declarations.into_iter().map(|declarator| loaded_module(declarator.node("init")))).collect()
}

/// `importedBindings`: local name to the module and export it binds.
pub fn imported_bindings(program: Node) -> HashMap<String, ImportedBinding> {
    let mut modules: Vec<String> = Vec::new();
    for module in program.nodes("body").into_iter().flat_map(statement_modules).flatten() {
        if !modules.contains(&module) {
            modules.push(module);
        }
    }
    let mut found = HashMap::new();
    for module in modules {
        let bindings = bindings_of(program, &module);
        for local in bindings.namespaces {
            found.insert(local, ImportedBinding { module: module.clone(), name: DEFAULT.to_string() });
        }
        for (local, name) in bindings.named {
            found.insert(local, ImportedBinding { module: module.clone(), name });
        }
    }
    found
}
