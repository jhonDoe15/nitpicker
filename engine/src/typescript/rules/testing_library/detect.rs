//! `detectTestingLibraryUtils`: which Testing Library modules the file has imported so far, and what was imported from them.
use super::nodes::{closest_declarator, identifier, identifier_name, import_module_name, is_kind, name, property_identifier, reference_node, string_literal};
use crate::typescript::rules::support::view::Node;

const MODULES: [&str; 11] = [
    "dom-testing-library", "vue-testing-library", "react-testing-library", "@testing-library/dom", "@testing-library/angular",
    "@testing-library/react", "@testing-library/preact", "@testing-library/vue", "@testing-library/svelte", "@marko/testing-library",
    USER_EVENT_MODULE,
];
const USER_EVENT_MODULE: &str = "@testing-library/user-event";
const REACT_DOM_TEST_UTILS: &str = "react-dom/test-utils";

fn is_official(module: &str) -> bool {
    MODULES.contains(&module)
}

fn is_custom(module: &str, setting: Option<&str>) -> bool {
    setting.is_some_and(|custom| module.ends_with(custom))
}

pub fn is_testing_library_module(module: &str, setting: Option<&str>) -> bool {
    is_official(module) || is_custom(module, setting)
}

/// The local name of what `findImportSpecifier` or `findImportedUserEventSpecifier` found.
pub fn local_name(found: Node) -> String {
    if found.is("Identifier") { name(found) } else { found.node("local").map(name).unwrap_or_default() }
}

pub fn find_import_specifier<'v>(wanted: &str, node: Node<'v>) -> Option<Node<'v>> {
    if node.is("ImportDeclaration") {
        let specifiers = node.nodes("specifiers");
        let named = specifiers.iter().find(|specifier| {
            specifier.is("ImportSpecifier")
                && identifier_name(specifier.node("imported")).is_some_and(|imported| imported == wanted || specifier.node("local").map(name).as_deref() == Some(wanted))
        });
        return named.or_else(|| specifiers.iter().find(|specifier| specifier.is("ImportNamespaceSpecifier"))).copied();
    }
    let declarator = node.parent().filter(|parent| parent.is("VariableDeclarator"))?;
    let id = declarator.node("id")?;
    match id.kind() {
        "Identifier" => Some(id),
        "ObjectPattern" => {
            let properties = id.nodes("properties");
            let property = properties.iter().find(|property| property.is("Property") && identifier_name(property.node("key")).as_deref() == Some(wanted))?;
            property.node("key")
        }
        _ => None,
    }
}

pub struct Detection<'v> {
    /// `testing-library/utils-module`; without it every matching name counts ("aggressive module reporting").
    pub setting: Option<String>,
    pub libraries: Vec<Node<'v>>,
    pub custom: Option<Node<'v>>,
    pub user_event: Option<Node<'v>>,
    pub react_dom: Option<Node<'v>>,
}

