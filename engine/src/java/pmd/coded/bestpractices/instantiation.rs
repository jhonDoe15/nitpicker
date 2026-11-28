//! Best practices rules about creating values.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::{hit_saying, hit_with};

const WRAPPERS: &[&str] = &[
    "java.lang.Double",
    "java.lang.Float",
    "java.lang.Long",
    "java.lang.Integer",
    "java.lang.Short",
    "java.lang.Byte",
    "java.lang.Character",
];

fn boolean_arguments(ctx: &Ctx, call: u32, created: bool, out: &mut Vec<Hit>) {
    let arguments = ctx.arguments(call);
    let [only] = arguments.as_slice() else { return };
    let start = if created { "Do not use `new Boolean" } else { "Do not use `Boolean.valueOf" };
    let rest = match ctx.name(*only) {
        "StringLiteral" => match ctx.text(*only, "Image").as_str() {
            "\"true\"" => "(\"true\")`, prefer `Boolean.TRUE`",
            "\"false\"" => "(\"false\")`, prefer `Boolean.FALSE`",
            _ => "(\"...\")`, prefer `Boolean.valueOf`",
        },
        "BooleanLiteral" if ctx.flag(*only, "True") => "(true)`, prefer `Boolean.TRUE`",
        "BooleanLiteral" => "(false)`, prefer `Boolean.FALSE`",
        _ if created => "(...)`, prefer `Boolean.valueOf`",
        _ => return,
    };
    out.push(hit_saying(call, format!("{start}{rest}")));
}

pub fn primitive_wrapper_instantiation(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &call in ctx.all("ConstructorCall") {
        let Some(written) = ctx.kid(call, "ClassType") else { continue };
        if WRAPPERS.iter().any(|name| ctx.type_is(written, name)) {
            out.push(hit_with(call, &[&ctx.text(written, "SimpleName")]));
        } else if ctx.type_is(written, "java.lang.Boolean") {
            boolean_arguments(ctx, call, true, out);
        }
    }
    for &call in ctx.all("MethodCall") {
        if ctx.method_name(call) == "valueOf"
            && ctx.arguments(call).len() == 1
            && ctx.declaring(call).as_deref() == Some("java.lang.Boolean")
        {
            boolean_arguments(ctx, call, false, out);
        }
    }
}
