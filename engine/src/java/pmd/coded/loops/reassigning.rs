//! Writes to the variables that control a loop from inside the loop.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit_with;
use std::collections::HashSet;

const SWITCH_BRANCHES: &[&str] = &["SwitchArrowBranch", "SwitchFallthroughBranch"];
const LOOPS: &[&str] = &["ForStatement", "ForeachStatement", "WhileStatement", "DoStatement"];

fn written(ctx: &Ctx, usage: u32) -> bool {
    ctx.text(usage, "AccessType") == "WRITE"
}

fn assignment_operator(ctx: &Ctx, usage: u32) -> Option<String> {
    let parent = ctx.parent(usage).filter(|parent| ctx.is(*parent, "AssignmentExpression"))?;
    Some(ctx.text(parent, "Operator"))
}

fn strictly_written(ctx: &Ctx, usage: u32) -> bool {
    let first = ctx.parent(usage).and_then(|parent| ctx.nth(parent, 0)) == Some(usage);
    first && assignment_operator(ctx, usage).is_some_and(|operator| operator == "=")
}

fn read_and_written(ctx: &Ctx, usage: u32) -> bool {
    written(ctx, usage) && assignment_operator(ctx, usage).is_none_or(|operator| operator != "=")
}

fn foreach(ctx: &Ctx, out: &mut Vec<Hit>) {
    let behavior = ctx.property("foreachReassign").unwrap_or("deny").trim();
    if behavior == "allow" {
        return;
    }
    for &statement in ctx.all("ForeachStatement") {
        let Some(variable) = ctx
            .kid(statement, "LocalVariableDeclaration")
            .and_then(|declaration| ctx.kid(declaration, "VariableDeclarator"))
            .and_then(|declarator| ctx.kid(declarator, "VariableId"))
        else {
            continue;
        };
        let name = ctx.text(variable, "Name");
        let mut ignore_next = behavior == "firstOnly";
        for &usage in ctx.usages().of_variable(variable) {
            if !written(ctx, usage) {
                ignore_next = false;
            } else if ignore_next {
                ignore_next = false;
            } else {
                out.push(hit_with(usage, &[&name]));
            }
        }
    }
}

fn loop_variables(ctx: &Ctx, statement: u32) -> Vec<u32> {
    ctx.kid(statement, "ForInit")
        .and_then(|init| ctx.nth(init, 0))
        .filter(|init| ctx.is(*init, "LocalVariableDeclaration"))
        .map(|declaration| {
            ctx.kids_named(declaration, "VariableDeclarator")
                .filter_map(|declarator| ctx.kid(declarator, "VariableId"))
                .collect()
        })
        .unwrap_or_default()
}

pub fn avoid_reassigning_loop_variables(ctx: &Ctx, out: &mut Vec<Hit>) {
    foreach(ctx, out);
    let behavior = ctx.property("forReassign").unwrap_or("deny").trim();
    if behavior == "allow" {
        return;
    }
    for &statement in ctx.all("ForStatement") {
        let variables = loop_variables(ctx, statement);
        if behavior == "deny" {
            let update = ctx.kid(statement, "ForUpdate");
            for variable in variables {
                let name = ctx.text(variable, "Name");
                for &usage in ctx.usages().of_variable(variable) {
                    let nearest = ctx.ancestors(usage).find(|at| ctx.is(*at, "ForUpdate"));
                    if written(ctx, usage) && !(update.is_some() && nearest == update) {
                        out.push(hit_with(usage, &[&name]));
                    }
                }
            }
            continue;
        }
        let names: HashSet<String> = variables.iter().map(|variable| ctx.text(*variable, "Name")).collect();
        let mut labels = HashSet::new();
        for at in ctx.ancestors(statement).take_while(|at| ctx.is(*at, "LabeledStatement")) {
            labels.insert(ctx.text(at, "Label"));
        }
        let roam = Roam { ctx, names: &names, labels: &labels };
        let mut flow = Flow { guarded: false, may_exit: false, break_hidden: false, continue_hidden: false };
        if let Some(body) = ctx.kids(statement).last().copied() {
            roam.node(&mut flow, body, out);
        }
    }
}

