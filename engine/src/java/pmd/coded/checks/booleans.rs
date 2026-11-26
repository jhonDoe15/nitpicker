//! An `if` whose branches return boolean values the condition already gives.
use crate::java::errorprone::tokens::{Tok, tokens};
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit_with;
use crate::java::types::model::Type;

const NEGATABLE: &[&str] = &["==", "!=", ">", "<", ">=", "<="];
const PRIMARY: &[&str] = &[
    "AmbiguousName",
    "ArrayAllocation",
    "ClassLiteral",
    "PatternExpression",
    "SuperExpression",
    "ThisExpression",
    "TypeExpression",
    "StringLiteral",
    "NumericLiteral",
    "CharLiteral",
    "BooleanLiteral",
    "NullLiteral",
    "VariableAccess",
    "FieldAccess",
    "ArrayAccess",
    "MethodCall",
    "ConstructorCall",
    "MethodReference",
];
const OPERATORS_IN_ORDER: &[&str] = &[
    "||", "&&", "|", "^", "&", "==", "!=", "<=", ">=", ">", "<", "instanceof", "<<", ">>", ">>>", "+", "-", "*", "/", "%",
];

fn infix_with(ctx: &Ctx, id: u32, operators: &[&str]) -> bool {
    ctx.is(id, "InfixExpression") && operators.contains(&ctx.text(id, "Operator").as_str())
}

fn negation(ctx: &Ctx, id: u32) -> bool {
    ctx.is(id, "UnaryExpression") && ctx.text(id, "Operator") == "!"
}

fn literal(ctx: &Ctx, id: u32, value: Option<bool>) -> bool {
    ctx.is(id, "BooleanLiteral") && value.is_none_or(|value| ctx.flag(id, "True") == value)
}

fn needs_parens_negated(ctx: &Ctx, id: u32) -> bool {
    if PRIMARY.contains(&ctx.name(id))
        || ctx.is(id, "CastExpression")
        || ctx.flag(id, "Parenthesized")
        || infix_with(ctx, id, NEGATABLE)
        || negation(ctx, id)
    {
        return false;
    }
    if infix_with(ctx, id, &["||", "&&"]) {
        return ctx.kids(id).iter().any(|operand| needs_parens_negated(ctx, *operand));
    }
    true
}

fn fine_under(ctx: &Ctx, id: u32, operator: &str) -> bool {
    let from = OPERATORS_IN_ORDER.iter().position(|known| *known == operator).unwrap_or(0);
    PRIMARY.contains(&ctx.name(id))
        || matches!(ctx.name(id), "CastExpression" | "UnaryExpression")
        || ctx.flag(id, "Parenthesized")
        || infix_with(ctx, id, &OPERATORS_IN_ORDER[from + 1..])
}

fn token_texts<'f>(ctx: &'f Ctx, id: u32) -> Vec<&'f str> {
    let node = &ctx.tree.nodes[id as usize];
    tokens(&ctx.file.text, node.start, node.end)
        .into_iter()
        .filter(|token| token.kind != Tok::End)
        .map(|token| token.text)
        .collect()
}

fn same_tokens(ctx: &Ctx, one: Option<u32>, other: Option<u32>) -> bool {
    match (one, other) {
        (Some(one), Some(other)) => token_texts(ctx, one) == token_texts(ctx, other),
        _ => false,
    }
}

fn complements(ctx: &Ctx, one: u32, other: u32) -> bool {
    if negation(ctx, one) {
        return same_tokens(ctx, ctx.nth(one, 0), Some(other));
    }
    if negation(ctx, other) {
        return same_tokens(ctx, Some(one), ctx.nth(other, 0));
    }
    if !ctx.is(one, "InfixExpression") || !ctx.is(other, "InfixExpression") {
        return false;
    }
    let complement = match ctx.text(one, "Operator").as_str() {
        "||" => "&&",
        "&&" => "||",
        "==" => "!=",
        "!=" => "==",
        "<=" => ">",
        ">" => "<=",
        ">=" => "<",
        "<" => ">=",
        _ => return false,
    };
    let operator = ctx.text(other, "Operator");
    if operator != complement || !matches!(operator.as_str(), "==" | "!=") {
        return false;
    }
    let sides = |id: u32| (ctx.nth(id, 0), ctx.nth(id, 1));
    let ((left, right), (other_left, other_right)) = (sides(one), sides(other));
    same_tokens(ctx, left, other_left) && same_tokens(ctx, right, other_right)
}