impl<'v> Detection<'v> {
    pub fn new(setting: Option<String>) -> Detection<'v> {
        Detection { setting, libraries: Vec::new(), custom: None, user_event: None, react_dom: None }
    }

    pub fn aggressive(&self) -> bool {
        self.setting.is_none()
    }

    fn custom_module(&self) -> Option<&str> {
        self.setting.as_deref().filter(|setting| *setting != "off")
    }

    pub fn import(&mut self, node: Node<'v>) {
        let Some(source) = string_literal(node.node("source")) else { return };
        if is_official(&source) {
            self.libraries.push(node);
        }
        if self.custom.is_none() && is_custom(&source, self.custom_module()) {
            self.custom = Some(node);
        }
        if self.user_event.is_none() && source == USER_EVENT_MODULE {
            self.user_event = Some(node);
        }
        if self.user_event.is_none() && source == REACT_DOM_TEST_UTILS {
            self.react_dom = Some(node);
        }
    }

    pub fn require(&mut self, call: Node<'v>) {
        let arguments: Vec<String> = call.nodes("arguments").into_iter().filter_map(|argument| string_literal(Some(argument))).collect();
        if arguments.iter().any(|argument| is_official(argument)) {
            self.libraries.push(call);
        }
        if self.custom.is_none() && arguments.iter().any(|argument| is_custom(argument, self.custom_module())) {
            self.custom = Some(call);
        }
        if self.custom.is_none() && arguments.iter().any(|argument| argument == USER_EVENT_MODULE) {
            self.user_event = Some(call);
        }
        if self.react_dom.is_none() && arguments.iter().any(|argument| argument == REACT_DOM_TEST_UTILS) {
            self.react_dom = Some(call);
        }
    }

    pub fn imported(&self, strict: bool) -> bool {
        (!strict && self.aggressive()) || !self.libraries.is_empty() || self.custom.is_some()
    }

    pub fn util_specifier(&self, wanted: &str) -> Option<Node<'v>> {
        find_import_specifier(wanted, self.custom.or_else(|| self.libraries.first().copied())?)
    }

    pub fn user_event_specifier(&self) -> Option<Node<'v>> {
        let Some(module) = self.user_event else { return find_import_specifier("userEvent", self.custom?) };
        if module.is("ImportDeclaration") {
            let specifiers = module.nodes("specifiers");
            return specifiers.iter().find(|specifier| specifier.is("ImportDefaultSpecifier")).and_then(|specifier| specifier.node("local"));
        }
        identifier(module.parent().filter(|parent| parent.is("VariableDeclarator"))?.node("id"))
    }

    /// The name `userEvent` or `fireEvent` goes by in this file.
    pub fn local_util_name(&self, specifier: Option<Node>, default: &str) -> Option<String> {
        specifier.map(local_name).or_else(|| self.aggressive().then(|| default.to_string()))
    }

    fn imported_util_specifier(&self, node: Node<'v>) -> Option<Node<'v>> {
        self.util_specifier(&name(property_identifier(Some(node))?))
    }

    pub fn from_testing_library(&self, node: Node<'v>) -> bool {
        let Some(found) = self.imported_util_specifier(node) else { return false };
        if property_identifier(Some(reference_node(node))).is_none() {
            return false;
        }
        let declaration = match found.parent() {
            Some(parent) if parent.is("ImportDeclaration") => Some(parent),
            _ => closest_declarator(found).and_then(|declarator| declarator.node("init")).filter(|init| init.is("CallExpression")),
        };
        let Some(module) = declaration.and_then(import_module_name) else { return false };
        let Some(wanted) = property_identifier(Some(node)).map(name) else { return false };
        local_name(found) == wanted && is_testing_library_module(&module, self.setting.as_deref())
    }

    /// `isPotentialTestingLibraryFunction`: the name fits and, with a utils module set, the head of the chain was imported from one.
    pub fn potential(&self, node: Option<Node<'v>>, fits: impl Fn(&str, Option<&str>) -> bool) -> bool {
        let Some(node) = node else { return false };
        let Some(head) = property_identifier(Some(reference_node(node))) else { return false };
        let specifier = self.imported_util_specifier(head).filter(|specifier| specifier.is("ImportSpecifier"));
        let original = specifier.and_then(|specifier| {
            let imported = identifier_name(specifier.node("imported"))?;
            (specifier.node("local").map(name).as_deref() != Some(imported.as_str())).then_some(imported)
        });
        fits(&name(node), original.as_deref()) && (self.aggressive() || self.from_testing_library(head))
    }

    /// `isActUtil`'s second half: `act` imported from `react-dom/test-utils`.
    pub fn react_dom_act(&self, node: Node<'v>) -> bool {
        let Some(module) = self.react_dom else { return false };
        let Some(head) = property_identifier(Some(reference_node(node))) else { return false };
        let Some(found) = find_import_specifier(&name(node), module) else { return false };
        let declaration = match found.parent() {
            Some(parent) if parent.is("ImportDeclaration") => Some(parent),
            _ => closest_declarator(found).and_then(|declarator| declarator.node("init")).filter(|init| init.is("CallExpression")),
        };
        declaration.and_then(import_module_name).as_deref() == Some(REACT_DOM_TEST_UTILS) && local_name(found) == name(head)
    }

    pub fn is_kind_of_require(node: Node) -> bool {
        node.is("Identifier") && node.name().as_deref() == Some("require") && is_kind(node.parent(), "CallExpression")
    }
}
