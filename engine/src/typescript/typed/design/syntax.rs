//! Questions about one tree that need no types.
use crate::typescript::types::nodes::NodeTable;
use crate::typescript::types::tables::kind as K;

pub type T<'a> = &'a NodeTable;

pub fn is_type_node(kind: u32) -> bool {
    (K::FIRST_TYPE_NODE..=K::LAST_TYPE_NODE).contains(&kind)
        || matches!(
            kind,
            K::ANY_KEYWORD
                | K::UNKNOWN_KEYWORD
                | K::NUMBER_KEYWORD
                | K::BIG_INT_KEYWORD
                | K::OBJECT_KEYWORD
                | K::BOOLEAN_KEYWORD
                | K::STRING_KEYWORD
                | K::SYMBOL_KEYWORD
                | K::VOID_KEYWORD
                | K::UNDEFINED_KEYWORD
                | K::NEVER_KEYWORD
                | K::INTRINSIC_KEYWORD
                | K::EXPRESSION_WITH_TYPE_ARGUMENTS
                | K::JS_DOC_ALL_TYPE
                | K::JS_DOC_NULLABLE_TYPE
                | K::JS_DOC_NON_NULLABLE_TYPE
                | K::JS_DOC_OPTIONAL_TYPE
                | K::JS_DOC_VARIADIC_TYPE
        )
}

pub fn is_wrapper(kind: u32) -> bool {
    matches!(kind, K::PARENTHESIZED_EXPRESSION | K::NON_NULL_EXPRESSION | K::AS_EXPRESSION | K::SATISFIES_EXPRESSION | K::TYPE_ASSERTION_EXPRESSION)
}

pub fn expression(t: T, node: u32) -> Option<u32> {
    t.child(node, "expression")
}

pub fn unwrap(t: T, mut node: u32) -> u32 {
    while is_wrapper(t.kind(node)) {
        match expression(t, node) {
            Some(inner) => node = inner,
            None => break,
        }
    }
    node
}

pub fn is_value_wrapper(t: T, parent: u32, child: u32) -> bool {
    (is_wrapper(t.kind(parent)) || t.kind(parent) == K::AWAIT_EXPRESSION) && expression(t, parent) == Some(child)
}

pub fn unwrap_value(t: T, node: u32) -> u32 {
    let mut current = unwrap(t, node);
    while t.kind(current) == K::AWAIT_EXPRESSION {
        match expression(t, current) {
            Some(inner) => current = unwrap(t, inner),
            None => break,
        }
    }
    current
}

pub fn line_of(t: T, node: u32) -> u32 {
    t.source().line_of(t.start(node))
}

pub fn text(t: T, node: u32) -> String {
    t.node_text(node).to_string()
}

pub fn is_closure(kind: u32) -> bool {
    matches!(kind, K::ARROW_FUNCTION | K::FUNCTION_EXPRESSION | K::FUNCTION_DECLARATION | K::METHOD_DECLARATION | K::CONSTRUCTOR | K::GET_ACCESSOR | K::SET_ACCESSOR)
}

pub fn is_class_like(kind: u32) -> bool {
    matches!(kind, K::CLASS_DECLARATION | K::CLASS_EXPRESSION)
}

fn children_of(t: T, node: u32) -> Vec<u32> {
    t.children(node).filter(|child| !is_type_node(t.kind(*child))).collect()
}

/// Nodes in source order, parents first, through `children`; the root is included.
pub fn depth_first(root: u32, mut children: impl FnMut(u32) -> Vec<u32>) -> Vec<u32> {
    let mut pending = vec![root];
    let mut nodes = Vec::new();
    while let Some(node) = pending.pop() {
        nodes.push(node);
        pending.extend(children(node).into_iter().rev());
    }
    nodes
}

pub fn descendants(t: T, root: u32) -> Vec<u32> {
    depth_first(root, |node| children_of(t, node)).into_iter().skip(1).collect()
}

