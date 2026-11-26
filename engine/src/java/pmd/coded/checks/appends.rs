//! Literal appends to one string builder that could be one append.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit_with;
use crate::java::pmd::coded::performance::builders::{builder_ctor_or_append, string_concat};

const BLOCK_PARENTS: &[&str] = &[
    "ForStatement",
    "ForeachStatement",
    "WhileStatement",
    "DoStatement",
    "IfStatement",
    "SwitchStatement",
    "MethodDeclaration",
    "CatchClause",
    "FinallyClause",
    "LambdaExpression",
    "SwitchArrowBranch",
    "SwitchFallthroughBranch",
];

struct Counter<'o> {
    threshold: usize,
    count: usize,
    report: Option<u32>,
    out: &'o mut Vec<Hit>,
}

impl Counter<'_> {
    fn count(&mut self, node: Option<u32>) {
        if self.count == 0 {
            self.report = node;
        }
        self.count += 1;
    }

    fn reset(&mut self) {
        self.count = 0;
        self.report = None;
    }

    fn check(&mut self) {
        if self.count > self.threshold
            && let Some(report) = self.report
        {
            self.out.push(hit_with(report, &[&self.count.to_string()]));
        }
    }

    fn check_and_reset(&mut self) {
        self.check();
        self.reset();
    }
}

fn first_parent_block(ctx: &Ctx, node: u32) -> Option<u32> {
    let mut last = node;
    let mut parent = ctx.parent(node);
    while let Some(at) = parent.filter(|at| !BLOCK_PARENTS.contains(&ctx.name(*at))) {
        last = at;
        parent = ctx.parent(at);
    }
    match parent {
        Some(at) if ctx.is(at, "IfStatement") => Some(last),
        other => other,
    }
}

fn names_inside(ctx: &Ctx, id: u32) -> bool {
    ctx.descendants(id).into_iter().any(|at| matches!(ctx.name(at), "VariableAccess" | "FieldAccess"))
}

fn analyze(ctx: &Ctx, invocation: u32, counter: &mut Counter) {
    if !builder_ctor_or_append(ctx, invocation) {
        return;
    }
    let first = ctx.arguments(invocation).first().copied();
    if let Some(first) = first.filter(|first| string_concat(ctx, *first)) {
        if names_inside(ctx, first) {
            counter.check();
            if let Some(right) = ctx.nth(first, 1).filter(|right| ctx.is(*right, "StringLiteral")) {
                counter.count(Some(right));
            }
        } else {
            counter.count(Some(first));
        }
    } else if ctx.kid(invocation, "ArgumentList").is_some_and(|list| names_inside(ctx, list))
        || first.is_some_and(|first| matches!(ctx.name(first), "MethodCall" | "ConstructorCall"))
    {
        counter.check_and_reset();
    } else if first.is_some_and(|first| ctx.is(first, "StringLiteral")) || ctx.is(invocation, "MethodCall") {
        counter.count(first);
    }
}

fn check_constructor(ctx: &Ctx, variable: u32, counter: &mut Counter) {
    let Some(initializer) = ctx
        .parent(variable)
        .filter(|parent| ctx.is(*parent, "VariableDeclarator"))
        .and_then(|declarator| ctx.nth(declarator, 1))
    else {
        return;
    };
    let mut nodes = vec![initializer];
    nodes.extend(ctx.descendants(initializer));
    let Some(constructor) = nodes.into_iter().find(|at| ctx.is(*at, "ConstructorCall")) else { return };
    analyze(ctx, constructor, counter);
    let mut parent = ctx.parent(constructor);
    while let Some(call) = parent.filter(|at| ctx.is(*at, "MethodCall")) {
        analyze(ctx, call, counter);
        parent = ctx.parent(call);
    }
}

pub fn consecutive_literal_appends(ctx: &Ctx, out: &mut Vec<Hit>) {
    let threshold = ctx.property("threshold").and_then(|value| value.trim().parse().ok()).unwrap_or(1);
    let mut counter = Counter { threshold, count: 0, report: None, out };
    for &variable in ctx.all("VariableId") {
        if !ctx.type_is(variable, "java.lang.StringBuffer") && !ctx.type_is(variable, "java.lang.StringBuilder") {
            continue;
        }
        counter.reset();
        check_constructor(ctx, variable, &mut counter);
        let mut last_block = first_parent_block(ctx, variable);
        for &usage in ctx.usages().of_variable(variable) {
            let current_block = first_parent_block(ctx, usage);
            let mut current = usage;
            while let Some(call) = ctx.parent(current).filter(|at| ctx.is(*at, "MethodCall")) {
                current = call;
                if builder_ctor_or_append(ctx, call) {
                    if current_block != last_block {
                        counter.check_and_reset();
                    }
                    analyze(ctx, call, &mut counter);
                    last_block = current_block;
                } else {
                    counter.check_and_reset();
                }
            }
            if !ctx.parent(usage).is_some_and(|at| ctx.is(at, "MethodCall")) {
                counter.check_and_reset();
            }
        }
        counter.check();
    }
}
