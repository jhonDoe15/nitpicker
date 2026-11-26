//! A throw in a catch block that drops the caught exception.
use crate::java::pmd::coded::bestpractices::explicitly_unused;
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit_with;
use std::collections::HashSet;

const ALLOWED_GETTERS: &[&str] = &[
    "java.lang.Throwable#fillInStackTrace()",
    "java.lang.reflect.InvocationTargetException#getTargetException()",
    "java.lang.reflect.InvocationTargetException#getCause()",
    "java.security.PrivilegedActionException#getException()",
    "java.security.PrivilegedActionException#getCause()",
];
const QUALIFIABLE: &[&str] = &["ArrayAccess", "ConstructorCall", "FieldAccess", "MethodCall", "MethodReference"];

struct Walk<'c, 'm, 'a, 't> {
    ctx: &'c Ctx<'m, 'a, 't>,
    recursing: HashSet<u32>,
}

pub fn preserve_stack_trace(ctx: &Ctx, out: &mut Vec<Hit>) {
    let mut walk = Walk { ctx, recursing: HashSet::new() };
    for &catch in ctx.all("CatchClause") {
        let Some(parameter) = ctx.kid(catch, "CatchParameter").and_then(|parameter| ctx.kid(parameter, "VariableId"))
        else {
            continue;
        };
        let name = ctx.text(parameter, "Name");
        if explicitly_unused(&name) {
            continue;
        }
        let Some(body) = ctx.kid(catch, "Block") else { continue };
        for throw in ctx.descendants(body).into_iter().filter(|at| ctx.is(*at, "ThrowStatement")) {
            let Some(thrown) = ctx.nth(throw, 0) else { continue };
            if !walk.consumes(&[parameter], Some(thrown), true) {
                out.push(hit_with(thrown, &[&name]));
            }
        }
        walk.recursing.clear();
    }
}

impl Walk<'_, '_, '_, '_> {
    fn consumes(&mut self, params: &[u32], expression: Option<u32>, may_be_self: bool) -> bool {
        let ctx = self.ctx;
        let Some(mut expression) = expression else { return false };
        while ctx.is(expression, "CastExpression") {
            match ctx.kids(expression).last() {
                Some(&operand) => expression = operand,
                None => return false,
            }
        }
        match ctx.name(expression) {
            "ConstructorCall" => self.constructor(params, expression),
            "MethodCall" => self.method(params, expression),
            "ConditionalExpression" => {
                let mut possible = params.to_vec();
                possible.extend(self.pattern_variable(ctx.nth(expression, 0)));
                self.consumes(&possible, ctx.nth(expression, 1), may_be_self)
                    && self.consumes(&possible, ctx.nth(expression, 2), may_be_self)
            }
            "VariableAccess" => self.variable(params, expression, may_be_self),
            _ => false,
        }
    }

    fn pattern_variable(&self, condition: Option<u32>) -> Option<u32> {
        let ctx = self.ctx;
        let condition = condition.filter(|at| ctx.is(*at, "InfixExpression"))?;
        if ctx.text(condition, "Operator") != "instanceof" {
            return None;
        }
        let right = ctx.nth(condition, 1).filter(|at| ctx.is(*at, "PatternExpression"))?;
        let pattern = ctx.nth(right, 0).filter(|at| ctx.is(*at, "TypePattern"))?;
        ctx.kid(pattern, "VariableId")
    }

    fn variable(&mut self, params: &[u32], access: u32, may_be_self: bool) -> bool {
        let ctx = self.ctx;
        if !ctx.resolves(access) {
            return true;
        }
        let Some(declaration) = ctx.usages().declaration(access) else { return false };
        if params.contains(&declaration) {
            return may_be_self;
        }
        let parent = ctx.parent(declaration);
        let formal = parent.is_some_and(|parent| matches!(ctx.name(parent), "FormalParameter" | "LambdaParameter"));
        let field = parent.and_then(|parent| ctx.parent(parent)).is_some_and(|at| ctx.is(at, "FieldDeclaration"));
        if formal || field || !self.recursing.insert(declaration) {
            return false;
        }
        let initializer = parent
            .filter(|parent| ctx.is(*parent, "VariableDeclarator"))
            .and_then(|declarator| ctx.nth(declarator, 1));
        if self.consumes(params, initializer, may_be_self) {
            return true;
        }
        for usage in ctx.usages().of_variable(declaration).to_vec() {
            if self.assigned_consumes(params, declaration, usage) {
                return true;
            }
            let chain: Vec<u32> =
                ctx.ancestors(usage).take_while(|at| QUALIFIABLE.contains(&ctx.name(*at))).collect();
            if chain.into_iter().any(|at| self.consumes_directly(params, at)) {
                return true;
            }
        }
        false
    }

    fn assigned_consumes(&mut self, params: &[u32], variable: u32, usage: u32) -> bool {
        let ctx = self.ctx;
        let Some(assignment) = ctx.parent(usage).filter(|parent| ctx.is(*parent, "AssignmentExpression")) else {
            return false;
        };
        if ctx.nth(assignment, 0) != Some(usage) {
            return false;
        }
        let Some(value) = ctx.nth(assignment, 1) else { return false };
        let mut nodes = vec![value];
        nodes.extend(ctx.descendants(value));
        let referencing = nodes.into_iter().any(|at| {
            ctx.is(at, "VariableAccess") && ctx.usages().declaration(at) == Some(variable)
        });
        !referencing && self.consumes(params, Some(value), true)
    }

    fn consumes_directly(&mut self, params: &[u32], expression: u32) -> bool {
        let ctx = self.ctx;
        match ctx.name(expression) {
            "ConstructorCall" => self.constructor(params, expression),
            "MethodCall" => self.any_argument(params, expression),
            _ => false,
        }
    }

    fn constructor(&mut self, params: &[u32], call: u32) -> bool {
        let ctx = self.ctx;
        let anonymous = ctx.kid(call, "AnonymousClassDeclaration");
        anonymous.is_some_and(|anonymous| self.init_cause_inside(params, anonymous)) || self.any_argument(params, call)
    }

    fn init_cause_inside(&mut self, params: &[u32], anonymous: u32) -> bool {
        let ctx = self.ctx;
        let members: Vec<u32> = ctx
            .kid(anonymous, "ClassBody")
            .map(|body| {
                ctx.kids(body)
                    .iter()
                    .copied()
                    .filter(|member| matches!(ctx.name(*member), "FieldDeclaration" | "Initializer"))
                    .collect()
            })
            .unwrap_or_default();
        let calls: Vec<u32> = members
            .into_iter()
            .flat_map(|member| ctx.descendants(member))
            .filter(|at| ctx.is(*at, "MethodCall"))
            .collect();
        calls.into_iter().any(|call| {
            let on_this = ctx.qualifier(call).is_some_and(|on| ctx.is(on, "ThisExpression"));
            !on_this && ctx.matches_sig(call, "java.lang.Throwable#initCause(_)") && self.any_argument(params, call)
        })
    }

    fn method(&mut self, params: &[u32], call: u32) -> bool {
        let ctx = self.ctx;
        if self.any_argument(params, call) {
            return true;
        }
        let Some(qualifier) = ctx.qualifier(call) else { return false };
        let may_be_self = ALLOWED_GETTERS.iter().any(|getter| ctx.matches_sig(call, getter));
        self.consumes(params, Some(qualifier), may_be_self)
    }

    fn any_argument(&mut self, params: &[u32], call: u32) -> bool {
        self.ctx.arguments(call).into_iter().any(|argument| self.consumes(params, Some(argument), true))
    }
}