pub fn outside_closures(t: T, root: u32) -> Vec<u32> {
    depth_first(root, |node| if node != root && is_closure(t.kind(node)) { Vec::new() } else { children_of(t, node) })
        .into_iter()
        .filter(|node| *node != root && !is_closure(t.kind(*node)))
        .collect()
}

pub fn is_assignment_operator(kind: u32) -> bool {
    matches!(
        kind,
        K::EQUALS_TOKEN
            | K::PLUS_EQUALS_TOKEN
            | K::MINUS_EQUALS_TOKEN
            | K::ASTERISK_EQUALS_TOKEN
            | K::SLASH_EQUALS_TOKEN
            | K::PERCENT_EQUALS_TOKEN
            | K::BAR_BAR_EQUALS_TOKEN
            | K::AMPERSAND_AMPERSAND_EQUALS_TOKEN
            | K::QUESTION_QUESTION_EQUALS_TOKEN
            | K::BAR_EQUALS_TOKEN
            | K::AMPERSAND_EQUALS_TOKEN
            | K::CARET_EQUALS_TOKEN
    )
}

pub fn operator_token(t: T, binary: u32) -> u32 {
    t.child(binary, "operatorToken").map_or(K::UNKNOWN, |token| t.kind(token))
}

/// The operator of a prefix or postfix expression.
pub fn unary_operator(t: T, node: u32) -> u32 {
    if t.kind(node) == K::POSTFIX_UNARY_EXPRESSION {
        return if t.data_bit(node, 24) { K::MINUS_MINUS_TOKEN } else { K::PLUS_PLUS_TOKEN };
    }
    match t.data_bits(node, 24, 7) {
        1 => K::MINUS_TOKEN,
        2 => K::TILDE_TOKEN,
        3 => K::EXCLAMATION_TOKEN,
        4 => K::PLUS_PLUS_TOKEN,
        5 => K::MINUS_MINUS_TOKEN,
        _ => K::PLUS_TOKEN,
    }
}

pub fn is_step(t: T, node: u32) -> bool {
    matches!(t.kind(node), K::PREFIX_UNARY_EXPRESSION | K::POSTFIX_UNARY_EXPRESSION) && matches!(unary_operator(t, node), K::PLUS_PLUS_TOKEN | K::MINUS_MINUS_TOKEN)
}

pub fn is_write(t: T, node: u32) -> bool {
    let Some(parent) = t.parent(node) else { return false };
    if t.kind(parent) == K::BINARY_EXPRESSION {
        return t.child(parent, "left") == Some(node) && is_assignment_operator(operator_token(t, parent));
    }
    is_step(t, parent) || t.kind(parent) == K::DELETE_EXPRESSION
}

pub fn is_plain_assignment(t: T, node: u32) -> bool {
    t.parent(node).is_some_and(|parent| t.kind(parent) == K::BINARY_EXPRESSION && t.child(parent, "left") == Some(node) && operator_token(t, parent) == K::EQUALS_TOKEN)
}

pub fn enclosing_closure(t: T, node: u32) -> Option<u32> {
    let mut current = t.parent(node)?;
    loop {
        if is_closure(t.kind(current)) {
            return Some(current);
        }
        current = t.parent(current)?;
    }
}

pub fn this_owner(t: T, node: u32) -> Option<u32> {
    let mut found = enclosing_closure(t, node)?;
    while t.kind(found) == K::ARROW_FUNCTION {
        found = enclosing_closure(t, found)?;
    }
    Some(found)
}

pub fn name_of(t: T, node: u32) -> Option<u32> {
    t.child(node, "name")
}

pub fn member_name(t: T, node: u32) -> Option<String> {
    let name = name_of(t, node)?;
    if t.kind(name) == K::COMPUTED_PROPERTY_NAME {
        return Some(format!("[{}]", expression(t, name).map(|inner| text(t, inner)).unwrap_or_default()));
    }
    Some(text(t, name))
}

pub fn is_string_literal_like(kind: u32) -> bool {
    matches!(kind, K::STRING_LITERAL | K::NO_SUBSTITUTION_TEMPLATE_LITERAL)
}

