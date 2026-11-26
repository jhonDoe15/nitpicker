//! Index and iterator loops that a for-each loop states more plainly.
use crate::java::pmd::coded::bestpractices::calls::literal_int;
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::design::style::same_variable;
use crate::java::pmd::coded::hit;
use crate::java::types::model::Type;

struct Loop {
    id: u32,
    init: Option<u32>,
    update: Option<u32>,
    condition: Option<u32>,
}

impl Loop {
    fn of(ctx: &Ctx, id: u32) -> Loop {
        Loop {
            id,
            init: ctx.kid(id, "ForInit").and_then(|init| ctx.nth(init, 0)),
            update: ctx.kid(id, "ForUpdate").and_then(|update| ctx.nth(update, 0)),
            condition: ctx.kids(id).iter().copied().find(|kid| ctx.is_expression(*kid)),
        }
    }
}

fn call_matching(ctx: &Ctx, id: Option<u32>, written: &str) -> bool {
    id.is_some_and(|at| ctx.is(at, "MethodCall") && ctx.matches_sig(at, written))
}

fn initializer(ctx: &Ctx, variable: u32) -> Option<u32> {
    let declarator = ctx.parent(variable).filter(|parent| ctx.is(*parent, "VariableDeclarator"))?;
    ctx.nth(declarator, 1)
}

fn index_variable(ctx: &Ctx, found: &Loop) -> Option<u32> {
    let Some(init) = found.init else { return guess_from_update(ctx, found.update) };
    if !ctx.is(init, "LocalVariableDeclaration") {
        return None;
    }
    let ids: Vec<u32> = ctx
        .kids_named(init, "VariableDeclarator")
        .filter_map(|declarator| ctx.kid(declarator, "VariableId"))
        .collect();
    let [first] = ids.as_slice() else { return None };
    let value = initializer(ctx, *first);
    let fits = call_matching(ctx, value, "java.lang.Iterable#iterator()")
        || value.is_some_and(|value| literal_int(ctx, value, 0));
    fits.then_some(*first)
}

fn guess_from_update(ctx: &Ctx, update: Option<u32>) -> Option<u32> {
    let update = update.filter(|list| ctx.kids(*list).len() == 1)?;
    let only = ctx.nth(update, 0)?;
    if ctx.is(only, "UnaryExpression") {
        if ctx.text(only, "Operator") != "++" {
            return None;
        }
        let operand = ctx.nth(only, 0).filter(|operand| ctx.is(*operand, "VariableAccess"))?;
        return ctx.usages().declaration(operand);
    }
    let adds_one = ctx.is(only, "AssignmentExpression")
        && ctx.text(only, "Operator") == "+="
        && ctx.nth(only, 1).is_some_and(|right| literal_int(ctx, right, 1));
    if !adds_one {
        return None;
    }
    let left = ctx.nth(only, 0).filter(|left| matches!(ctx.name(*left), "VariableAccess" | "FieldAccess"))?;
    ctx.usages().declaration(left)
}

fn iterable_from_condition(ctx: &Ctx, condition: u32, index: u32) -> Option<u32> {
    if !ctx.is(condition, "InfixExpression") {
        return None;
    }
    let operator = ctx.text(condition, "Operator");
    let left = ctx.nth(condition, 0)?;
    let named = matches!(ctx.name(left), "VariableAccess" | "FieldAccess");
    if !named || ctx.usages().declaration(left) != Some(index) {
        return None;
    }
    let right = ctx.nth(condition, 1)?;
    let size = match operator.as_str() {
        "<" => right,
        "<=" => {
            let minus_one = ctx.is(right, "InfixExpression")
                && ctx.text(right, "Operator") == "-"
                && ctx.nth(right, 1).is_some_and(|one| literal_int(ctx, one, 1));
            if !minus_one {
                return None;
            }
            ctx.nth(right, 0)?
        }
        _ => return None,
    };
    let iterable = if ctx.is(size, "FieldAccess") && ctx.text(size, "Name") == "length" {
        ctx.qualifier(size)
    } else if call_matching(ctx, Some(size), "java.util.Collection#size()") {
        ctx.qualifier(size)
    } else {
        None
    }?;
    let named = matches!(ctx.name(iterable), "VariableAccess" | "FieldAccess");
    (named && ctx.resolves(iterable)).then_some(iterable)
}

fn simple_increment(ctx: &Ctx, found: &Loop, index: u32) -> bool {
    guess_from_update(ctx, found.update) == Some(index)
}

fn occurrences_match(ctx: &Ctx, found: &Loop, index: u32, matches: impl Fn(u32) -> bool) -> bool {
    ctx.usages().of_variable(index).iter().all(|&usage| {
        let top = ctx.top_level_expression(usage);
        let in_update_or_condition = (found.update.is_some() && ctx.parent(top) == found.update)
            || found.condition == Some(top);
        in_update_or_condition || matches(usage)
    })
}

fn array_index(ctx: &Ctx, usage: u32, array: u32) -> bool {
    let Some(access) = ctx.parent(usage).filter(|parent| ctx.is(*parent, "ArrayAccess")) else { return false };
    ctx.text(access, "AccessType") == "READ" && same_variable(ctx, ctx.nth(access, 0), Some(array))
}

fn list_get_index(ctx: &Ctx, usage: u32, list: u32) -> bool {
    let call = ctx.parent(usage).filter(|parent| ctx.is(*parent, "ArgumentList")).and_then(|args| ctx.parent(args));
    call_matching(ctx, call, "java.util.List#get(int)")
        && call.is_some_and(|call| same_variable(ctx, ctx.qualifier(call), Some(list)))
}

fn iterator_loop(ctx: &Ctx, variable: u32, found: &Loop) -> bool {
    let usages = ctx.usages().of_variable(variable);
    let [first, second] = usages else { return false };
    let next_inside = |usage: u32| {
        call_matching(ctx, ctx.parent(usage), "java.util.Iterator#next()") && ctx.ancestors(usage).any(|at| at == found.id)
    };
    let has_next_in_condition = |usage: u32| {
        found.condition.is_some() && found.condition == ctx.parent(usage)
            && call_matching(ctx, ctx.parent(usage), "java.util.Iterator#hasNext()")
    };
    has_next_in_condition(*first) && next_inside(*second) || next_inside(*first) && has_next_in_condition(*second)
}

pub fn for_loop_can_be_foreach(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &id in ctx.all("ForStatement") {
        let found = Loop::of(ctx, id);
        let Some(condition) = found.condition else { continue };
        if found.init.is_none() && found.update.is_none() {
            continue;
        }
        let Some(index) = index_variable(ctx, &found) else { continue };
        if ctx.type_of(index) == Some(Type::Primitive("int")) {
            let Some(iterable) = iterable_from_condition(ctx, condition, index) else { continue };
            let array = matches!(ctx.type_of(iterable), Some(Type::Array(_)))
                && simple_increment(ctx, &found, index)
                && occurrences_match(ctx, &found, index, |usage| array_index(ctx, usage, iterable));
            let list = || {
                ctx.type_is(iterable, "java.util.List")
                    && simple_increment(ctx, &found, index)
                    && occurrences_match(ctx, &found, index, |usage| list_get_index(ctx, usage, iterable))
            };
            if array || list() {
                out.push(hit(id));
            }
        } else if ctx.type_is(index, "java.util.Iterator") && iterator_loop(ctx, index, &found) {
            out.push(hit(id));
        }
    }
}
