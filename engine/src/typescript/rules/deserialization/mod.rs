//! `no-unsafe-deserialization`: packages that rebuild code from data, `v8.deserialize`, `vm` runs of text that is
//! not fixed, js-yaml's full schema and legacy `load`, BSON function options and XML entity expansion.
mod messages;

use crate::typescript::rules::Context;
use crate::typescript::rules::module_values::{Bindings, bindings_of, imported_function, is_module_value, loaded_module};
use crate::typescript::rules::security_values::leaves::leaf_values;
use crate::typescript::rules::security_values::{property_named, resolve_constant, static_key, unwrapped};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::urls::values::string_value;

const RULE: &str = "no-unsafe-deserialization";
const CODE_REBUILDING_PACKAGES: [&str; 3] = ["node-serialize", "funcster", "cryo"];
const V8_MODULES: &[&str] = &["v8", "node:v8"];
const VM_MODULES: &[&str] = &["vm", "node:vm"];
const YAML_MODULES: &[&str] = &["js-yaml"];
const VM_RUNNERS: [&str; 4] = ["runInNewContext", "runInThisContext", "runInContext", "compileFunction"];
const VM_CONSTRUCTORS: [&str; 2] = ["Script", "SourceTextModule"];
const YAML_FULL_SCHEMAS: [&str; 2] = ["DEFAULT_FULL_SCHEMA", "FULL_SCHEMA"];

struct Scope<'c, 'a, 's> {
    scopes: &'c Scopes<'a, 's>,
    v8: Bindings,
    vm: Bindings,
    yaml: Bindings,
    legacy_yaml: bool,
}

fn has(set: &[&str], name: Option<&str>) -> bool {
    name.is_some_and(|name| set.contains(&name))
}

fn imported_source(node: Node) -> Option<String> {
    match node.kind() {
        "ImportDeclaration" => node.node("source").and_then(|source| source.text("value")).map(|value| value.into_owned()),
        "TSImportEqualsDeclaration" => {
            let reference = node.node("moduleReference").filter(|reference| reference.is("TSExternalModuleReference"))?;
            string_value(reference.node("expression"))
        }
        _ => loaded_module(Some(node)),
    }
}

fn argument(node: Node, index: usize) -> Option<Node> {
    node.list("arguments").get(index).copied().flatten()
}

impl<'s> Scope<'_, '_, 's> {
    fn is_fixed_text(&self, node: Node<'s>) -> bool {
        let leaves = leaf_values(self.scopes, Some(node));
        !leaves.is_empty() && leaves.iter().all(|leaf| string_value(Some(*leaf)).is_some())
    }

    fn is_true(&self, node: Option<Node<'s>>) -> bool {
        node.is_some_and(|node| {
            leaf_values(self.scopes, Some(node)).into_iter().any(|leaf| leaf.is("Literal") && leaf.get("value") == Value::Bool(true))
        })
    }

    fn runs_text_as_code(&self, node: Node<'s>) -> Option<String> {
        let runner = imported_function(self.scopes, node.node("callee")?, &self.vm);
        let known = has(&VM_RUNNERS, runner.as_deref()) || (node.is("NewExpression") && has(&VM_CONSTRUCTORS, runner.as_deref()));
        let text = argument(node, 0);
        (known && !text.is_some_and(|text| self.is_fixed_text(text))).then_some(runner).flatten()
    }

    fn is_serialize_call(&self, node: Option<Node<'s>>) -> bool {
        let call = resolve_constant(self.scopes, node.map(unwrapped)).map(unwrapped);
        call.filter(|call| call.is("CallExpression"))
            .and_then(|call| call.node("callee"))
            .is_some_and(|callee| imported_function(self.scopes, callee, &self.v8).as_deref() == Some("serialize"))
    }

    fn invocation(&self, node: Node<'s>) -> Option<String> {
        let reader = imported_function(self.scopes, node.node("callee")?, &self.v8);
        if let Some(reader) = reader.filter(|reader| reader == "deserialize" || reader == "Deserializer") {
            let clone = reader == "deserialize" && self.is_serialize_call(argument(node, 0));
            return Some(if clone { messages::v8_clone() } else { messages::v8_deserialize(&reader) });
        }
        self.runs_text_as_code(node).map(|runner| messages::runs_text(&format!("vm.{runner}")))
    }