pub fn own_text(t: T, node: u32) -> String {
    t.text(node).map(|text| text.into_owned()).unwrap_or_default()
}

pub fn static_name(t: T, node: u32) -> Option<String> {
    let kind = t.kind(node);
    (matches!(kind, K::IDENTIFIER | K::PRIVATE_IDENTIFIER | K::NUMERIC_LITERAL) || is_string_literal_like(kind)).then(|| own_text(t, node))
}

pub fn accessed_name(t: T, node: u32) -> Option<String> {
    match t.kind(node) {
        K::PROPERTY_ACCESS_EXPRESSION => name_of(t, node).map(|name| own_text(t, name)),
        K::ELEMENT_ACCESS_EXPRESSION => t.child(node, "argumentExpression").filter(|argument| is_string_literal_like(t.kind(*argument))).map(|argument| own_text(t, argument)),
        _ => None,
    }
}

pub fn is_access(kind: u32) -> bool {
    matches!(kind, K::PROPERTY_ACCESS_EXPRESSION | K::ELEMENT_ACCESS_EXPRESSION)
}

/// The `extends` and `implements` clauses of a class or interface, with whether each is `implements`.
pub fn heritage_clauses(t: T, node: u32) -> Vec<(bool, Vec<u32>)> {
    if !(is_class_like(t.kind(node)) || t.kind(node) == K::INTERFACE_DECLARATION) {
        return Vec::new();
    }
    t.listed(node, "heritageClauses").into_iter().map(|clause| (t.data_bit(clause, 24), t.listed(clause, "types"))).collect()
}

pub fn declared_type_of(t: T, declaration: u32) -> Option<u32> {
    matches!(t.kind(declaration), K::PARAMETER | K::VARIABLE_DECLARATION | K::PROPERTY_DECLARATION | K::PROPERTY_SIGNATURE).then(|| t.child(declaration, "type")).flatten()
}

pub fn is_function_expression(kind: u32) -> bool {
    matches!(kind, K::ARROW_FUNCTION | K::FUNCTION_EXPRESSION)
}

pub fn is_function_value(t: T, node: Option<u32>) -> bool {
    node.is_some_and(|node| is_function_expression(t.kind(unwrap(t, node))))
}

/// The function a value is, looking through `memo(...)` and `forwardRef(...)`.
pub fn wrapped_function(t: T, node: Option<u32>) -> Option<u32> {
    let mut current = unwrap(t, node?);
    loop {
        let inner = (t.kind(current) == K::CALL_EXPRESSION)
            .then(|| expression(t, current))
            .flatten()
            .filter(|callee| matches!(t.node_text(*callee), "memo" | "forwardRef" | "React.memo" | "React.forwardRef"))
            .and_then(|_| t.listed(current, "arguments").first().copied());
        match inner {
            Some(argument) => current = unwrap(t, argument),
            None => break,
        }
    }
    is_function_expression(t.kind(current)).then_some(current)
}

pub fn has_modifier(t: T, node: u32, kind: u32) -> bool {
    t.has_modifier(node, kind)
}

pub fn is_hidden(t: T, member: u32) -> bool {
    name_of(t, member).is_some_and(|name| t.kind(name) == K::PRIVATE_IDENTIFIER) || has_modifier(t, member, K::PRIVATE_KEYWORD) || has_modifier(t, member, K::PROTECTED_KEYWORD)
}

/// Parameters without a leading `this`.
pub fn declared_parameters(t: T, node: u32) -> Vec<u32> {
    t.listed(node, "parameters")
        .into_iter()
        .filter(|parameter| !name_of(t, *parameter).is_some_and(|name| t.kind(name) == K::IDENTIFIER && own_text(t, name) == "this"))
        .collect()
}

pub fn is_statement(kind: u32) -> bool {
    matches!(kind, K::BLOCK | K::EMPTY_STATEMENT) || (K::FIRST_STATEMENT..=K::LAST_STATEMENT).contains(&kind)
}
