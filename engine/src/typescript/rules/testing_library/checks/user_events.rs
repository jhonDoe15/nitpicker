//! prefer-user-event and prefer-user-event-setup.
use super::super::Tools;
use super::super::nodes::{closest_call, identifier, identifier_name, name, string_literal};
use super::awaits::Setups;
use crate::typescript::rules::support::view::Node;
use std::collections::HashMap;

const PREFER: &str = "testing-library/prefer-user-event";
const SETUP: &str = "testing-library/prefer-user-event-setup";

const CLICKS: &[&str] = &["click", "dblClick", "selectOptions", "deselectOptions"];
const HOVERS: &[&str] = &["hover", "selectOptions", "deselectOptions"];
const MOVES: &[&str] = &["hover", "unhover", "selectOptions", "deselectOptions"];

fn user_event_methods(fire_event_method: &str) -> Option<&'static [&'static str]> {
    Some(match fire_event_method {
        "click" => &["click", "type", "selectOptions", "deselectOptions"],
        "change" => &["upload", "type", "clear", "selectOptions", "deselectOptions"],
        "dblClick" => &["dblClick"],
        "input" => &["type", "upload", "selectOptions", "deselectOptions", "paste"],
        "keyDown" | "keyUp" => &["type", "tab"],
        "keyPress" => &["type"],
        "mouseDown" | "mouseUp" | "pointerDown" | "pointerUp" => CLICKS,
        "mouseEnter" | "mouseOver" | "pointerEnter" | "pointerOver" => HOVERS,
        "mouseLeave" | "mouseOut" | "pointerLeave" | "pointerOut" => &["unhover"],
        "mouseMove" | "pointerMove" => MOVES,
        "paste" => &["paste"],
        _ => return None,
    })
}

fn message(fire_event_method: &str, methods: &[&str]) -> String {
    let named: Vec<String> = methods.iter().map(|method| format!("userEvent.{method}")).collect();
    let listed = match named.split_last() {
        Some((last, rest)) if !rest.is_empty() => format!("{}, or {last}", rest.join(", ")),
        _ => named.join(", "),
    };
    format!("Prefer using {listed} over fireEvent.{fire_event_method}")
}

fn first_argument_text(call: Node) -> Option<String> {
    string_literal(call.nodes("arguments").first().copied())
}

#[derive(Default)]
pub struct PreferUserEvent {
    created: HashMap<String, String>,
}

impl PreferUserEvent {
    fn method_name<'v>(&self, call: Node<'v>, node: Node<'v>, tools: &Tools<'_, '_, 'v>) -> Option<String> {
        if !call.node("callee").is_some_and(|callee| matches!(callee.kind(), "Identifier" | "MemberExpression")) {
            return Some(name(node));
        }
        let second = call.nodes("arguments").get(1).copied();
        if let Some(created) = identifier_name(second).and_then(|second| self.created.get(&second)) {
            return Some(created.clone());
        }
        let Some(second) = second.filter(|second| second.is("CallExpression") && tools.detect.is_create_event_util(*second)) else { return Some(name(node)) };
        let created = second.node("callee")?;
        if created.is("Identifier") { first_argument_text(second) } else { created.node("property").and_then(|property| property.name()).map(|found| found.into_owned()) }
    }

    pub fn identifier<'v>(&mut self, node: Node<'v>, tools: &mut Tools<'_, '_, 'v>) {
        if !tools.detect.is_fire_event_method(node) {
            return;
        }
        let Some(call) = closest_call(node, true) else { return };
        let Some(method) = self.method_name(call, node, tools) else { return };
        let (Some(methods), Some(callee)) = (user_event_methods(&method), call.node("callee")) else { return };
        tools.report(PREFER, callee, message(&method, methods));
    }

    pub fn declarator<'v>(&mut self, node: Node<'v>, tools: &Tools<'_, '_, 'v>) {
        let Some(init) = node.node("init").filter(|init| init.is("CallExpression") && tools.detect.is_create_event_util(*init)) else { return };
        let Some(id) = identifier(node.node("id")) else { return };
        let property = init.node("callee").filter(|callee| callee.is("MemberExpression")).and_then(|callee| identifier_name(callee.node("property")));
        let method = property.or_else(|| first_argument_text(init)).unwrap_or_default();
        if user_event_methods(&method).is_some() {
            self.created.insert(name(id), method);
        }
    }
}

#[derive(Default)]
pub struct PreferSetup {
    util: Option<String>,
    setups: Setups,
}

impl PreferSetup {
    pub fn import(&mut self, node: Node) {
        if string_literal(node.node("source")).as_deref() != Some("@testing-library/user-event") {
            return;
        }
        let specifiers = node.nodes("specifiers");
        let local = |specifier: &Node| specifier.node("local").map(name);
        if let Some(default) = specifiers.iter().find(|specifier| specifier.is("ImportDefaultSpecifier")) {
            self.util = local(default);
        }
        let named = specifiers.iter().find(|specifier| specifier.is("ImportSpecifier") && identifier_name(specifier.node("imported")).as_deref() == Some("userEvent"));
        if let Some(named) = named {
            self.util = local(named);
        }
    }

    pub fn declarator(&mut self, node: Node) {
        if let Some(util) = self.util.clone().filter(|_| node.node("init").is_some()) {
            self.setups.declarator(node, &util);
        }
    }

    pub fn function(&mut self, node: Node) {
        let (Some(util), Some(id)) = (self.util.clone(), node.node("id")) else { return };
        let Some(body) = node.node("body").filter(|body| body.is("BlockStatement")) else { return };
        for statement in body.nodes("body").into_iter().filter(|statement| statement.is("ReturnStatement")) {
            let properties = self.setups.returned(statement, &util, false);
            if !properties.is_empty() {
                self.setups.functions.insert(name(id), properties);
            }
        }
    }

    pub fn call<'v>(&mut self, node: Node<'v>, tools: &mut Tools<'_, '_, 'v>) {
        if self.util.is_none() {
            return;
        }
        let Some(callee) = node.node("callee").filter(|callee| callee.is("MemberExpression")) else { return };
        let Some(property) = identifier(callee.node("property")).filter(|property| tools.detect.is_user_event_method(*property, None)) else { return };
        let method = name(property);
        if method == "setup" || identifier_name(callee.node("object")).is_some_and(|object| self.setups.variables.contains(&object)) {
            return;
        }
        tools.report(SETUP, callee, format!("Prefer using userEvent with setup() instead of direct {method}() call. Use: const user = userEvent.setup(); await user.{method}(...)"));
    }
}
