//! The helpers a rule gets from `detectTestingLibraryUtils`: which identifiers are queries, events, renders and so on.
use super::detect::Detection;
use super::nodes::{deepest_identifier, identifier, is_kind, is_named, name, property_name};
use crate::typescript::rules::support::view::Node;
use std::collections::HashSet;

const QUERY_VARIANTS: [&str; 6] = ["getAll", "get", "queryAll", "query", "findAll", "find"];
const QUERY_METHODS: [&str; 8] = ["ByLabelText", "ByPlaceholderText", "ByText", "ByAltText", "ByTitle", "ByDisplayValue", "ByRole", "ByTestId"];
pub const ASYNC_UTILS: [&str; 2] = ["waitFor", "waitForElementToBeRemoved"];
pub const DEBUG_UTILS: [&str; 6] = ["debug", "logTestingPlaygroundURL", "prettyDOM", "logRoles", "logDOM", "prettyFormat"];
const PRESENCE_MATCHERS: [&str; 4] = ["toBeOnTheScreen", "toBeInTheDocument", "toBeTruthy", "toBeDefined"];
const ABSENCE_MATCHERS: [&str; 2] = ["toBeNull", "toBeFalsy"];

/// `/^(get|query|find)(All)?By.+$/`
pub fn is_query_name(text: &str) -> bool {
    QUERY_VARIANTS.iter().any(|variant| {
        text.strip_prefix(variant).and_then(|rest| rest.strip_prefix("By")).is_some_and(|rest| rest.chars().next().is_some_and(|first| first != '\n' && first != '\r'))
    })
}

/// One of `ALL_QUERIES_COMBINATIONS`.
pub fn is_built_in_query_name(text: &str) -> bool {
    QUERY_VARIANTS.iter().any(|variant| text.strip_prefix(variant).is_some_and(|rest| QUERY_METHODS.contains(&rest)))
}

fn fits(names: &'static [&'static str]) -> impl Fn(&str, Option<&str>) -> bool {
    move |found, original| names.contains(&found) || original.is_some_and(|original| names.contains(&original))
}

/// `getAssertNodeInfo`: the matcher of `expect(...).matcher` or `expect(...).not.matcher`, and whether it is negated.
fn assertion(member: Node) -> Option<(String, bool)> {
    let expectation = member.node("object").filter(|object| object.is("CallExpression"))?;
    if !is_named(expectation.node("callee"), "expect") {
        return None;
    }
    let matcher = property_name(member);
    if matcher.as_deref() != Some("not") {
        return matcher.filter(|matcher| !matcher.is_empty()).map(|matcher| (matcher, false));
    }
    let negated = member.parent().filter(|parent| parent.is("MemberExpression")).and_then(property_name);
    negated.filter(|matcher| !matcher.is_empty()).map(|matcher| (matcher, true))
}

impl<'v> Detection<'v> {
    pub fn is_query(&self, node: Node) -> bool {
        is_query_name(&name(node))
    }

    pub fn is_built_in_query(&self, node: Node) -> bool {
        is_built_in_query_name(&name(node))
    }

    pub fn is_async_util(&self, node: Node<'v>) -> bool {
        self.potential(Some(node), fits(&ASYNC_UTILS))
    }

    pub fn is_fire_event_method(&self, node: Node<'v>) -> bool {
        let Some(util) = self.local_util_name(self.util_specifier("fireEvent"), "fireEvent") else { return false };
        let found = name(node);
        let Some(parent) = node.parent() else { return false };
        if parent.is("CallExpression") {
            return found == util || found == "fireEvent";
        }
        if !parent.is("MemberExpression") {
            return false;
        }
        let object = parent.node("object");
        let other = found != "fireEvent" && found != util;
        let regular = identifier(object).is_some_and(|object| name(object) == util) && is_kind(parent.parent(), "CallExpression") && other;
        let wildcard = object.is_some_and(|object| {
            object.is("MemberExpression") && identifier(object.node("object")).is_some_and(|head| name(head) == util) && is_named(object.node("property"), "fireEvent")
        }) && other;
        let wildcard_call = identifier(object).is_some_and(|object| name(object) == util)
            && is_named(parent.node("property"), "fireEvent")
            && !is_kind(parent.parent(), "MemberExpression")
            && found == "fireEvent"
            && found != util;
        regular || wildcard || wildcard_call
    }

    pub fn is_user_event_method(&self, node: Node<'v>, setups: Option<&HashSet<String>>) -> bool {
        let util = self.local_util_name(self.user_event_specifier(), "userEvent");
        let Some(parent) = node.parent().filter(|parent| parent.is("MemberExpression")) else { return false };
        let found = name(node);
        let object = identifier(parent.node("object")).map(name);
        if util.as_ref().is_some_and(|util| found == *util || found == "userEvent") || object.as_ref() == Some(&found) {
            return false;
        }
        if util.is_some() && object == util {
            return true;
        }
        object.is_some_and(|object| setups.is_some_and(|setups| setups.contains(&object)))
    }

    pub fn is_render_util(&self, node: Node<'v>) -> bool {
        self.potential(Some(node), |found, _| found.to_lowercase().contains("render"))
    }

    pub fn is_create_event_util(&self, node: Node<'v>) -> bool {
        let callee = node.node("callee").filter(|callee| node.is("CallExpression") && callee.is("MemberExpression"));
        let object = callee.and_then(|callee| callee.node("object"));
        let target = match object {
            Some(object) if object.is("Identifier") => Some(object),
            Some(object) if object.is("MemberExpression") && identifier(object.node("property")).is_some() => object.node("property"),
            _ => deepest_identifier(Some(node)),
        };
        self.potential(target, fits(&["createEvent"]))
    }

    pub fn is_render_declarator(&self, declarator: Node<'v>) -> bool {
        deepest_identifier(declarator.node("init")).is_some_and(|init| self.is_render_util(init))
    }

    pub fn is_debug_util(&self, node: Node<'v>) -> bool {
        let on_console = node.parent().is_some_and(|parent| parent.is("MemberExpression") && is_named(parent.node("object"), "console"));
        !on_console && self.potential(Some(node), fits(&DEBUG_UTILS))
    }

    pub fn is_act_util(&self, node: Node<'v>) -> bool {
        self.potential(Some(node), fits(&["act"])) || self.react_dom_act(node)
    }

    pub fn is_util(&self, node: Node<'v>) -> bool {
        self.is_async_util(node)
            || self.is_query(node)
            || self.is_render_util(node)
            || self.is_fire_event_method(node)
            || self.is_user_event_method(node, None)
            || self.is_act_util(node)
            || self.is_create_event_util(node)
    }

    pub fn is_presence_assert(&self, member: Node) -> bool {
        assertion(member).is_some_and(|(matcher, negated)| if negated { ABSENCE_MATCHERS.contains(&matcher.as_str()) } else { PRESENCE_MATCHERS.contains(&matcher.as_str()) })
    }

    pub fn is_absence_assert(&self, member: Node) -> bool {
        assertion(member).is_some_and(|(matcher, negated)| if negated { PRESENCE_MATCHERS.contains(&matcher.as_str()) } else { ABSENCE_MATCHERS.contains(&matcher.as_str()) })
    }
}
