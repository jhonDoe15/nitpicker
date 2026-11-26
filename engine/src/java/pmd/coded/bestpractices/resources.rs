//! Best practices rules about resources and test classes.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::{hit, hit_with};

const CLOSEABLE: &str = "java.lang.AutoCloseable";

pub fn use_try_with_resources(ctx: &Ctx, out: &mut Vec<Hit>) {
    let names = ctx.property_list("closeMethods", &["close", "closeQuietly"]);
    for &statement in ctx.all("TryStatement") {
        let Some(finally) = ctx.kid(statement, "FinallyClause") else { continue };
        let found = ctx.descendants(finally).into_iter().any(|call| {
            if !ctx.is(call, "MethodCall") || !names.contains(&ctx.method_name(call)) {
                return false;
            }
            let target = ctx.qualifier(call);
            let closes =
                target.is_some_and(|target| !ctx.is(target, "TypeExpression") && ctx.type_is(target, CLOSEABLE));
            closes || ctx.arguments(call).into_iter().any(|argument| ctx.type_is(argument, CLOSEABLE))
        });
        if found {
            out.push(hit(statement));
        }
    }
}

fn pattern_test_class(ctx: &Ctx, class: u32, pattern: Option<&fancy_regex::Regex>) -> bool {
    let Some(pattern) = pattern else { return false };
    if ctx.flag(class, "Abstract") || ctx.flag(class, "Interface") {
        return false;
    }
    let name = ctx.text(class, "CanonicalName");
    !name.is_empty() && pattern.is_match(&name).unwrap_or(false)
}

fn nested_test_class(ctx: &Ctx, declaration: u32) -> bool {
    ctx.annotation_present(declaration, "org.junit.jupiter.api.Nested")
}

pub fn test_class_without_test_cases(ctx: &Ctx, out: &mut Vec<Hit>) {
    use crate::java::pmd::coded::ctx::TYPE_DECLARATIONS;
    let default = r"^(?:.*\.)?Test[^\.]*$|^(?:.*\.)?.*Tests?$|^(?:.*\.)?.*TestCase$";
    let written = ctx.property("testClassPattern").unwrap_or(default);
    let pattern = fancy_regex::Regex::new(written).ok().filter(|_| !written.is_empty());
    for &class in ctx.all("ClassDeclaration") {
        let by_name = pattern_test_class(ctx, class, pattern.as_ref());
        if !(ctx.is_junit3_class(class) || nested_test_class(ctx, class) || by_name) {
            continue;
        }
        let tests = ctx
            .declarations(class, "MethodDeclaration")
            .into_iter()
            .any(|method| ctx.is_test_method(method));
        let nested = TYPE_DECLARATIONS
            .iter()
            .flat_map(|name| ctx.declarations(class, name))
            .any(|declaration| nested_test_class(ctx, declaration));
        if !tests && !nested {
            out.push(hit_with(class, &[&ctx.text(class, "SimpleName")]));
        }
    }
}
