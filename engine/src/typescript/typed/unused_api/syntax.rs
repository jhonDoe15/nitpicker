//! The parts of the unused API check that only read the tree: which top-level functions are candidates, which
//! parameter is the options bag, and which names a call site passes.
use crate::typescript::types::nodes::NodeTable;
use crate::typescript::types::tables::kind as K;
use regex::Regex;
use serde::Serialize;
use std::sync::LazyLock;

static OPTIONS_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^(?:options?|opts?|config|configuration|settings|params|parameters|args)$").expect("pattern"));
static OPTIONS_TYPE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?:Options?|Opts|Config|Settings)$").expect("pattern"));

/// The names a call passes, or `all` when it passes something the check cannot list.
#[derive(Serialize, Clone, Default, Debug, PartialEq)]
pub struct Passes {
    pub all: bool,
    pub names: Vec<String>,
}

impl Passes {
    pub fn everything() -> Passes {
        Passes { all: true, names: Vec::new() }
    }
    pub fn add(&mut self, name: &str) {
        if !self.names.iter().any(|known| known == name) {
            self.names.push(name.to_string());
        }
    }
}

pub struct Candidate {
    pub name: String,
    pub function: u32,
    /// The function declaration's name to ask the compiler for its declarations, or the nodes themselves.
    pub key: Key,
}

pub enum Key {
    DeclarationsOf { name: Option<u32>, statement: u32 },
    Nodes(Vec<u32>),
}

pub fn text(table: &NodeTable, node: u32) -> String {
    table.text(node).map(|text| text.into_owned()).unwrap_or_default()
}

fn is_function_expression(table: &NodeTable, node: u32) -> bool {
    matches!(table.kind(node), K::ARROW_FUNCTION | K::FUNCTION_EXPRESSION)
}

pub fn is_string_literal_like(table: &NodeTable, node: u32) -> bool {
    matches!(table.kind(node), K::STRING_LITERAL | K::NO_SUBSTITUTION_TEMPLATE_LITERAL)
}

/// The expression inside parentheses, casts, `satisfies` and `!`.
pub fn unwrap_expression(table: &NodeTable, mut node: u32) -> u32 {
    loop {
        let wraps = matches!(
            table.kind(node),
            K::PARENTHESIZED_EXPRESSION | K::AS_EXPRESSION | K::SATISFIES_EXPRESSION | K::NON_NULL_EXPRESSION | K::TYPE_ASSERTION_EXPRESSION
        );
        match table.child(node, "expression").filter(|_| wraps) {
            Some(inner) => node = inner,
            None => return node,
        }
    }
}

pub fn callee_name(table: &NodeTable, callee: u32) -> Option<String> {
    match table.kind(callee) {
        K::IDENTIFIER => Some(text(table, callee)),
        K::PROPERTY_ACCESS_EXPRESSION => table.child(callee, "name").map(|name| text(table, name)),
        _ => None,
    }
}

/// `memo(...)` and `forwardRef(...)`, also as members (`React.memo`).
pub fn is_wrapper_call(table: &NodeTable, node: u32) -> bool {
    table.kind(node) == K::CALL_EXPRESSION
        && table.child(node, "expression").and_then(|callee| callee_name(table, callee)).is_some_and(|name| name == "memo" || name == "forwardRef")
}

fn unwrap_component(table: &NodeTable, expression: u32) -> u32 {
    let mut node = unwrap_expression(table, expression);
    while is_wrapper_call(table, node) {
        match table.listed(node, "arguments").first() {
            Some(first) => node = unwrap_expression(table, *first),
            None => break,
        }
    }
    node
}

pub fn candidates_of(table: &NodeTable, root: u32) -> Vec<Candidate> {
    let mut candidates = Vec::new();
    for statement in table.listed(root, "statements") {
        match table.kind(statement) {
            K::FUNCTION_DECLARATION => {
                if table.child(statement, "body").is_none() {
                    continue;
                }
                let name = table.child(statement, "name");
                candidates.push(Candidate {
                    name: name.map_or_else(|| "default".to_string(), |name| text(table, name)),
                    function: statement,
                    key: Key::DeclarationsOf { name, statement },
                });
            }
            K::VARIABLE_STATEMENT => {
                let list = table.child(statement, "declarationList");
                for declaration in list.map(|list| table.listed(list, "declarations")).unwrap_or_default() {
                    let function = table.child(declaration, "initializer").map(|initializer| unwrap_component(table, initializer));
                    let name = table.child(declaration, "name").filter(|name| table.kind(*name) == K::IDENTIFIER);
                    if let (Some(name), Some(function)) = (name, function.filter(|function| is_function_expression(table, *function))) {
                        candidates.push(Candidate { name: text(table, name), function, key: Key::Nodes(vec![declaration]) });
                    }
                }
            }
            K::EXPORT_ASSIGNMENT => {
                let function = table.child(statement, "expression").map(|expression| unwrap_component(table, expression));
                // Bit 24 of an export assignment is `export =`.
                if let Some(function) = function.filter(|function| is_function_expression(table, *function) && !table.data_bit(statement, 24)) {
                    candidates.push(Candidate { name: "default".to_string(), function, key: Key::Nodes(vec![statement]) });
                }
            }
            _ => {}
        }
    }
    candidates
}