fn return_value(ctx: &Ctx, node: Option<u32>) -> Option<u32> {
    let node = node?;
    match ctx.name(node) {
        "ReturnStatement" => ctx.nth(node, 0),
        "Block" if ctx.kids(node).len() == 1 => return_value(ctx, ctx.nth(node, 0)),
        _ => None,
    }
}

fn next_sibling(ctx: &Ctx, node: u32) -> Option<u32> {
    let siblings = ctx.kids(ctx.parent(node)?);
    let at = siblings.iter().position(|sibling| *sibling == node)?;
    siblings.get(at + 1).copied()
}

fn fix(ctx: &Ctx, condition: u32, then: u32, otherwise: u32) -> Option<&'static str> {
    let then_false = literal(ctx, then, Some(false));
    let then_true = literal(ctx, then, Some(true));
    let else_true = literal(ctx, otherwise, Some(true));
    let else_false = literal(ctx, otherwise, Some(false));
    if literal(ctx, then, None) && literal(ctx, otherwise, None) {
        return Some(if then_true && else_false {
            "return {condition};"
        } else if then_false && else_true {
            "return !{condition};"
        } else if then_true {
            "return true;"
        } else {
            "return false;"
        });
    }
    if (then_false || else_true) && needs_parens_negated(ctx, condition) {
        return None;
    }
    let operator = if then_false || else_false { "&&" } else { "||" };
    let branch = if then_false || then_true { otherwise } else { then };
    if !fine_under(ctx, condition, operator) || !fine_under(ctx, branch, operator) {
        return None;
    }
    Some(if then_true {
        "return {condition} || {elseBranch};"
    } else if then_false {
        "return !{condition} && {elseBranch};"
    } else if else_true {
        "return !{condition} || {thenBranch};"
    } else {
        "return {condition} && {thenBranch};"
    })
}

fn then_branch_if(ctx: &Ctx, statement: u32) -> Option<u32> {
    let parent = ctx.parent(statement)?;
    if ctx.is(parent, "IfStatement") {
        return (ctx.nth(parent, 1) == Some(statement)).then_some(parent);
    }
    let holder = ctx.parent(parent)?;
    let fits = ctx.is(parent, "Block")
        && ctx.kids(parent).len() == 1
        && ctx.is(holder, "IfStatement")
        && ctx.nth(holder, 1) == Some(parent);
    fits.then_some(holder)
}

/// PMD's type of a returned expression: an unresolved name or a negation still takes the boolean the context asks.
fn boolean_typed(ctx: &Ctx, expression: u32) -> bool {
    match ctx.type_of(expression) {
        Some(kind) => kind == Type::Primitive("boolean"),
        None => match ctx.name(expression) {
            "UnaryExpression" => ctx.text(expression, "Operator") == "!",
            "InfixExpression" => {
                matches!(ctx.text(expression, "Operator").as_str(), "==" | "!=" | "<" | ">" | "<=" | ">=" | "&&" | "||")
            }
            "VariableAccess" | "FieldAccess" | "AmbiguousName" | "ArrayAccess" => {
                let owner = ctx.enclosing(expression, &["MethodDeclaration", "LambdaExpression"]);
                owner.filter(|owner| ctx.is(*owner, "MethodDeclaration")).is_some_and(|method| {
                    ctx.kid(method, "PrimitiveType").is_some_and(|kind| ctx.text(kind, "Kind") == "boolean")
                })
            }
            _ => false,
        },
    }
}

pub fn simplify_boolean_returns(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &statement in ctx.all("ReturnStatement") {
        let Some(then) = ctx.nth(statement, 0) else { continue };
        if !boolean_typed(ctx, then) {
            continue;
        }
        let Some(found) = then_branch_if(ctx, statement) else { continue };
        let otherwise = if ctx.flag(found, "Else") {
            return_value(ctx, ctx.nth(found, 2))
        } else {
            return_value(ctx, next_sibling(ctx, found))
        };
        let (Some(otherwise), Some(condition)) = (otherwise, ctx.nth(found, 0)) else { continue };
        if literal(ctx, then, None) || literal(ctx, otherwise, None) {
            if let Some(fix) = fix(ctx, condition, then, otherwise) {
                out.push(hit_with(found, &[fix]));
            }
        } else if complements(ctx, then, otherwise) {
            out.push(hit_with(found, &["return {condition};"]));
        }
    }
}
