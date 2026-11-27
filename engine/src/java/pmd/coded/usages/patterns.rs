//! The scoping PMD's `SymbolTableResolver` gives statements: locals of a block from their declaration on, pattern
//! variables by the "introduced when true / when false" rules of JLS 6.3.1, and the switch branch scopes.
use super::Walk;
use super::reach::{break_target, can_complete_normally, is_break_target};

#[derive(Default)]
pub struct Bindings {
    pub when_true: Vec<u32>,
    pub when_false: Vec<u32>,
}

impl Bindings {
    fn negated(self) -> Bindings {
        Bindings { when_true: self.when_false, when_false: self.when_true }
    }

    fn is_empty(&self) -> bool {
        self.when_true.is_empty() && self.when_false.is_empty()
    }
}

impl Walk<'_, '_, '_, '_> {
    /// PMD's `bindersOfExpr`: the pattern variables an expression introduces when it is true and when it is false.
    pub fn binders(&self, expression: u32) -> Bindings {
        let ctx = self.ctx;
        let operand = |at: usize| ctx.nth(expression, at).map(|kid| self.binders(kid)).unwrap_or_default();
        match ctx.name(expression) {
            "UnaryExpression" if ctx.text(expression, "Operator") == "!" => operand(0).negated(),
            "InfixExpression" => match ctx.text(expression, "Operator").as_str() {
                "instanceof" => ctx
                    .nth(expression, 1)
                    .filter(|right| ctx.is(*right, "PatternExpression"))
                    .map(|right| self.binders(right))
                    .unwrap_or_default(),
                "&&" => Bindings { when_true: [operand(0).when_true, operand(1).when_true].concat(), when_false: Vec::new() },
                "||" => Bindings { when_true: Vec::new(), when_false: [operand(0).when_false, operand(1).when_false].concat() },
                _ => Bindings::default(),
            },
            "PatternExpression" => ctx.nth(expression, 0).map(|pattern| self.pattern(pattern)).unwrap_or_default(),
            _ => Bindings::default(),
        }
    }

    pub fn pattern(&self, pattern: u32) -> Bindings {
        let ctx = self.ctx;
        match ctx.name(pattern) {
            "TypePattern" => Bindings {
                when_true: ctx.kid(pattern, "VariableId").filter(|variable| ctx.text(*variable, "Name") != "_").into_iter().collect(),
                when_false: Vec::new(),
            },
            "RecordPattern" => Bindings {
                when_true: ctx
                    .kid(pattern, "PatternList")
                    .map(|list| ctx.kids(list).iter().flat_map(|kid| self.pattern(*kid).when_true).collect())
                    .unwrap_or_default(),
                when_false: Vec::new(),
            },
            _ => Bindings::default(),
        }
    }

    pub fn declare_all(&mut self, variables: &[u32]) {
        variables.iter().for_each(|variable| self.declare(*variable));
    }

    /// The statements of a block, a switch group or a resource list: each declaration and each statement's
    /// introduced pattern variables are in scope for the statements after it. The caller ends the scope.
    pub fn block_like(&mut self, statements: &[u32]) {
        for &statement in statements {
            if self.ctx.is(statement, "LocalVariableDeclaration") {
                self.local_variables(statement);
            } else {
                let introduced = self.statement(statement);
                self.declare_all(&introduced);
            }
        }
    }

    /// Each variable of a declaration is in scope in its own initializer and those after it.
    pub fn local_variables(&mut self, declaration: u32) {
        let ctx = self.ctx;
        for kid in ctx.kids(declaration).to_vec() {
            if ctx.is(kid, "VariableDeclarator") {
                ctx.kid(kid, "VariableId").into_iter().for_each(|variable| self.declare(variable));
            }
            self.kids_of(kid);
        }
    }

