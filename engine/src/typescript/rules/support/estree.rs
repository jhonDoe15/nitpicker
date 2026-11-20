use crate::typescript::rules::Context;
use oxc_ast::AstKind;
use oxc_ast::ast::{Expression, PropertyKey};
use oxc_semantic::{AstNode, NodeId, SymbolId};
use oxc_span::{GetSpan, Span};

/// The parent as ESTree has it: parentheses are not nodes there.
pub fn parent<'a, 's>(context: &'s Context<'a, '_>, id: NodeId) -> &'s AstNode<'a> {
    let nodes = context.semantic.nodes();
    let mut found = nodes.parent_node(id);
    while matches!(found.kind(), AstKind::ParenthesizedExpression(_)) {
        found = nodes.parent_node(found.id());
    }
    found
}

pub fn is_assertion_wrapper(kind: AstKind) -> bool {
    matches!(
        kind,
        AstKind::TSAsExpression(_) | AstKind::TSSatisfiesExpression(_) | AstKind::TSTypeAssertion(_) | AstKind::TSNonNullExpression(_)
    )
}

/// The outermost `as`, `satisfies`, `<T>` or `!` around a node, or the node itself.
pub fn wrapper_top(context: &Context, mut id: NodeId) -> NodeId {
    loop {
        let above = parent(context, id);
        if !is_assertion_wrapper(above.kind()) {
            return id;
        }
        id = above.id();
    }
}

pub fn expression_id(expression: &Expression) -> NodeId {
    expression.without_parentheses().node_id()
}

/// A member access of any of the three oxc shapes, as the one ESTree `MemberExpression`.
pub struct Member<'a> {
    pub id: NodeId,
    pub span: Span,
    pub object: &'a Expression<'a>,
    /// `staticName` of the ESLint helpers: the identifier after the dot, or a literal in brackets as text.
    pub name: Option<String>,
    pub property: Span,
}

pub fn literal_text(expression: &Expression) -> Option<String> {
    match expression {
        Expression::StringLiteral(literal) => literal.value.as_str().map(String::from),
        Expression::NumericLiteral(literal) if literal.value.fract() == 0.0 && literal.value.abs() < 1e21 => Some(format!("{}", literal.value as i128)),
        Expression::NumericLiteral(literal) => Some(literal.value.to_string()),
        Expression::BooleanLiteral(literal) => Some(literal.value.to_string()),
        Expression::NullLiteral(_) => Some("null".to_string()),
        _ => None,
    }
}

pub fn member<'a>(kind: AstKind<'a>) -> Option<Member<'a>> {
    match kind {
        AstKind::StaticMemberExpression(found) => Some(Member {
            id: found.node_id(),
            span: found.span,
            object: &found.object,
            name: Some(found.property.name.to_string()),
            property: found.property.span,
        }),
        AstKind::ComputedMemberExpression(found) => Some(Member {
            id: found.node_id(),
            span: found.span,
            object: &found.object,
            name: literal_text(found.expression.without_parentheses()),
            property: found.expression.without_parentheses().span(),
        }),
        AstKind::PrivateFieldExpression(found) => {
            Some(Member { id: found.node_id(), span: found.span, object: &found.object, name: None, property: found.field.span })
        }
        _ => None,
    }
}

pub fn member_of<'a>(expression: &'a Expression<'a>) -> Option<Member<'a>> {
    match expression {
        Expression::StaticMemberExpression(found) => member(AstKind::StaticMemberExpression(found)),
        Expression::ComputedMemberExpression(found) => member(AstKind::ComputedMemberExpression(found)),
        Expression::PrivateFieldExpression(found) => member(AstKind::PrivateFieldExpression(found)),
        _ => None,
    }
}

/// `stringValue` of the ESLint helpers: a string literal or a template without placeholders.
pub fn string_value(expression: &Expression) -> Option<String> {
    match expression {
        Expression::StringLiteral(literal) => literal.value.as_str().map(String::from),
        Expression::TemplateLiteral(template) if template.expressions.is_empty() => {
            template.quasis.first().and_then(|quasi| quasi.value.cooked.as_ref()).and_then(|cooked| cooked.as_str()).map(String::from)
        }
        _ => None,
    }
}

/// `propertyName` of the ESLint helpers, for a key of a pattern or object property.
pub fn key_name(key: &PropertyKey, computed: bool) -> Option<String> {
    match key {
        PropertyKey::StaticIdentifier(name) if !computed => Some(name.name.to_string()),
        PropertyKey::StaticIdentifier(_) | PropertyKey::PrivateIdentifier(_) => None,
        other => other.as_expression().and_then(|expression| string_value(expression.without_parentheses())),
    }
}

/// The variable an identifier in expression position resolves to.
pub fn symbol_of(context: &Context, expression: &Expression) -> Option<SymbolId> {
    match expression {
        Expression::Identifier(identifier) => context.semantic.scoping().get_reference(identifier.reference_id()).symbol_id(),
        _ => None,
    }
}

/// The initializer when the variable has one definition, `<name> = <init>` in a variable declaration.
pub fn single_initializer<'a>(context: &Context<'a, '_>, symbol: SymbolId) -> Option<&'a Expression<'a>> {
    let scoping = context.semantic.scoping();
    if !scoping.symbol_redeclarations(symbol).is_empty() {
        return None;
    }
    match context.semantic.nodes().kind(scoping.symbol_declaration(symbol)) {
        AstKind::VariableDeclarator(declarator) if declarator.id.is_binding_identifier() => declarator.init.as_ref(),
        _ => None,
    }
}
