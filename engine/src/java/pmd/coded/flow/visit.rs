//! PMD's `ReachingDefsVisitor` for statements: blocks, conditionals, switches, loops, labels and jumps.
use super::span::{Pass, SpanId, add_all};
use super::Tri;
use crate::java::pmd::coded::ctx::TYPE_DECLARATIONS;

impl Pass<'_, '_, '_, '_> {
    pub fn children(&mut self, node: u32, mut data: SpanId) -> SpanId {
        for kid in self.ctx.kids(node).to_vec() {
            data = self.visit(kid, data);
        }
        data
    }

    pub fn visit_opt(&mut self, node: Option<u32>, data: SpanId) -> SpanId {
        node.map_or(data, |node| self.visit(node, data))
    }

    pub fn visit(&mut self, node: u32, data: SpanId) -> SpanId {
        let ctx = self.ctx;
        let name = ctx.name(node);
        if TYPE_DECLARATIONS.contains(&name) {
            return self.type_declaration(node, data);
        }
        match name {
            "Block" => self.breakable(node, data, |pass| pass.block(node, data)),
            "SwitchStatement" | "SwitchExpression" => self.switch(node, data),
            "IfStatement" => self.breakable(node, data, |pass| {
                pass.conditional(data, ctx.nth(node, 0), ctx.nth(node, 1), ctx.nth(node, 2))
            }),
            "ConditionalExpression" => self.conditional(data, ctx.nth(node, 0), ctx.nth(node, 1), ctx.nth(node, 2)),
            "SynchronizedStatement" => self.breakable(node, data, |pass| {
                let body = pass.children(node, data);
                let in_static = pass.in_static_context(node);
                pass.use_all_self_fields(body, in_static, pass.class);
                body
            }),
            "TryStatement" => self.try_statement(node, data),
            "CatchClause" => {
                let result = self.children(node, data);
                let parameter = ctx.kid(node, "CatchParameter").and_then(|parameter| ctx.kid(parameter, "VariableId"));
                if let Some(parameter) = parameter {
                    self.delete_var(result, super::plain(parameter));
                }
                result
            }
            "LambdaExpression" => {
                let body = ctx.kids(node).last().copied();
                let fork = self.fork_capturing_non_local(data);
                self.visit_opt(body, fork);
                data
            }
            "WhileStatement" => self.looped(node, data, None, ctx.nth(node, 0), None, ctx.nth(node, 1), true, None),
            "DoStatement" => self.looped(node, data, None, ctx.nth(node, 1), None, ctx.nth(node, 0), false, None),
            "ForeachStatement" => {
                let variable = ctx
                    .kid(node, "LocalVariableDeclaration")
                    .and_then(|declaration| ctx.kid(declaration, "VariableDeclarator"))
                    .and_then(|declarator| ctx.kid(declarator, "VariableId"));
                self.looped(node, data, ctx.nth(node, 1), None, None, ctx.nth(node, 2), true, variable)
            }
            "ForStatement" => {
                let body = ctx.kids(node).last().copied();
                let condition = ctx.kids(node).iter().copied().find(|kid| Some(*kid) != body && ctx.is_expression(*kid));
                let (init, update) = (ctx.kid(node, "ForInit"), ctx.kid(node, "ForUpdate"));
                self.looped(node, data, init, condition, update, body, true, None)
            }
            "ContinueStatement" => self.do_break(data, label(ctx, node), true),
            "BreakStatement" => self.breakable(node, data, |pass| pass.do_break(data, label(ctx, node), false)),
            "YieldStatement" => {
                self.children(node, data);
                self.do_break(data, None, false)
            }
            "ThrowStatement" => {
                self.children(node, data);
                self.abrupt_by_throw(data, false)
            }
            "ReturnStatement" => {
                self.children(node, data);
                let target = self.spans[data].ret;
                self.abrupt_completion(data, target)
            }
            _ => self.expression(node, data),
        }
    }

    fn block(&mut self, node: u32, data: SpanId) -> SpanId {
        let ctx = self.ctx;
        let mut state = data;
        let mut kill = Vec::new();
        for kid in ctx.kids(node).to_vec() {
            state = self.visit(kid, state);
            if ctx.is(kid, "LocalVariableDeclaration") {
                kill.extend(ctx.kids_named(kid, "VariableDeclarator").filter_map(|at| ctx.kid(at, "VariableId")));
            }
        }
        for variable in kill {
            self.delete_var(state, super::plain(variable));
        }
        state
    }