    /// PMD's `StatementVisitor`: visits a statement and returns the pattern variables it introduces after itself.
    /// Statements reached otherwise (the body of a `for (x : xs)` or of a `do`) skip these rules, as in PMD.
    pub fn statement(&mut self, statement: u32) -> Vec<u32> {
        let ctx = self.ctx;
        let kids = ctx.kids(statement).to_vec();
        match ctx.name(statement) {
            "LabeledStatement" => kids.first().map(|inner| self.statement(*inner)).unwrap_or_default(),
            "IfStatement" => {
                let bindings = kids.first().map(|condition| self.binders(*condition)).unwrap_or_default();
                kids.first().into_iter().for_each(|condition| self.node(*condition));
                if let Some(&then) = kids.get(1) {
                    self.scoped(|walk| {
                        walk.declare_all(&bindings.when_true);
                        walk.statement(then);
                    });
                }
                if let Some(&otherwise) = kids.get(2) {
                    self.scoped(|walk| {
                        walk.declare_all(&bindings.when_false);
                        walk.statement(otherwise);
                    });
                }
                if bindings.is_empty() {
                    return Vec::new();
                }
                let then_completes = kids.get(1).is_none_or(|then| can_complete_normally(ctx, *then));
                let else_completes = kids.get(2).is_none_or(|otherwise| can_complete_normally(ctx, *otherwise));
                match (then_completes, else_completes) {
                    (true, false) => bindings.when_true,
                    (false, true) => bindings.when_false,
                    _ => Vec::new(),
                }
            }
            "WhileStatement" => {
                let bindings = kids.first().map(|condition| self.binders(*condition)).unwrap_or_default();
                kids.first().into_iter().for_each(|condition| self.node(*condition));
                if let Some(&body) = kids.get(1) {
                    self.scoped(|walk| {
                        walk.declare_all(&bindings.when_true);
                        walk.statement(body);
                    });
                }
                if self.no_break_out(statement) { bindings.when_false } else { Vec::new() }
            }
            "ForStatement" => {
                let mut bindings = Bindings::default();
                self.scoped(|walk| {
                    let body = kids.last().copied();
                    for &kid in &kids {
                        match ctx.name(kid) {
                            "ForInit" => match ctx.nth(kid, 0) {
                                Some(init) if ctx.is(init, "LocalVariableDeclaration") => walk.local_variables(init),
                                _ => walk.node(kid),
                            },
                            "ForUpdate" => walk.node(kid),
                            _ if Some(kid) == body => {
                                walk.statement(kid);
                            }
                            _ => {
                                bindings = walk.binders(kid);
                                walk.node(kid);
                                walk.declare_all(&bindings.when_true);
                            }
                        }
                    }
                });
                if !bindings.when_false.is_empty() && self.no_break_out(statement) { bindings.when_false } else { Vec::new() }
            }
            _ => {
                self.node(statement);
                Vec::new()
            }
        }
    }

    /// Whether no `break` in a loop's body leaves the loop or a statement around it.
    fn no_break_out(&self, ring: u32) -> bool {
        let ctx = self.ctx;
        let Some(body) = ctx.kids(ring).last().copied() else { return true };
        let containing: Vec<u32> =
            std::iter::once(ring).chain(ctx.ancestors(ring)).filter(|at| is_break_target(ctx, *at)).collect();
        !ctx.below(body).filter(|at| ctx.is(*at, "BreakStatement")).any(|found| {
            let crossing = ctx.ancestors(found).take_while(|at| *at != body).any(|at| super::BOUNDARIES.contains(&ctx.name(at)));
            !crossing && break_target(ctx, found).is_some_and(|target| containing.contains(&target))
        })
    }

    /// PMD's switch scoping: a branch sees the pattern variables of its own label after the label; in a switch with
    /// `:` groups, the locals and pattern variables of earlier groups stay in scope for the later ones. A bare name
    /// in a label of a switch on an enum of this file names that enum's constant.
    pub fn switch(&mut self, switch: u32) {
        let ctx = self.ctx;
        let kids = ctx.kids(switch).to_vec();
        kids.first().into_iter().for_each(|tested| self.node(*tested));
        let constants = kids.first().and_then(|tested| ctx.type_of(*tested)).and_then(|kind| self.types.get(&kind.erased().name()).cloned());
        self.scoped(|walk| {
            for &branch in kids.iter().skip(1) {
                let Some(label) = ctx.nth(branch, 0) else { continue };
                let bound: Vec<u32> = ctx.kids(label).iter().flat_map(|kid| walk.pattern(*kid).when_true).collect();
                for kid in ctx.kids(label).to_vec() {
                    let name = ctx.is(kid, "VariableAccess").then(|| ctx.text(kid, "Name"));
                    let constant = constants.iter().flatten().find(|(known, variable)| {
                        Some(known) == name.as_ref() && ctx.parent(*variable).is_some_and(|parent| ctx.is(parent, "EnumConstant"))
                    });
                    match constant {
                        Some(&(_, variable)) => walk.bind(kid, variable),
                        None => walk.node(kid),
                    }
                }
                let rest = ctx.kids(branch)[1..].to_vec();
                if ctx.is(branch, "SwitchArrowBranch") {
                    walk.scoped(|walk| {
                        walk.declare_all(&bound);
                        rest.iter().for_each(|kid| walk.node(*kid));
                    });
                } else {
                    walk.declare_all(&bound);
                    walk.block_like(&rest);
                }
            }
        });
    }
}