fn reference_name(table: &NodeTable, type_node: Option<u32>) -> Option<String> {
    let type_node = type_node.filter(|node| table.kind(*node) == K::TYPE_REFERENCE)?;
    let name = table.child(type_node, "typeName")?;
    if table.kind(name) == K::IDENTIFIER { Some(text(table, name)) } else { table.child(name, "right").map(|right| text(table, right)) }
}

pub fn is_options_parameter(table: &NodeTable, parameter: u32) -> bool {
    let name = table.child(parameter, "name");
    if name.is_some_and(|name| table.kind(name) == K::OBJECT_BINDING_PATTERN) {
        return true;
    }
    if name.is_some_and(|name| table.kind(name) == K::IDENTIFIER && OPTIONS_NAME.is_match(&text(table, name))) {
        return true;
    }
    OPTIONS_TYPE.is_match(&reference_name(table, table.child(parameter, "type")).unwrap_or_default())
}

/// The elements of a destructured parameter by the name they read; none when a rest element takes the others.
pub fn binding_members(table: &NodeTable, parameter: u32) -> Vec<(String, u32)> {
    let Some(pattern) = table.child(parameter, "name").filter(|name| table.kind(*name) == K::OBJECT_BINDING_PATTERN) else {
        return Vec::new();
    };
    let elements = table.listed(pattern, "elements");
    if elements.iter().any(|element| table.child(*element, "dotDotDotToken").is_some()) {
        return Vec::new();
    }
    let mut members: Vec<(String, u32)> = Vec::new();
    for element in elements {
        let name = table.child(element, "propertyName").or_else(|| table.child(element, "name"));
        if let Some(name) = name.filter(|name| table.kind(*name) == K::IDENTIFIER) {
            let name = text(table, name);
            match members.iter_mut().find(|(known, _)| *known == name) {
                Some(entry) => entry.1 = element,
                None => members.push((name, element)),
            }
        }
    }
    members
}

pub fn is_component_candidate(name: &str, file_name: &str, react: bool) -> bool {
    react && file_name.ends_with(".tsx") && (name == "default" || name.chars().next().is_some_and(|first| first.is_ascii_uppercase()))
}

fn literal_key_name(table: &NodeTable, name: u32) -> Option<String> {
    match table.kind(name) {
        K::IDENTIFIER | K::STRING_LITERAL | K::NO_SUBSTITUTION_TEMPLATE_LITERAL | K::NUMERIC_LITERAL => Some(text(table, name)),
        K::COMPUTED_PROPERTY_NAME => {
            let computed = unwrap_expression(table, table.child(name, "expression")?);
            is_string_literal_like(table, computed).then(|| text(table, computed))
        }
        _ => None,
    }
}

fn is_property_name(kind: u32) -> bool {
    matches!(kind, K::IDENTIFIER | K::PRIVATE_IDENTIFIER | K::STRING_LITERAL | K::NUMERIC_LITERAL | K::COMPUTED_PROPERTY_NAME)
}

fn add_property(table: &NodeTable, property: u32, passes: &mut Passes) {
    if table.kind(property) == K::SPREAD_ASSIGNMENT {
        match table.child(property, "expression") {
            Some(expression) => add_expression(table, expression, passes),
            None => passes.all = true,
        }
        return;
    }
    let name = table.child(property, "name").filter(|name| is_property_name(table.kind(*name)));
    match name.and_then(|name| literal_key_name(table, name)) {
        Some(key) => passes.add(&key),
        None => passes.all = true,
    }
}

fn add_expression(table: &NodeTable, expression: u32, passes: &mut Passes) {
    let value = unwrap_expression(table, expression);
    if table.kind(value) == K::OBJECT_LITERAL_EXPRESSION {
        for property in table.listed(value, "properties") {
            add_property(table, property, passes);
        }
    } else {
        passes.all = true;
    }
}

pub fn object_passes(table: &NodeTable, expression: u32) -> Passes {
    let mut passes = Passes::default();
    add_expression(table, expression, &mut passes);
    passes
}

pub fn jsx_passes(table: &NodeTable, opening: u32) -> Passes {
    let mut passes = Passes::default();
    let attributes = table.child(opening, "attributes").map(|attributes| table.listed(attributes, "properties")).unwrap_or_default();
    for attribute in attributes {
        if table.kind(attribute) == K::JSX_SPREAD_ATTRIBUTE {
            match table.child(attribute, "expression") {
                Some(expression) => add_expression(table, expression, &mut passes),
                None => passes.all = true,
            }
        } else if let Some(name) = table.child(attribute, "name") {
            passes.add(table.node_text(name));
        }
    }
    let element = table.parent(opening).filter(|parent| table.kind(opening) == K::JSX_OPENING_ELEMENT && table.kind(*parent) == K::JSX_ELEMENT);
    // Bit 24 of a JSX text is "only white space".
    let has_children = element.is_some_and(|element| table.listed(element, "children").iter().any(|child| table.kind(*child) != K::JSX_TEXT || !table.data_bit(*child, 24)));
    if has_children {
        passes.add("children");
    }
    passes
}
