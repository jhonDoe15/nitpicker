//! PMD's `ReachingDefsVisitor` for loops and try statements.
use super::span::{Pass, SpanId};
use std::rc::Rc;

impl Pass<'_, '_, '_, '_> {
    #[allow(clippy::too_many_arguments)]
    pub fn looped(
        &mut self,
        node: u32,
        before: SpanId,
        init: Option<u32>,
        condition: Option<u32>,
        update: Option<u32>,
        body: Option<u32>,
        check_first: bool,
        variable: Option<u32>,
    ) -> SpanId {
        let break_target = self.fork_empty(before);
        let continue_target = self.fork_empty(before);
        self.labels(node, break_target, Some(continue_target));
        self.breaks.unnamed.push(break_target);
        self.continues.unnamed.push(continue_target);
        let mut before = self.visit_opt(init, before);
        if check_first && condition.is_some() {
            let condition_true = self.fork_empty(before);
            self.link(before, condition, condition_true, break_target, true);
            before = condition_true;
        }
        let sym = variable.map(super::plain);
        if let (Some(sym), Some(variable)) = (sym, variable) {
            self.assign(before, sym, variable, None);
        }
        let fork = self.fork(before);
        let mut iteration = self.visit_opt(body, fork);
        self.absorb(iteration, Some(continue_target));
        match (sym, variable) {
            (Some(sym), Some(variable)) if self.spans[iteration].table.contains_key(&sym) => {
                self.assign(iteration, sym, variable, None);
            }
            _ => iteration = self.visit_opt(update, iteration),
        }
        self.link(iteration, condition, iteration, break_target, true);
        iteration = self.visit_opt(body, iteration);
        let result = self.pop_targets(node, break_target, continue_target);
        self.absorb(result, Some(iteration));
        if check_first {
            self.absorb(result, Some(before));
        }
        if let Some(sym) = sym {
            self.delete_var(result, sym);
        }
        self.spans[result].targets.retain(|target| *target != break_target && *target != continue_target);
        result
    }

    fn pop_targets(&mut self, node: u32, break_target: SpanId, continue_target: SpanId) -> SpanId {
        let ctx = self.ctx;
        self.breaks.unnamed.pop();
        self.continues.unnamed.pop();
        let mut total = self.absorb(break_target, Some(continue_target));
        let mut parent = ctx.parent(node);
        while let Some(at) = parent.filter(|at| ctx.is(*at, "LabeledStatement")) {
            let label = ctx.text(at, "Label");
            let named = self.breaks.named.remove(&label);
            total = self.absorb(total, named);
            let named = self.continues.named.remove(&label);
            total = self.absorb(total, named);
            parent = ctx.parent(at);
        }
        total
    }

    pub fn try_statement(&mut self, node: u32, before: SpanId) -> SpanId {
        let ctx = self.ctx;
        let finally = ctx.kid(node, "FinallyClause");
        let mut final_state = self.breakable(node, before, |pass| {
            if finally.is_some() {
                let fork = pass.fork_empty(before);
                pass.spans[before].my_finally = Some(fork);
            }
            let catches: Vec<u32> = ctx.kids_named(node, "CatchClause").collect();
            let catch_spans: Vec<SpanId> = catches.iter().map(|_| pass.fork_empty(before)).collect();
            let mut body = pass.fork(before);
            pass.spans[body].catches = Rc::new(catch_spans.clone());
            body = pass.visit_opt(ctx.kid(node, "ResourceList"), body);
            body = pass.visit_opt(ctx.kid(node, "Block"), body);
            pass.spans[body].catches = Rc::new(Vec::new());
            let mut exceptional = None;
            for (catch, span) in catches.into_iter().zip(catch_spans) {
                pass.absorb(span, Some(body));
                let current = pass.visit(catch, span);
                exceptional = Some(pass.absorb(current, exceptional));
            }
            pass.absorb(body, exceptional)
        });
        if let Some(finally) = finally {
            let ret = self.spans[final_state].ret;
            if self.spans[final_state].targets.contains(&ret) {
                if let Some(abrupt) = self.spans[before].my_finally {
                    let abrupt_finally = self.absorb(abrupt, Some(before));
                    self.visit(finally, abrupt_finally);
                    self.spans[before].my_finally = None;
                    self.abrupt_by_throw(abrupt_finally, false);
                }
            }
            final_state = self.visit(finally, final_state);
            for target in self.spans[final_state].targets.clone() {
                self.absorb(target, Some(final_state));
            }
        }
        final_state
    }
}
