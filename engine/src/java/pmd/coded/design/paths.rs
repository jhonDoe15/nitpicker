//! Which variable a name stands for, and PMD's `StablePathMatcher`: a chain of field reads and getter calls on one
//! variable or on `this`.
use crate::java::pmd::coded::ctx::Ctx;
use crate::java::types::expr::Binding;

#[derive(Clone, PartialEq, Debug)]
pub enum Symbol {
    Declared(u32),
    Field(String, String),
}

/// The variable a `VariableAccess` or `FieldAccess` names, when PMD would resolve it.
pub fn symbol(ctx: &Ctx, access: u32) -> Option<Symbol> {
    if let Some(variable) = ctx.usages().declaration(access) {
        return Some(Symbol::Declared(variable));
    }
    let source = ctx.tree.nodes[access as usize].source?;
    let resolver = ctx.machine.resolver;
    let name = ctx.text(access, "Name");
    match ctx.name(access) {
        "VariableAccess" => match resolver.binding(source, &name)? {
            Binding::Field(_, class, _) => Some(Symbol::Field(class.name.clone(), name)),
            Binding::Local(_) => None,
        },
        "FieldAccess" => {
            let owner = ctx.type_of(ctx.nth(access, 0)?)?;
            let (class, _) = resolver.index.field(&owner.erased().name(), &name)?;
            Some(Symbol::Field(class.name.clone(), name))
        }
        _ => None,
    }
}

/// Whether the access names a local variable or parameter.
pub fn local(ctx: &Ctx, access: u32) -> bool {
    ctx.is(access, "VariableAccess")
        && ctx
            .usages()
            .declaration(access)
            .is_some_and(|variable| {
                !ctx.flag(variable, "Field") && ctx.parent(variable).is_none_or(|owner| !ctx.is(owner, "EnumConstant"))
            })
}

pub fn camel_word(name: &str, prefix: &str) -> bool {
    name.strip_prefix(prefix)
        .and_then(|rest| rest.chars().next())
        .is_some_and(char::is_uppercase)
}

pub fn getter_call(ctx: &Ctx, call: u32) -> bool {
    let name = ctx.method_name(call);
    ctx.arguments(call).is_empty() && (camel_word(&name, "get") || camel_word(&name, "is"))
}

fn unqualified(ctx: &Ctx, id: u32) -> bool {
    ctx.kids(id).is_empty()
}

pub struct StablePath {
    owner: Option<Symbol>,
    path: Vec<(String, bool)>,
}

impl StablePath {
    pub fn of(ctx: &Ctx, expression: u32) -> Option<StablePath> {
        let mut path = Vec::new();
        let mut at = expression;
        let owner = loop {
            match ctx.name(at) {
                "FieldAccess" => {
                    path.push((ctx.text(at, "Name"), true));
                    at = ctx.qualifier(at)?;
                }
                "MethodCall" if getter_call(ctx, at) => {
                    path.push((ctx.method_name(at), false));
                    match ctx.qualifier(at) {
                        Some(next) => at = next,
                        None => break None,
                    }
                }
                "VariableAccess" => break Some(symbol(ctx, at)?),
                "ThisExpression" | "SuperExpression" if unqualified(ctx, at) => break None,
                _ => return None,
            }
        };
        Some(StablePath { owner, path })
    }

    pub fn variable(owner: Symbol) -> StablePath {
        StablePath { owner: Some(owner), path: Vec::new() }
    }

    pub fn matches(&self, ctx: &Ctx, expression: Option<u32>) -> bool {
        let Some(mut at) = expression else { return false };
        for (name, field) in &self.path {
            let kind = if *field { "FieldAccess" } else { "MethodCall" };
            if !ctx.is(at, kind) {
                return false;
            }
            let written = if *field { ctx.text(at, "Name") } else { ctx.method_name(at) };
            if written != *name || (!*field && !ctx.arguments(at).is_empty()) {
                return false;
            }
            let Some(next) = ctx.qualifier(at) else { return false };
            at = next;
        }
        match ctx.name(at) {
            "VariableAccess" => symbol(ctx, at) == self.owner,
            "FieldAccess" => {
                ctx.qualifier(at).is_some_and(|this| ctx.is(this, "ThisExpression") && unqualified(ctx, this))
                    && symbol(ctx, at) == self.owner
            }
            _ => false,
        }
    }
}

/// PMD's `JavaRuleUtil.isNullCheck`: `path == null` or `path != null`, either way round.
pub fn null_check(ctx: &Ctx, expression: Option<u32>, path: &StablePath) -> bool {
    let Some(expression) = expression.filter(|at| ctx.is(*at, "InfixExpression")) else {
        return false;
    };
    if !matches!(ctx.text(expression, "Operator").as_str(), "==" | "!=") {
        return false;
    }
    let Some(null) = ctx.kid(expression, "NullLiteral") else { return false };
    path.matches(ctx, other_operand(ctx, null))
}

/// PMD's `JavaAstUtils.getOtherOperandIfInInfixExpr`.
pub fn other_operand(ctx: &Ctx, id: u32) -> Option<u32> {
    let parent = ctx.parent(id).filter(|parent| ctx.is(*parent, "InfixExpression"))?;
    let at = ctx.kids(parent).iter().position(|kid| *kid == id)?;
    ctx.nth(parent, 1 - at)
}

/// Whether a field a name stands for is static and whether it is public; nothing when it names no field.
pub fn field_flags(ctx: &Ctx, access: u32) -> Option<(bool, bool)> {
    use crate::java::types::model::flag;
    match symbol(ctx, access)? {
        Symbol::Declared(variable) => ctx
            .flag(variable, "Field")
            .then(|| (ctx.flag(variable, "Static"), ctx.text(variable, "Visibility") == "public")),
        Symbol::Field(class, name) => {
            let (_, field) = ctx.machine.resolver.index.field(&class, &name)?;
            Some((field.flags & flag::STATIC != 0, field.flags & flag::PUBLIC != 0))
        }
    }
}

/// PMD's `JavaAstUtils.isRefToFieldOfThisInstance`.
pub fn field_of_this_instance(ctx: &Ctx, usage: Option<u32>) -> bool {
    let Some(usage) = usage else { return false };
    let Some((fixed, _)) = field_flags(ctx, usage) else { return false };
    match ctx.name(usage) {
        "VariableAccess" => !fixed,
        "FieldAccess" => ctx
            .qualifier(usage)
            .is_some_and(|this| {
                matches!(ctx.name(this), "ThisExpression" | "SuperExpression") && unqualified(ctx, this)
            }),
        _ => false,
    }
}
