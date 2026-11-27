//! `constant-resolution.mts`, `skipped` of `io-origin.mts` and the node helpers the fan-out rules share, on the
//! ESTree view. `findVariable` is ESLint's: the name looked up along the scope chain at the node.
use crate::typescript::rules::support::scope::{Def, DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};

const MAX_RESOLVE_DEPTH: usize = 8;
const TYPE_WRAPPERS: [&str; 5] = ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion", "ChainExpression"];
const TYPE_ONLY_WRAPPERS: [&str; 4] = ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion"];
const FUNCTIONS: [&str; 3] = ["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"];

#[derive(Clone, Copy)]
pub struct Env<'s, 'a, 'v> {
    pub scopes: &'s Scopes<'a, 'v>,
    pub source: &'s str,
}

pub fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn unwrap_kinds<'v>(mut node: Node<'v>, kinds: &[&str]) -> Node<'v> {
    while kinds.contains(&node.kind()) {
        match node.node("expression") {
            Some(inner) => node = inner,
            None => break,
        }
    }
    node
}

/// `unwrapped` of `security-values.mts`.
pub fn unwrapped(node: Node) -> Node {
    unwrap_kinds(node, &TYPE_WRAPPERS)
}

/// `skipped`: type assertions, optional chains and `await` looked through.
pub fn skipped(node: Node) -> Node {
    let mut current = unwrapped(node);
    while current.is("AwaitExpression") {
        match current.node("argument") {
            Some(argument) => current = unwrapped(argument),
            None => break,
        }
    }
    current
}

pub fn is_function_node(node: Node) -> bool {
    FUNCTIONS.contains(&node.kind())
}

pub fn string_value(node: Option<Node>) -> Option<String> {
    let node = node?;
    if node.is("Literal") {
        return match node.get("value") {
            Value::Text(..) => node.text("value").map(|text| text.into_owned()),
            _ => None,
        };
    }
    if node.is("TemplateLiteral") && node.nodes("expressions").is_empty() {
        let quasi = node.nodes("quasis").into_iter().next()?;
        return match quasi.get("value") {
            Value::Node(index) => node.view.at(index).text("cooked").map(|text| text.into_owned()),
            _ => None,
        };
    }
    None
}

/// `memberName` of `security-values.mts`.
pub fn member_name(member: Node) -> Option<String> {
    let property = member.node("property");
    if !member.flag("computed") {
        return property.filter(|property| property.is("Identifier")).and_then(|property| name_of(Some(property)));
    }
    string_value(property)
}

/// `staticKey` of `security-values.mts`.
pub fn static_key(property: Node) -> Option<String> {
    if !property.is("Property") && !property.is("PropertyDefinition") {
        return None;
    }
    let key = property.node("key")?;
    if !property.flag("computed") && key.is("Identifier") {
        return name_of(Some(key));
    }
    if let Some(text) = string_value(Some(key)) {
        return Some(text);
    }
    if !key.is("Literal") {
        return None;
    }
    match key.get("value") {
        Value::Number(number) if number.fract() == 0.0 && number.abs() < 1e21 => Some(format!("{}", number as i128)),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        Value::Null if !key.has("regex") && !key.has("bigint") => Some("null".to_string()),
        _ => None,
    }
}

