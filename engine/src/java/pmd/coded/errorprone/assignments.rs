//! Error prone rules about assignments and literals.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::{hit, hit_with};

fn final_target(ctx: &Ctx, target: u32) -> bool {
    if !matches!(ctx.name(target), "VariableAccess" | "FieldAccess") {
        return false;
    }
    match ctx.usages().declaration(target) {
        Some(variable) => ctx.flag(variable, "Final"),
        None => ctx.field_modifiers(target).is_some_and(|(_, last)| last),
    }
}

fn branch_of(ctx: &Ctx, ternary: u32, node: u32) -> bool {
    ctx.nth(ternary, 1) == Some(node) || ctx.nth(ternary, 2) == Some(node)
}

fn bad_ternary(ctx: &Ctx, ternary: u32, literal: u32) -> bool {
    let initializer = ctx
        .enclosing(ternary, &["VariableDeclarator"])
        .is_some_and(|declarator| ctx.nth(declarator, 1) == Some(ternary));
    let mut branch = branch_of(ctx, ternary, literal);
    let mut current = ternary;
    while let Some(parent) = ctx.parent(current).filter(|parent| ctx.is(*parent, "ConditionalExpression")) {
        branch &= branch_of(ctx, parent, current);
        current = parent;
    }
    let assignment = ctx.parent(current).is_some_and(|parent| ctx.is(parent, "AssignmentExpression"));
    branch && assignment && !initializer
}

pub fn null_assignment(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &literal in ctx.all("NullLiteral") {
        let Some(parent) = ctx.parent(literal) else { continue };
        match ctx.name(parent) {
            "AssignmentExpression" => {
                let to_final = ctx.nth(parent, 0).is_some_and(|target| final_target(ctx, target));
                if !to_final && ctx.nth(parent, 1) == Some(literal) {
                    out.push(hit(literal));
                }
            }
            "ConditionalExpression" if bad_ternary(ctx, parent, literal) => out.push(hit(literal)),
            _ => {}
        }
    }
}

fn checked_assignment(ctx: &Ctx, impure: u32, out: &mut Vec<Hit>) {
    let top = ctx.top_level_expression(impure);
    let Some(parent) = ctx.parent(top) else { return };
    let found = match ctx.name(parent) {
        "IfStatement" => !ctx.property_flag("allowIf", false),
        "WhileStatement" => !ctx.property_flag("allowWhile", false),
        "ForStatement" => condition_of_for(ctx, parent) == Some(top) && !ctx.property_flag("allowFor", false),
        _ => false,
    };
    if found {
        out.push(hit(impure));
    }
}

fn condition_of_for(ctx: &Ctx, statement: u32) -> Option<u32> {
    ctx.kids(statement).iter().copied().find(|kid| ctx.is_expression(*kid))
}

pub fn assignment_in_operand(ctx: &Ctx, out: &mut Vec<Hit>) {
    let all = ctx.property_flag("allowIf", false)
        && ctx.property_flag("allowFor", false)
        && ctx.property_flag("allowWhile", false)
        && ctx.property_flag("allowIncrementDecrement", false);
    if all {
        return;
    }
    let mut found = ctx.all("AssignmentExpression").to_vec();
    if !ctx.property_flag("allowIncrementDecrement", false) {
        found.extend(ctx.all("UnaryExpression").iter().copied().filter(|unary| {
            matches!(ctx.text(*unary, "Operator").as_str(), "++" | "--")
        }));
    }
    found.sort_unstable();
    for impure in found {
        checked_assignment(ctx, impure, out);
    }
}

fn octal(c: u8) -> bool {
    (b'0'..=b'7').contains(&c)
}

pub fn suspicious_octal_escape(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &literal in ctx.all("StringLiteral") {
        let image = ctx.text(literal, "Image");
        let chars: Vec<char> = image.chars().collect();
        if chars.len() < 2 {
            continue;
        }
        let inner = &chars[1..chars.len() - 1];
        let at = |index: usize| inner.get(index).copied();
        let mut offset = 0;
        while let Some(slash) = inner[offset.min(inner.len())..].iter().position(|c| *c == '\\').map(|at| at + offset) {
            if slash >= inner.len() - 1 {
                break;
            }
            let first = inner[slash + 1];
            offset = slash + 1;
            let is_octal = |c: Option<char>| c.is_some_and(|c| c.is_ascii() && octal(c as u8));
            let is_decimal = |c: Option<char>| c.is_some_and(|c| c.is_ascii_digit());
            if is_octal(Some(first)) {
                let (second, third, fourth) = (at(slash + 2), at(slash + 3), at(slash + 4));
                let shown = |parts: &[Option<char>], tail: Option<char>| {
                    let head: String = parts.iter().flatten().collect();
                    format!("\\{head} + {}", tail.unwrap_or_default())
                };
                if is_octal(second) {
                    if is_octal(third) {
                        if !matches!(first, '0'..='3') {
                            out.push(hit_with(literal, &[&shown(&[Some(first), second], third)]));
                        } else if is_decimal(fourth) {
                            out.push(hit_with(literal, &[&shown(&[Some(first), second, third], fourth)]));
                        }
                    } else if is_decimal(third) {
                        out.push(hit_with(literal, &[&shown(&[Some(first), second], third)]));
                    }
                } else if is_decimal(second) {
                    out.push(hit_with(literal, &[&shown(&[Some(first)], second)]));
                }
            } else if first == '\\' {
                offset += 1;
            }
        }
    }
}
