//! Performance rules about string builders and number instantiation.
use crate::java::pmd::coded::constants::{Const, const_value, folded_value, written};
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit;

const BUILDERS: [&str; 2] = ["java.lang.StringBuilder", "java.lang.StringBuffer"];

fn builder(ctx: &Ctx, id: u32) -> bool {
    BUILDERS.iter().any(|name| ctx.type_is_exactly(id, name))
}

/// PMD's `JavaRuleUtil.isStringBuilderCtorOrAppend`.
pub fn builder_ctor_or_append(ctx: &Ctx, id: u32) -> bool {
    match ctx.name(id) {
        "MethodCall" => ctx.method_name(id) == "append" && ctx.qualifier(id).is_some_and(|on| builder(ctx, on)),
        "ConstructorCall" => ctx.kid(id, "ClassType").is_some_and(|written| builder(ctx, written)),
        _ => false,
    }
}

/// PMD's `JavaAstUtils.isStringConcatExpr`.
pub fn string_concat(ctx: &Ctx, id: u32) -> bool {
    ctx.is(id, "InfixExpression") && ctx.text(id, "Operator") == "+" && ctx.type_is(id, "java.lang.String")
}

/// PMD's `JavaAstUtils.flattenOperands`.
pub fn operands(ctx: &Ctx, id: u32, out: &mut Vec<u32>) {
    if string_concat(ctx, id) {
        for kid in ctx.kids(id).to_vec() {
            operands(ctx, kid, out);
        }
    } else {
        out.push(id);
    }
}

pub fn inefficient_string_buffering(ctx: &Ctx, out: &mut Vec<Hit>) {
    for name in ["ConstructorCall", "MethodCall"] {
        for &call in ctx.all(name) {
            if !builder_ctor_or_append(ctx, call) {
                continue;
            }
            let arguments = ctx.arguments(call);
            let [only] = arguments.as_slice() else { continue };
            if string_concat(ctx, *only) && matches!(folded_value(ctx, *only), Ok(None)) {
                out.push(hit(*only));
            }
        }
    }
}

pub fn inefficient_empty_string_check(ctx: &Ctx, out: &mut Vec<Hit>) {
    use crate::java::pmd::coded::bestpractices::calls::zero_checked;
    for &call in ctx.all("MethodCall") {
        let trimmed = ctx.qualifier(call).is_some_and(|on| {
            ctx.is(on, "MethodCall")
                && ctx.method_name(on) == "trim"
                && ctx.arguments(on).is_empty()
                && ctx.qualifier(on).is_some_and(|text| ctx.type_is(text, "java.lang.String"))
        });
        if !trimmed || !ctx.arguments(call).is_empty() {
            continue;
        }
        let name = ctx.method_name(call);
        if (name == "length" && zero_checked(ctx, call)) || name == "isEmpty" {
            out.push(hit(call));
        }
    }
}

pub fn big_integer_instantiation(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &call in ctx.all("ConstructorCall") {
        let arguments = ctx.arguments(call);
        let [only] = arguments.as_slice() else { continue };
        let value = const_value(ctx, *only).ok().flatten();
        let found = if ctx.type_is(call, "java.math.BigInteger") {
            matches!(&value, Some(Const::Text(text)) if matches!(text.as_str(), "0" | "1" | "10" | "2"))
        } else if ctx.type_is(call, "java.math.BigDecimal") {
            let shown = value.as_ref().and_then(written);
            shown.is_some_and(|shown| matches!(shown.as_str(), "0" | "0." | "1" | "10" | "2"))
        } else {
            false
        };
        if found {
            out.push(hit(call));
        }
    }
}
