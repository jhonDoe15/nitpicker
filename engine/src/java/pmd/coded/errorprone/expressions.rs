//! Error prone rules about single expressions and statements.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::{hit, hit_with};

pub fn idempotent_operations(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &assignment in ctx.all("AssignmentExpression") {
        if ctx.text(assignment, "Operator") != "=" {
            continue;
        }
        if let (Some(left), Some(right)) = (ctx.nth(assignment, 0), ctx.nth(assignment, 1))
            && same_variable(ctx, left, right)
        {
            out.push(hit(assignment));
        }
    }
}

fn named_reference(ctx: &Ctx, id: u32) -> bool {
    matches!(ctx.name(id), "VariableAccess" | "FieldAccess")
}

fn this_field(ctx: &Ctx, id: u32) -> bool {
    ctx.is(id, "FieldAccess")
        && ctx
            .nth(id, 0)
            .is_some_and(|first| ctx.is(first, "ThisExpression") && ctx.kids(first).is_empty())
}

/// PMD's `JavaAstUtils.isReferenceToSameVar`.
pub fn same_variable(ctx: &Ctx, left: u32, right: u32) -> bool {
    if named_reference(ctx, left) && named_reference(ctx, right) {
        if ctx.text(left, "Name") != ctx.text(right, "Name") || !ctx.resolves(left) || !ctx.resolves(right) {
            return false;
        }
        let usages = ctx.usages();
        if usages.declaration(left) != usages.declaration(right) {
            return false;
        }
        if ctx.name(left) != ctx.name(right) {
            return this_field(ctx, left) || this_field(ctx, right);
        }
        if ctx.is(left, "FieldAccess") {
            return match (ctx.nth(left, 0), ctx.nth(right, 0)) {
                (Some(one), Some(two)) => same_variable(ctx, one, two),
                _ => false,
            };
        }
        return true;
    }
    if ctx.is(left, "ThisExpression") || ctx.is(right, "ThisExpression") {
        return ctx.name(left) == ctx.name(right);
    }
    false
}

pub fn check_skip_result(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &call in ctx.all("MethodCall") {
        let unused = ctx
            .parent(call)
            .is_some_and(|parent| ctx.is(parent, "ExpressionStatement"));
        if unused && ctx.method_name(call) == "skip" && ctx.matches_sig(call, "java.io.InputStream#skip(long)") {
            out.push(hit(call));
        }
    }
}

pub fn avoid_using_octal_values(ctx: &Ctx, out: &mut Vec<Hit>) {
    let strict = ctx.property_flag("strict", false);
    for &literal in ctx.all("NumericLiteral") {
        let image = numeric_token(ctx, literal);
        if !octal(&image) {
            continue;
        }
        let digits: String = image[1..].trim_end_matches(['l', 'L']).replace('_', "");
        let small = u64::from_str_radix(&digits, 8).is_ok_and(|value| value <= 7) || digits.is_empty();
        if strict || !small {
            out.push(hit(literal));
        }
    }
}

/// The whole token of a numeric literal: the grammar ends some literals early, as `012` of `012d` or `0` of `0_12`.
fn numeric_token(ctx: &Ctx, literal: u32) -> String {
    let text = &ctx.file.text[ctx.tree.nodes[literal as usize].start..];
    let mut previous = ' ';
    let end = text
        .char_indices()
        .find(|(_, next)| {
            let exponent = matches!(*next, '+' | '-') && matches!(previous, 'e' | 'E' | 'p' | 'P');
            previous = *next;
            !(next.is_ascii_alphanumeric() || matches!(*next, '_' | '.') || exponent)
        })
        .map_or(text.len(), |(at, _)| at);
    text[..end].to_string()
}

/// PMD's `getBase() == 8`: a literal of a whole number that starts with `0` and is longer than that.
fn octal(image: &str) -> bool {
    let bytes = image.as_bytes();
    let lower = image.to_ascii_lowercase();
    let decimal_real = lower.contains(['.', 'e']) || lower.ends_with(['f', 'd']);
    bytes.len() > 1 && bytes[0] == b'0' && !matches!(bytes[1], b'x' | b'X' | b'b' | b'B') && !decimal_real
}

fn case_change(ctx: &Ctx, id: u32) -> bool {
    ctx.is(id, "MethodCall")
        && matches!(ctx.method_name(id).as_str(), "toLowerCase" | "toUpperCase")
        && ctx.arguments(id).is_empty()
}

pub fn unnecessary_case_change(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &call in ctx.all("MethodCall") {
        if !matches!(ctx.method_name(call).as_str(), "equals" | "equalsIgnoreCase") {
            continue;
        }
        let arguments = ctx.arguments(call);
        if arguments.len() == 1
            && (ctx.qualifier(call).is_some_and(|on| case_change(ctx, on)) || case_change(ctx, arguments[0]))
        {
            out.push(hit(call));
        }
    }
}

pub fn useless_operation_on_immutable(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &call in ctx.all("MethodCall") {
        let Some(qualifier) = ctx.qualifier(call) else { continue };
        if !ctx
            .parent(call)
            .is_some_and(|parent| ctx.is(parent, "ExpressionStatement"))
        {
            continue;
        }
        if matches!(
            ctx.type_of(call),
            Some(crate::java::types::model::Type::Primitive("void"))
        ) {
            continue;
        }
        let string = ctx.type_is(qualifier, "java.lang.String");
        let flagged = (string && ctx.method_name(call) != "getChars")
            || (!string
                && [
                    "java.math.BigDecimal",
                    "java.math.BigInteger",
                    "java.time.temporal.Temporal",
                    "java.time.Duration",
                    "java.time.Period",
                ]
                .iter()
                .any(|name| ctx.type_is(qualifier, name)));
        if flagged {
            out.push(hit(call));
        }
    }
}

pub fn assignment_to_non_final_static(ctx: &Ctx, out: &mut Vec<Hit>) {
    for name in ["VariableAccess", "FieldAccess"] {
        for &access in ctx.all(name) {
            if ctx.text(access, "AccessType") != "WRITE" || ctx.enclosing(access, &["ConstructorDeclaration"]).is_none()
            {
                continue;
            }
            if let Some((is_static, is_final)) = ctx.field_modifiers(access)
                && is_static
                && !is_final
            {
                out.push(hit_with(access, &[&ctx.text(access, "Name")]));
            }
        }
    }
    out.sort_by_key(|found| found.node);
}
