//! PMD's `AbruptCompletionAnalysis`: whether a statement can complete normally, which decides whether the pattern
//! variables of an `if` stay in scope after it.
use super::super::ctx::Ctx;
use std::collections::HashSet;

const LOOPS: &[&str] = &["WhileStatement", "DoStatement", "ForStatement", "ForeachStatement"];

pub fn can_complete_normally(ctx: &Ctx, statement: u32) -> bool {
    Reach { ctx, breaks: HashSet::new(), continues: HashSet::new(), ignoring: 0 }.statement(statement)
}

/// The statement a `break` leaves: the labeled statement of its label, else the innermost loop or switch statement.
pub fn break_target(ctx: &Ctx, statement: u32) -> Option<u32> {
    target(ctx, statement, &["WhileStatement", "DoStatement", "ForStatement", "ForeachStatement", "SwitchStatement"])
}

pub fn is_break_target(ctx: &Ctx, statement: u32) -> bool {
    LOOPS.contains(&ctx.name(statement)) || matches!(ctx.name(statement), "SwitchStatement" | "LabeledStatement")
}

fn target(ctx: &Ctx, statement: u32, unlabeled: &[&str]) -> Option<u32> {
    let label = ctx.text(statement, "Label");
    if label.is_empty() {
        ctx.enclosing(statement, unlabeled)
    } else {
        ctx.ancestors(statement).find(|at| ctx.is(*at, "LabeledStatement") && ctx.text(*at, "Label") == label)
    }
}

struct Reach<'c, 'm, 'a, 't> {
    ctx: &'c Ctx<'m, 'a, 't>,
    breaks: HashSet<u32>,
    continues: HashSet<u32>,
    ignoring: usize,
}

impl Reach<'_, '_, '_, '_> {
    fn sequence(&mut self, statements: &[u32]) -> bool {
        statements.iter().all(|statement| self.statement(*statement))
    }

    fn leave(&mut self, target: Option<u32>, continuing: bool) -> bool {
        if let Some(target) = target.filter(|_| self.ignoring == 0) {
            if continuing { self.continues.insert(target) } else { self.breaks.insert(target) };
        }
        false
    }

    fn is_true(&self, condition: Option<u32>) -> bool {
        condition.is_some_and(|condition| self.ctx.is(condition, "BooleanLiteral") && self.ctx.flag(condition, "True"))
    }

    fn statement(&mut self, statement: u32) -> bool {
        let ctx = self.ctx;
        let kids = ctx.kids(statement).to_vec();
        match ctx.name(statement) {
            "Block" => self.sequence(&kids),
            "ThrowStatement" | "ReturnStatement" => false,
            "BreakStatement" => self.leave(break_target(ctx, statement), false),
            "YieldStatement" => self.leave(ctx.enclosing(statement, &["SwitchExpression"]), false),
            "ContinueStatement" => self.leave(target(ctx, statement, LOOPS), true),
            "IfStatement" => {
                let then = kids.get(1).is_none_or(|then| self.statement(*then));
                let otherwise = kids.get(2).is_none_or(|otherwise| self.statement(*otherwise));
                then || otherwise
            }
            "SynchronizedStatement" => kids.last().is_none_or(|body| self.statement(*body)),
            "LabeledStatement" => kids.first().is_none_or(|inner| self.statement(*inner)) || self.breaks.contains(&statement),
            "ForeachStatement" => {
                kids.last().map(|body| self.statement(*body));
                true
            }
            "DoStatement" => {
                let body = kids.first().is_none_or(|body| self.statement(*body));
                !self.is_true(kids.get(1).copied()) && (body || self.continues.contains(&statement))
                    || self.breaks.contains(&statement)
            }
            "WhileStatement" => {
                kids.get(1).map(|body| self.statement(*body));
                !self.is_true(kids.first().copied()) || self.breaks.contains(&statement)
            }
            "ForStatement" => {
                kids.last().map(|body| self.statement(*body));
                let condition = kids[..kids.len().saturating_sub(1)]
                    .iter()
                    .copied()
                    .find(|kid| !matches!(ctx.name(*kid), "ForInit" | "ForUpdate"));
                condition.is_some_and(|condition| !self.is_true(Some(condition))) || self.breaks.contains(&statement)
            }
            "SwitchStatement" => self.switch(statement, &kids),
            "TryStatement" => self.attempt(&kids),
            _ => true,
        }
    }

    fn switch(&mut self, statement: u32, kids: &[u32]) -> bool {
        let ctx = self.ctx;
        let exhaustive = ctx.flag(statement, "DefaultCase");
        let mut completes = true;
        let mut first = true;
        for &branch in kids {
            let branch_completes = match ctx.name(branch) {
                "SwitchArrowBranch" => match ctx.nth(branch, 1) {
                    Some(rhs) if ctx.is(rhs, "ThrowStatement") => false,
                    Some(rhs) if ctx.is(rhs, "Block") => self.statement(rhs) || self.breaks.contains(&statement),
                    _ => true,
                },
                "SwitchFallthroughBranch" => {
                    self.sequence(&ctx.kids(branch)[1.min(ctx.kids(branch).len())..].to_vec())
                        || self.breaks.contains(&statement)
                }
                _ => continue,
            };
            if exhaustive && first {
                completes = branch_completes;
                first = false;
            } else {
                completes = completes || branch_completes;
            }
        }
        completes
    }

    fn attempt(&mut self, kids: &[u32]) -> bool {
        let ctx = self.ctx;
        let finally = kids.iter().copied().find(|kid| ctx.is(*kid, "FinallyClause")).and_then(|clause| ctx.kid(clause, "Block"));
        let finally_completes = finally.is_none_or(|block| self.statement(block));
        if !finally_completes {
            self.ignoring += 1;
        }
        let body = kids.iter().copied().find(|kid| ctx.is(*kid, "Block")).is_none_or(|block| self.statement(block));
        let mut any_catch = false;
        for clause in kids.iter().copied().filter(|kid| ctx.is(*kid, "CatchClause")) {
            any_catch |= ctx.kid(clause, "Block").is_none_or(|block| self.statement(block));
        }
        if !finally_completes {
            self.ignoring -= 1;
        }
        finally_completes && (body || any_catch)
    }
}
