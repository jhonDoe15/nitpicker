//! The eslint-plugin-testing-library rules the preset enables, ported from version 7.16.2 of the plugin (MIT).
//! One walk in ESLint's order serves all of them: what the file has imported is noted as the walk reaches it,
//! and a rule sees a node only once a Testing Library module has been imported, as in the plugin.
mod checks;
mod detect;
mod nodes;
mod promises;
mod resolve;
mod utils;

use super::Context;
use super::support::scope::Scopes;
use super::support::view::Node;
use checks::{access, awaits, debug_act, queries, user_events};
use detect::Detection;
use std::sync::OnceLock;

pub const RULES: [&str; 12] = [
    "testing-library/await-async-events",
    "testing-library/await-async-queries",
    "testing-library/await-async-utils",
    "testing-library/no-debugging-utils",
    "testing-library/no-manual-cleanup",
    "testing-library/no-node-access",
    "testing-library/no-test-id-queries",
    "testing-library/no-unnecessary-act",
    "testing-library/prefer-presence-queries",
    "testing-library/prefer-screen-queries",
    "testing-library/prefer-user-event",
    "testing-library/prefer-user-event-setup",
];

static UTILS_MODULE: OnceLock<Option<String>> = OnceLock::new();

/// Sets `testing-library/utils-module` for the run; `None` reports every matching name whatever it was imported from.
pub fn set_utils_module(setting: Option<String>) {
    let _ = UTILS_MODULE.set(setting);
}

static UPSTREAM_ONLY: OnceLock<bool> = OnceLock::new();

/// Leaves out what the preset adds to the plugin's rules, to compare with the plugin itself.
pub fn set_upstream_only() {
    let _ = UPSTREAM_ONLY.set(true);
}

fn utils_module() -> Option<String> {
    UTILS_MODULE.get_or_init(|| Some("test-utils".to_string())).clone()
}

pub struct Tools<'w, 'a, 'v> {
    pub detect: &'w Detection<'v>,
    pub scopes: &'v Scopes<'a, 'v>,
    selected: &'w [&'static str],
    found: &'w mut Vec<(&'static str, u32, String)>,
}

impl Tools<'_, '_, '_> {
    pub fn report(&mut self, rule: &'static str, at: Node, message: String) {
        if self.selected.contains(&rule) {
            self.found.push((rule, at.start(), message));
        }
    }
}

struct Walk<'s, 'a, 'v> {
    detect: Detection<'v>,
    scopes: &'v Scopes<'a, 'v>,
    selected: &'s [&'static str],
    found: Vec<(&'static str, u32, String)>,
    events: awaits::Events,
    async_queries: awaits::Queries,
    async_utils: awaits::Utils,
    debugging: debug_act::Debugging<'v>,
    act: debug_act::Act,
    screen: queries::Screen,
    user_event: user_events::PreferUserEvent,
    setup: user_events::PreferSetup,
    named_import: Option<user_events::NamedImport>,
}

impl<'v> Walk<'_, '_, 'v> {
    fn rules(&mut self, node: Node<'v>) {
        let mut tools = Tools { detect: &self.detect, scopes: self.scopes, selected: self.selected, found: &mut self.found };
        let parent = node.parent();
        match node.kind() {
            "ImportDeclaration" => self.setup.import(node),
            "VariableDeclarator" => {
                self.events.declarator(node);
                self.async_utils.declarator(node);
                self.debugging.declarator(node, &tools);
                self.screen.declarator(node, &tools);
                self.user_event.declarator(node, &tools);
                self.setup.declarator(node);
            }
            "ReturnStatement" => self.events.returns(node),
            "FunctionDeclaration" => self.setup.function(node),
            "MemberExpression" => access::member(node, &mut tools),
            "Identifier" if node.ancestors().any(|ancestor| ancestor.is("CallExpression")) => {
                self.events.identifier(node, &mut tools);
                queries::presence(node, &mut tools);
                self.user_event.identifier(node, &mut tools);
            }
            "CallExpression" => {
                self.async_queries.call(node, &mut tools);
                self.async_utils.call(node, &mut tools);
                self.debugging.call(node, &mut tools);
                access::event_on_query(node, &mut tools);
                queries::test_id(node, &mut tools);
                self.screen.call(node, &mut tools);
                self.setup.call(node, &mut tools);
                if nodes::is_kind(parent, "VariableDeclarator") {
                    self.act.register(node, &tools);
                }
                let outer = parent.filter(|parent| parent.is("ArrowFunctionExpression")).and_then(|arrow| arrow.parent());
                if let Some(call) = outer.filter(|outer| outer.is("CallExpression")) {
                    self.act.implicit_return(node, call, &mut tools);
                }
            }
            "BlockStatement" => {
                let function = parent.filter(|parent| matches!(parent.kind(), "ArrowFunctionExpression" | "FunctionExpression"));
                let call = function.and_then(|function| function.parent()).filter(|call| call.is("CallExpression"));
                if let (Some(function), Some(call)) = (function, call) {
                    self.act.block(node, function, call, &mut tools);
                }
            }
            _ => {}
        }
    }

    fn enter(&mut self, node: Node<'v>) {
        if node.is("ImportDeclaration") {
            self.detect.import(node);
        }
        if self.detect.imported(false) {
            self.rules(node);
        }
        if node.is("CallExpression") && let Some(named_import) = &self.named_import {
            let mut tools = Tools { detect: &self.detect, scopes: self.scopes, selected: self.selected, found: &mut self.found };
            named_import.call(node, &mut tools);
        }
        if Detection::is_kind_of_require(node) && let Some(call) = node.parent() {
            self.detect.require(call);
        }
    }

    fn visit(&mut self, node: Node<'v>) {
        self.enter(node);
        for child in node.children() {
            self.visit(child);
        }
    }
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    if context.setting("testing-library/scope") == Some("off") {
        return;
    }
    let module = context.setting("testing-library/utils-module").map(|module| Some(module.to_string()).filter(|module| !module.is_empty()));
    let selected: Vec<&'static str> = RULES.iter().copied().filter(|rule| context.selected.contains(rule)).collect();
    let mut walk = Walk {
        detect: Detection::new(module.unwrap_or_else(utils_module)),
        scopes,
        selected: &selected,
        found: Vec::new(),
        events: Default::default(),
        async_queries: Default::default(),
        async_utils: Default::default(),
        debugging: Default::default(),
        act: Default::default(),
        screen: Default::default(),
        user_event: Default::default(),
        setup: Default::default(),
        named_import: user_events::NamedImport::of(view.program()).filter(|_| !UPSTREAM_ONLY.get().copied().unwrap_or(false)),
    };
    walk.visit(view.program());
    if walk.detect.imported(false) {
        let mut tools = Tools { detect: &walk.detect, scopes, selected: &selected, found: &mut walk.found };
        access::cleanup(&mut tools);
    }
    for (rule, start, message) in walk.found {
        context.report_at(rule, start, message);
    }
}