impl<'s, 'a, 'v> Env<'s, 'a, 'v> {
    /// `findVariable(context, node, name)?.defs`; `None` when no variable has the name.
    pub fn defs(&self, node: Node<'v>, name: &str) -> Option<Vec<Def<'v>>> {
        let symbol = self.scopes.variable_by_name(name, node.start())?;
        Some(self.scopes.defs(symbol))
    }

    /// Whether `findVariable` finds no definition: a global, or a name the file does not declare.
    pub fn undeclared(&self, node: Node<'v>, name: &str) -> bool {
        self.defs(node, name).is_none_or(|defs| defs.is_empty())
    }

    pub fn single_def(&self, identifier: Node<'v>) -> Option<Def<'v>> {
        let mut defs = self.defs(identifier, &identifier.name()?)?;
        if defs.len() == 1 { defs.pop() } else { None }
    }

    pub fn first_def(&self, identifier: Node<'v>) -> Option<Def<'v>> {
        self.defs(identifier, &identifier.name()?)?.into_iter().next()
    }

    pub fn text(&self, node: Node) -> &'s str {
        self.source.get(node.start() as usize..node.end() as usize).unwrap_or_default()
    }

    fn constant_initializer(&self, node: Node<'v>, depth: usize) -> Option<Node<'v>> {
        if !node.is("Identifier") || depth > MAX_RESOLVE_DEPTH {
            return None;
        }
        let definition = self.single_def(node).filter(is_const)?;
        definition.node.node("id").filter(|id| id.is("Identifier"))?;
        definition.node.node("init")
    }

    /// `resolveConstant`: `const` identifiers followed to their initializers, type assertions looked through.
    pub fn resolve_constant(&self, node: Option<Node<'v>>) -> Option<Node<'v>> {
        let mut chain = vec![unwrap_kinds(node?, &TYPE_ONLY_WRAPPERS)];
        let mut index = 0;
        while index < chain.len() {
            if let Some(next) = self.constant_initializer(chain[index], chain.len() - 1) {
                chain.push(unwrap_kinds(next, &TYPE_ONLY_WRAPPERS));
            }
            index += 1;
        }
        chain.last().copied()
    }

    /// `resolveFunction`: a function declared once, or a `const` holding a function.
    pub fn resolve_function(&self, node: Option<Node<'v>>) -> Option<Node<'v>> {
        let node = node.filter(|node| node.is("Identifier"))?;
        let definition = self.single_def(node)?;
        if definition.kind == DefKind::FunctionName {
            return Some(definition.node);
        }
        if is_const(&definition) {
            return definition.node.node("init").filter(|init| is_function_node(*init));
        }
        None
    }

    /// `constantNumber`.
    pub fn constant_number(&self, node: Option<Node<'v>>) -> Option<f64> {
        let entry = |node: Option<Node<'v>>, depth: usize, parent: Option<usize>| {
            let node = if depth > MAX_RESOLVE_DEPTH { None } else { self.resolve_constant(node) };
            (node, depth, parent)
        };
        let mut entries = vec![entry(node, 0, None)];
        let mut at = 0;
        while at < entries.len() {
            let depth = entries[at].1 + 1;
            for operand in operand_nodes(entries[at].0) {
                entries.push(entry(Some(operand), depth, Some(at)));
            }
            at += 1;
        }
        let mut values: Vec<Option<f64>> = vec![None; entries.len()];
        for at in (0..entries.len()).rev() {
            let operands: Vec<Option<f64>> = (0..entries.len()).filter(|index| entries[*index].2 == Some(at)).map(|index| values[index]).collect();
            values[at] = numeric_value(entries[at].0, &operands);
        }
        values[0]
    }
}

fn is_const(definition: &Def) -> bool {
    definition.kind == DefKind::Variable && definition.node.parent().and_then(|declaration| declaration.text("kind")).as_deref() == Some("const")
}

fn operand_nodes(node: Option<Node>) -> Vec<Node> {
    let Some(node) = node else { return Vec::new() };
    let operator = node.text("operator");
    if node.is("UnaryExpression") && matches!(operator.as_deref(), Some("-" | "+")) {
        return node.node("argument").into_iter().collect();
    }
    if node.is("BinaryExpression") && matches!(operator.as_deref(), Some("*" | "+" | "-" | "/")) {
        return node.node("left").into_iter().chain(node.node("right")).collect();
    }
    Vec::new()
}

fn numeric_value(node: Option<Node>, operands: &[Option<f64>]) -> Option<f64> {
    let node = node?;
    if node.is("Literal")
        && let Value::Number(value) = node.get("value")
    {
        return Some(value);
    }
    let numbers: Vec<f64> = operands.iter().flatten().copied().collect();
    let left = *numbers.first()?;
    if numbers.len() < operands.len() {
        return None;
    }
    if node.is("UnaryExpression") {
        return Some(if node.text("operator").as_deref() == Some("-") { -left } else { left });
    }
    let right = *numbers.get(1)?;
    if !node.is("BinaryExpression") {
        return None;
    }
    match node.text("operator").as_deref() {
        Some("*") => Some(left * right),
        Some("+") => Some(left + right),
        Some("-") => Some(left - right),
        Some("/") => Some(left / right),
        _ => None,
    }
}

/// `chainOf(node, parent)`: the node and its ancestors.
pub fn path_up(node: Node) -> Vec<Node> {
    std::iter::once(node).chain(node.ancestors()).collect()
}
