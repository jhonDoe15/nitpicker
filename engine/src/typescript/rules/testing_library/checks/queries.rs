//! no-test-id-queries, prefer-presence-queries and prefer-screen-queries.
use super::super::Tools;
use super::super::nodes::{closest_call_named, deepest_identifier, identifier, identifier_name, is_kind, is_named, name};
use super::super::promises::{function_name, returning_function};
use super::super::resolve::resolve;
use crate::typescript::rules::support::view::Node;

const TEST_ID: &str = "testing-library/no-test-id-queries";
const PRESENCE: &str = "testing-library/prefer-presence-queries";
const SCREEN: &str = "testing-library/prefer-screen-queries";
const TEST_ID_QUERIES: [&str; 6] = ["getByTestId", "getAllByTestId", "queryByTestId", "queryAllByTestId", "findByTestId", "findAllByTestId"];

pub fn test_id(node: Node, tools: &mut Tools) {
    let Some(callee) = node.node("callee") else { return };
    let property = callee.node("property").and_then(|property| property.name());
    let matches = |found: Option<std::borrow::Cow<str>>| found.is_some_and(|found| TEST_ID_QUERIES.contains(&found.as_ref()));
    if matches(property) || matches(callee.name()) {
        tools.report(TEST_ID, node, "Using `data-testid` queries is not recommended. Use a more descriptive query instead.".to_string());
    }
}

pub fn presence<'v>(node: Node<'v>, tools: &mut Tools<'_, '_, 'v>) {
    let expectation = closest_call_named(node, "expect");
    let within = closest_call_named(node, "within").is_some();
    let Some(statement) = expectation.and_then(|expectation| expectation.parent()).filter(|parent| parent.is("MemberExpression")) else { return };
    let label = name(node);
    let sync = label.starts_with("get") || label.starts_with("query");
    if !tools.detect.is_query(node) || !sync {
        return;
    }
    let gets = label.starts_with("get");
    let present = tools.detect.is_presence_assert(statement);
    let absent = tools.detect.is_absence_assert(statement);
    if !present && !absent {
        return;
    }
    if (within || present) && !gets {
        tools.report(PRESENCE, node, "Use `getBy*` queries rather than `queryBy*` for checking element is present".to_string());
    } else if !within && absent && gets {
        tools.report(PRESENCE, node, "Use `queryBy*` queries rather than `getBy*` for checking element is NOT present".to_string());
    }
}

fn uses_container_or_base_element(call: Node) -> bool {
    let Some(options) = call.nodes("arguments").get(1).copied().filter(|options| options.is("ObjectExpression")) else { return false };
    options.nodes("properties").into_iter().any(|property| {
        property.is("Property") && identifier_name(property.node("key")).is_some_and(|key| key == "container" || key == "baseElement")
    })
}

#[derive(Default)]
pub struct Screen {
    wrappers: Vec<String>,
    safe: Vec<String>,
    within: Vec<String>,
}

impl Screen {
    fn is_reportable_render<'v>(&self, node: Node<'v>, tools: &Tools<'_, '_, 'v>) -> bool {
        tools.detect.is_render_util(node) || self.wrappers.contains(&name(node))
    }

    fn save_safe(&mut self, declarator: Node, tools: &Tools) {
        let Some(id) = declarator.node("id").filter(|id| id.is("ObjectPattern")) else { return };
        for property in id.nodes("properties").into_iter().filter(|property| property.is("Property")) {
            if let Some(key) = identifier(property.node("key")).filter(|key| tools.detect.is_built_in_query(*key)) {
                self.safe.push(name(key));
            }
        }
    }

    fn is_allowed(&self, found: &str) -> bool {
        found == "screen" || self.within.iter().any(|declared| declared == found)
    }

    pub fn declarator<'v>(&mut self, node: Node<'v>, tools: &Tools<'_, '_, 'v>) {
        let Some(init) = node.node("init").filter(|init| init.is("CallExpression")) else { return };
        let Some(callee) = identifier(init.node("callee")) else { return };
        let valid = self.is_reportable_render(callee, tools);
        if !valid {
            self.save_safe(node, tools);
        }
        if name(callee) != "within" && !(valid && uses_container_or_base_element(init)) {
            return;
        }
        if is_kind(node.node("id"), "ObjectPattern") {
            self.save_safe(node, tools);
        } else if let Some(id) = identifier(node.node("id")) {
            self.within.push(name(id));
        }
    }

    pub fn call<'v>(&mut self, node: Node<'v>, tools: &mut Tools<'_, '_, 'v>) {
        let Some(found) = deepest_identifier(Some(node)) else { return };
        if tools.detect.is_render_util(found) && let Some(function) = returning_function(found) {
            self.wrappers.push(function_name(function));
        }
        if !tools.detect.is_built_in_query(found) {
            return;
        }
        let label = name(found);
        let message = format!("Avoid destructuring queries from `render` result, use `screen.{label}` instead");
        let Some(member) = found.parent().filter(|parent| parent.is("MemberExpression")) else {
            if !self.safe.contains(&label) {
                tools.report(SCREEN, found, message);
            }
            return;
        };
        let object = member.node("object");
        let rendered = object.filter(|object| object.is("CallExpression")).and_then(|object| Some((object, identifier(object.node("callee"))?)));
        if let Some((render, callee)) = rendered
            && !is_named(Some(callee), "within")
            && self.is_reportable_render(callee, tools)
            && !uses_container_or_base_element(render)
        {
            tools.report(SCREEN, found, message);
            return;
        }
        let original = resolve(node, tools.scopes, tools.detect.setting.as_deref()).and_then(|imported| imported.original).unwrap_or_default();
        if identifier_name(object).is_some_and(|object| !self.is_allowed(&object)) && !self.is_allowed(&original) {
            tools.report(SCREEN, found, message);
        }
    }
}