    fn switch(&mut self, node: u32, data: SpanId) -> SpanId {
        let ctx = self.ctx;
        let mut before = self.visit_opt(ctx.nth(node, 0), data);
        let break_target = self.fork(before);
        self.breaks.unnamed.push(break_target);
        self.labels(node, break_target, None);
        let total = ctx.flag(node, "DefaultCase") || ctx.is(node, "SwitchExpression") || ctx.flag(node, "ExhaustiveEnumSwitch");
        let mut successors: Vec<SpanId> = Vec::new();
        let mut all_abrupt = true;
        let mut current = before;
        for branch in ctx.kids(node).to_vec() {
            if ctx.is(branch, "SwitchArrowBranch") {
                let fork = self.fork(before);
                current = self.visit_opt(ctx.kids(branch).last().copied(), fork);
                current = self.do_break(current, None, false);
            } else if ctx.is(branch, "SwitchFallthroughBranch") {
                let fork = self.fork(before);
                let start = self.absorb(fork, Some(current));
                current = self.visit(branch, start);
                let falls = match self.spans[current].abrupt {
                    Tri::Yes => Tri::No,
                    Tri::No => Tri::Yes,
                    Tri::Unknown => Tri::Unknown,
                };
                self.flow.falls.insert(branch, falls);
                let targets = self.spans[current].targets.clone();
                add_all(&mut successors, &targets);
                all_abrupt &= self.spans[current].abrupt == Tri::Yes;
                if falls == Tri::No {
                    current = self.fork(before);
                }
            }
        }
        before = self.breaks.unnamed.pop().unwrap_or(before);
        let external: Vec<SpanId> = successors.iter().copied().filter(|target| *target != before).collect();
        let completes = if total && all_abrupt && external.len() == successors.len() {
            Tri::Yes
        } else if successors.is_empty() || (successors.len() == 1 && successors[0] == break_target) {
            Tri::No
        } else {
            Tri::Unknown
        };
        let result = self.absorb(before, Some(current));
        self.spans[result].abrupt = completes;
        self.spans[result].targets = external;
        result
    }

    pub fn conditional(&mut self, before: SpanId, condition: Option<u32>, then: Option<u32>, other: Option<u32>) -> SpanId {
        let mut then_state = self.fork(before);
        let mut else_state = if other.is_some() { self.fork(before) } else { before };
        self.link(before, condition, then_state, else_state, true);
        then_state = self.visit_opt(then, then_state);
        else_state = self.visit_opt(other, else_state);
        self.absorb(else_state, Some(then_state))
    }

    pub fn link(&mut self, before: SpanId, condition: Option<u32>, then: SpanId, other: SpanId, top: bool) -> SpanId {
        let ctx = self.ctx;
        let Some(condition) = condition else { return before };
        if ctx.is(condition, "InfixExpression") {
            match ctx.text(condition, "Operator").as_str() {
                "||" => return self.shortcut(condition, before, then, other),
                "&&" => return self.shortcut(condition, before, other, then),
                _ => {}
            }
        }
        let state = self.visit(condition, before);
        if top {
            self.absorb(then, Some(state));
            self.absorb(other, Some(state));
        }
        state
    }

    fn shortcut(&mut self, expression: u32, before: SpanId, then: SpanId, other: SpanId) -> SpanId {
        let (left, right) = (self.ctx.nth(expression, 0), self.ctx.nth(expression, 1));
        let mut current = self.link(before, left, then, other, false);
        self.absorb(then, Some(current));
        current = self.link(current, right, then, other, false);
        self.absorb(then, Some(current));
        self.absorb(other, Some(current));
        current
    }

    pub fn breakable(&mut self, statement: u32, input: SpanId, run: impl FnOnce(&mut Self) -> SpanId) -> SpanId {
        let ctx = self.ctx;
        if !ctx.parent(statement).is_some_and(|parent| ctx.is(parent, "LabeledStatement")) {
            return run(self);
        }
        let placeholder = self.fork_empty(input);
        let labels = self.labels(statement, placeholder, None);
        let end = run(self);
        for label in labels {
            self.breaks.named.remove(&label);
        }
        let result = self.absorb(end, Some(placeholder));
        self.spans[result].targets.retain(|target| *target != placeholder);
        result
    }

    pub fn labels(&mut self, statement: u32, break_target: SpanId, continue_target: Option<SpanId>) -> Vec<String> {
        let ctx = self.ctx;
        let mut labels = Vec::new();
        let mut parent = ctx.parent(statement);
        while let Some(at) = parent.filter(|at| ctx.is(*at, "LabeledStatement")) {
            let label = ctx.text(at, "Label");
            if !labels.contains(&label) {
                labels.push(label.clone());
            }
            self.breaks.named.insert(label.clone(), break_target);
            if let Some(target) = continue_target {
                self.continues.named.insert(label, target);
            }
            parent = ctx.parent(at);
        }
        labels
    }
}

fn label(ctx: &crate::java::pmd::coded::ctx::Ctx, node: u32) -> Option<String> {
    Some(ctx.text(node, "Label")).filter(|label| !label.is_empty())
}
