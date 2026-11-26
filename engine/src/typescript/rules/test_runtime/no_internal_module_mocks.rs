use super::runner_apis::{Apis, module_mocks, spied_member};
use crate::typescript::rules::Context;
use crate::typescript::rules::testing_library::nodes::string_literal;
use std::collections::HashMap;

const RULE: &str = "no-internal-module-mocks";
const CONDITION: &str = "production-module";
const EXCEPTION_ROUTE: &str = "An exception fits only when injection is not possible.";

/// Reports each replacement of a production module of the project. Whether a module is one depends on the project
/// layout, so each candidate carries a `production-module` condition for the caller to answer.
pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let mut apis = Apis::new();
    let mut namespaces: HashMap<String, String> = HashMap::new();
    for node in view.nodes() {
        apis.observe(node);
        if node.is("ImportDeclaration") {
            let Some(source) = string_literal(node.node("source")) else { continue };
            for specifier in node.nodes("specifiers").into_iter().filter(|specifier| specifier.is("ImportNamespaceSpecifier")) {
                if let Some(local) = specifier.node("local").and_then(|local| local.name()) {
                    namespaces.insert(local.into_owned(), source.clone());
                }
            }
            continue;
        }
        if !node.is("CallExpression") {
            continue;
        }
        let (start, end) = (node.start(), Some(node.end()));
        if let Some(target) = spied_member(&apis, node) {
            let source = target.name().and_then(|name| namespaces.get(name.as_ref()));
            if let Some(source) = source {
                let message = format!(
                    "Inject the dependency instead of replacing a function of internal production module {source} with a spy or stub. {EXCEPTION_ROUTE}"
                );
                context.report_when(RULE, start, end, message, vec![(CONDITION.into(), source.clone())]);
            }
            continue;
        }
        for name in module_mocks(&apis, node).into_iter().flatten() {
            let message = format!("Inject the dependency instead of replacing internal production module {name}. {EXCEPTION_ROUTE}");
            context.report_when(RULE, start, end, message, vec![(CONDITION.into(), name)]);
        }
    }
}