    fn legacy_yaml_load(&self, node: Node<'s>) -> Option<String> {
        let loader = imported_function(self.scopes, node.node("callee")?, &self.yaml)?;
        if !self.legacy_yaml || !(loader == "load" || loader == "loadAll") {
            return None;
        }
        let options = argument(node, if loader == "loadAll" { 2 } else { 1 }).or_else(|| argument(node, 1));
        let schema = options.and_then(|options| property_named(self.scopes, Some(options), "schema"));
        schema.is_none().then(|| messages::yaml_legacy_load(&loader))
    }

    fn yaml_pattern(&self, node: Node<'s>, found: &mut Vec<(Node<'s>, String)>) {
        let Some(pattern) = node.node("id").filter(|id| id.is("ObjectPattern")) else { return };
        if !is_module_value(self.scopes, node.node("init"), &self.yaml) {
            return;
        }
        for property in pattern.nodes("properties") {
            if let Some(key) = static_key(property).filter(|key| has(&YAML_FULL_SCHEMAS, Some(key))) {
                found.push((property, messages::yaml_full_schema(&key)));
            }
        }
    }

    fn property(&self, node: Node<'s>) -> Option<String> {
        let key = static_key(node);
        if !self.is_true(node.node("value")) {
            return None;
        }
        match key.as_deref() {
            Some(key @ ("evalFunctions" | "cacheFunctions")) => Some(messages::bson_functions(key)),
            Some("noent") => Some(messages::entity_expansion()),
            _ => None,
        }
    }
}

fn yaml_import(node: Node) -> Option<String> {
    let source = node.parent()?.node("source")?.text("value")?;
    let imported = node.node(if node.is("ExportSpecifier") { "local" } else { "imported" })?;
    let name = if imported.is("Identifier") { imported.name() } else { imported.text("value") }?;
    (YAML_MODULES.contains(&source.as_ref()) && has(&YAML_FULL_SCHEMAS, Some(&name))).then(|| messages::yaml_full_schema(&name))
}

fn source_finding(node: Node) -> Option<String> {
    imported_source(node).filter(|source| CODE_REBUILDING_PACKAGES.contains(&source.as_str())).map(|source| messages::rebuilds_code(&source))
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let program = view.program();
    let legacy_yaml = context.setting(&format!("{RULE}.yaml-major")) == Some("3");
    let scope = Scope {
        scopes,
        v8: bindings_of(program, V8_MODULES),
        vm: bindings_of(program, VM_MODULES),
        yaml: bindings_of(program, YAML_MODULES),
        legacy_yaml,
    };
    let mut found = Vec::new();
    for node in view.nodes() {
        match node.kind() {
            "ImportDeclaration" | "TSImportEqualsDeclaration" | "ImportExpression" => found.extend(source_finding(node).map(|message| (node, message))),
            "CallExpression" => {
                found.extend(source_finding(node).map(|message| (node, message)));
                found.extend(scope.invocation(node).map(|message| (node, message)));
                found.extend(scope.legacy_yaml_load(node).map(|message| (node, message)));
            }
            "NewExpression" => found.extend(scope.invocation(node).map(|message| (node, message))),
            "VariableDeclarator" => scope.yaml_pattern(node, &mut found),
            "ExportSpecifier" | "ImportSpecifier" => found.extend(yaml_import(node).map(|message| (node, message))),
            "MemberExpression" => {
                let schema = imported_function(scopes, node, &scope.yaml).filter(|schema| has(&YAML_FULL_SCHEMAS, Some(schema)));
                found.extend(schema.map(|schema| (node, messages::yaml_full_schema(&schema))));
            }
            "Property" => found.extend(scope.property(node).map(|message| (node, message))),
            _ => {}
        }
    }
    for (node, message) in found {
        context.report_range(RULE, node.start(), Some(node.end()), message);
    }
}
