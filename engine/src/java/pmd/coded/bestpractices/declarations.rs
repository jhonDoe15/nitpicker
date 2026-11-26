//! Best practices rules about declarations and the variables they declare.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::message::signature;
use crate::java::pmd::coded::{hit, hit_with};

pub fn missing_override(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &method in ctx.all("MethodDeclaration") {
        if ctx.flag(method, "Overridden") && !ctx.annotation_present(method, "java.lang.Override") {
            out.push(hit_with(method, &[&signature(ctx, method)]));
        }
    }
}

fn writes(ctx: &Ctx, variable: u32) -> Vec<u32> {
    ctx.usages()
        .of_variable(variable)
        .iter()
        .copied()
        .filter(|usage| ctx.text(*usage, "AccessType") == "WRITE")
        .collect()
}

pub fn avoid_reassigning_catch_variables(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &parameter in ctx.all("CatchParameter") {
        let Some(variable) = ctx.kid(parameter, "VariableId") else {
            continue;
        };
        let name = ctx.text(variable, "Name");
        out.extend(writes(ctx, variable).into_iter().map(|usage| hit_with(usage, &[&name])));
    }
}

pub fn avoid_reassigning_parameters(ctx: &Ctx, out: &mut Vec<Hit>) {
    for name in ["MethodDeclaration", "ConstructorDeclaration"] {
        for &method in ctx.all(name) {
            let Some(list) = ctx.kid(method, "FormalParameters") else {
                continue;
            };
            for parameter in ctx.kids_named(list, "FormalParameter") {
                let Some(variable) = ctx.kid(parameter, "VariableId") else {
                    continue;
                };
                if let Some(&usage) = writes(ctx, variable).first() {
                    out.push(hit_with(usage, &[&ctx.text(variable, "Name")]));
                }
            }
        }
    }
}

pub fn abstract_class_without_abstract_method(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &class in ctx.all("ClassDeclaration") {
        if ctx.flag(class, "Interface") || !ctx.flag(class, "Abstract") {
            continue;
        }
        if ctx.kid(class, "ExtendsList").is_some() || ctx.kid(class, "ImplementsList").is_some() {
            continue;
        }
        let methods = ctx.declarations(class, "MethodDeclaration");
        if !methods.iter().any(|method| ctx.flag(*method, "Abstract")) {
            out.push(hit(class));
        }
    }
}

fn read_usage(ctx: &Ctx, usage: u32) -> bool {
    if ctx.text(usage, "AccessType") == "READ" {
        return true;
    }
    let Some(parent) = ctx.parent(usage) else { return false };
    let compound = ctx.is(parent, "AssignmentExpression") && ctx.flag(parent, "Compound");
    (ctx.is(parent, "UnaryExpression") || compound)
        && !ctx
            .parent(parent)
            .is_some_and(|outer| ctx.is(outer, "ExpressionStatement"))
}

pub fn never_used(ctx: &Ctx, variable: u32) -> bool {
    !ctx.usages()
        .of_variable(variable)
        .iter()
        .any(|usage| read_usage(ctx, *usage))
}

pub fn explicitly_unused(name: &str) -> bool {
    name.starts_with("ignored") || name.starts_with("unused") || name == "_"
}

pub fn unused_local_variable(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &declaration in ctx.all("LocalVariableDeclaration") {
        for declarator in ctx.kids_named(declaration, "VariableDeclarator") {
            let Some(variable) = ctx.kid(declarator, "VariableId") else {
                continue;
            };
            let name = ctx.text(variable, "Name");
            if never_used(ctx, variable) && !explicitly_unused(&name) {
                out.push(hit_with(variable, &[&name]));
            }
        }
    }
}
