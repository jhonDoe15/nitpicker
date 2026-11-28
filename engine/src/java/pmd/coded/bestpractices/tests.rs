//! Best practices rules about test methods.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit;

const EXPECTED_EXCEPTION: &str = "org.junit.rules.ExpectedException";
const SOFT_ASSERTIONS: &[&str] = &[
    "org.assertj.core.api.StandardSoftAssertionsProvider",
    "org.assertj.core.api.Java6StandardSoftAssertionsProvider",
    "org.assertj.core.api.AbstractSoftAssertions",
];

fn fail_statement(ctx: &Ctx, statement: u32) -> bool {
    ctx.nth(statement, 0).is_some_and(|call| ctx.is(call, "MethodCall") && ctx.method_name(call) == "fail")
}

fn weird_try(ctx: &Ctx, statement: u32) -> bool {
    let last = ctx.kid(statement, "Block").and_then(|body| ctx.kids(body).last().copied());
    let throws = last.is_some_and(|last| {
        ctx.is(last, "ThrowStatement") || (ctx.is(last, "ExpressionStatement") && fail_statement(ctx, last))
    });
    throws
        && ctx.kids_named(statement, "CatchClause").any(|clause| {
            ctx.kid(clause, "Block").is_some_and(|body| ctx.kids(body).is_empty())
        })
}

pub fn junit_use_expected(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &method in ctx.all("MethodDeclaration") {
        let Some(body) = ctx.kid(method, "Block") else { continue };
        if !ctx.is_junit_method(method) {
            continue;
        }
        for statement in ctx.descendants(body) {
            if ctx.is(statement, "TryStatement") && weird_try(ctx, statement) {
                out.push(hit(statement));
            }
        }
    }
}

fn declared_in(ctx: &Ctx, call: u32, names: &[&str]) -> bool {
    let index = ctx.machine.resolver.index;
    ctx.declaring(call).is_some_and(|declaring| names.iter().any(|name| index.is_subtype(&declaring, name)))
}

fn soft_assert(ctx: &Ctx, call: u32) -> bool {
    declared_in(ctx, call, SOFT_ASSERTIONS)
}

fn probable_assert(ctx: &Ctx, call: u32) -> bool {
    let name = ctx.method_name(call);
    let soft = soft_assert(ctx, call);
    (name.starts_with("assert") && !soft)
        || ((name == "assertAll" || name == "assertSoftly") && soft)
        || name.starts_with("check")
        || name.starts_with("verify")
        || name == "fail"
        || name == "failWith"
        || (name == "expect" && ctx.qualifier(call).is_some_and(|on| ctx.type_is(on, EXPECTED_EXCEPTION)))
}

fn soft_extension(ctx: &Ctx, declaration: u32) -> bool {
    let Some(extend) = ctx
        .annotations(declaration)
        .into_iter()
        .find(|annotation| ctx.type_is(*annotation, "org.junit.jupiter.api.extension.ExtendWith"))
    else {
        return false;
    };
    let Some(members) = ctx.kid(extend, "AnnotationMemberList") else { return false };
    ctx.kids_named(members, "MemberValuePair").filter(|pair| ctx.text(*pair, "Name") == "value").any(|pair| {
        let values: Vec<u32> = match ctx.nth(pair, 0) {
            Some(array) if ctx.is(array, "MemberValueArrayInitializer") => ctx.kids(array).to_vec(),
            Some(value) => vec![value],
            None => Vec::new(),
        };
        values.into_iter().any(|value| {
            ctx.is(value, "ClassLiteral")
                && ctx.nth(value, 0).is_some_and(|written| {
                    ctx.type_is(written, "org.assertj.core.api.junit.jupiter.SoftAssertionsExtension")
                })
        })
    })
}

fn expect_annotated(ctx: &Ctx, method: u32) -> bool {
    ctx.annotations(method).into_iter().filter(|annotation| ctx.type_is(*annotation, "org.junit.Test")).any(
        |annotation| {
            ctx.kid(annotation, "AnnotationMemberList").is_some_and(|members| {
                ctx.kids_named(members, "MemberValuePair").any(|pair| ctx.text(pair, "Name") == "expected")
            })
        },
    )
}

pub fn unit_test_should_include_assert(ctx: &Ctx, out: &mut Vec<Hit>) {
    let extra = ctx.property_list("extraAssertMethodNames", &[]);
    for &method in ctx.all("MethodDeclaration") {
        let Some(body) = ctx.kid(method, "Block") else { continue };
        if !ctx.is_test_method(method) || expect_annotated(ctx, method) {
            continue;
        }
        let soft = ctx.enclosing_type(method).is_some_and(|owner| soft_extension(ctx, owner));
        let asserts = ctx.descendants(body).into_iter().any(|call| {
            ctx.is(call, "MethodCall")
                && (probable_assert(ctx, call)
                    || (soft && soft_assert(ctx, call))
                    || extra.contains(&ctx.method_name(call)))
        });
        if !asserts {
            out.push(hit(method));
        }
    }
}