struct Roam<'r, 'c, 'm, 'a, 't> {
    ctx: &'r Ctx<'m, 'a, 't>,
    names: &'c HashSet<String>,
    labels: &'c HashSet<String>,
}

struct Flow {
    guarded: bool,
    may_exit: bool,
    break_hidden: bool,
    continue_hidden: bool,
}

impl Flow {
    fn copy(&self, guarded: bool, break_hidden: bool, continue_hidden: bool) -> Flow {
        Flow { guarded, may_exit: false, break_hidden, continue_hidden }
    }
}

impl Roam<'_, '_, '_, '_, '_> {
    fn node(&self, flow: &mut Flow, node: u32, out: &mut Vec<Hit>) -> bool {
        let ctx = self.ctx;
        let statements = if ctx.is(node, "Block") { ctx.kids(node).to_vec() } else { vec![node] };
        self.statements(flow, &statements, out)
    }

    fn exits(&self, label: String, hidden: bool) -> bool {
        !label.is_empty() && self.labels.contains(&label) || !hidden
    }

    fn statements(&self, flow: &mut Flow, statements: &[u32], out: &mut Vec<Hit>) -> bool {
        let ctx = self.ctx;
        for &statement in statements {
            match ctx.name(statement) {
                "ThrowStatement" | "ReturnStatement" => return true,
                "BreakStatement" => return self.exits(ctx.text(statement, "Label"), flow.break_hidden),
                "ContinueStatement" => return self.exits(ctx.text(statement, "Label"), flow.continue_hidden),
                name if LOOPS.contains(&name) => {
                    let body = if ctx.is(statement, "DoStatement") {
                        ctx.nth(statement, 0)
                    } else {
                        ctx.kids(statement).last().copied()
                    };
                    for &kid in ctx.kids(statement) {
                        if Some(kid) != body {
                            self.check(flow, kid, out);
                        }
                    }
                    let mut inner = flow.copy(true, true, true);
                    flow.may_exit |= body.is_some_and(|body| self.node(&mut inner, body, out));
                }
                "SwitchStatement" => {
                    let kids = ctx.kids(statement);
                    if let Some(&tested) = kids.first() {
                        self.check(flow, tested, out);
                    }
                    let branches: Vec<u32> =
                        kids.iter().copied().filter(|kid| SWITCH_BRANCHES.contains(&ctx.name(*kid))).collect();
                    let mut inner = flow.copy(true, true, false);
                    flow.may_exit |= self.statements(&mut inner, &branches, out);
                }
                "IfStatement" => {
                    let kids = ctx.kids(statement).to_vec();
                    if let Some(&condition) = kids.first() {
                        self.check(flow, condition, out);
                    }
                    let mut then = flow.copy(true, flow.break_hidden, flow.continue_hidden);
                    flow.may_exit |= kids.get(1).is_some_and(|branch| self.node(&mut then, *branch, out));
                    let mut otherwise = flow.copy(flow.guarded, flow.break_hidden, flow.continue_hidden);
                    flow.may_exit |= kids.get(2).is_some_and(|branch| self.node(&mut otherwise, *branch, out));
                }
                _ if ctx.is_expression(statement) => self.check(flow, statement, out),
                "LocalClassStatement" => {}
                _ => {
                    let kids = ctx.kids(statement).to_vec();
                    flow.may_exit |= self.statements(flow, &kids, out);
                }
            }
        }
        flow.may_exit
    }

    fn check(&self, flow: &Flow, node: u32, out: &mut Vec<Hit>) {
        let ctx = self.ctx;
        let only_write = flow.guarded || flow.may_exit;
        for at in ctx.descendants(node) {
            if !matches!(ctx.name(at), "VariableAccess" | "FieldAccess") {
                continue;
            }
            let name = ctx.text(at, "Name");
            if !self.names.contains(&name) {
                continue;
            }
            let reported = if only_write { strictly_written(ctx, at) } else { read_and_written(ctx, at) };
            if reported {
                out.push(hit_with(at, &[&name]));
            }
        }
    }
}
