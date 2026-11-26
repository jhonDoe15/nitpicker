//! UnusedAssignment and ImplicitSwitchFallThrough, read off the data flow of the file.
use super::{Entry, Tri};
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::{hit, hit_saying};
use regex::Regex;
use std::sync::LazyLock;

static FALLS_THROUGH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)/[/*].*\b[fF][aA][lL][lL][sS]?[ -]?[tT][hH][rR]([oO][uU][gG][hH]|[uU])\b.*").expect("valid pattern"));

fn line(ctx: &Ctx, node: u32) -> i64 {
    ctx.whole(node, "BeginLine").unwrap_or(0)
}

fn unary_reassign(ctx: &Ctx, entry: &Entry) -> bool {
    ctx.is(entry.rhs, "UnaryExpression")
        && !super::pure(ctx, entry.rhs)
        && ctx
            .nth(entry.rhs, 0)
            .filter(|operand| matches!(ctx.name(*operand), "VariableAccess" | "FieldAccess"))
            .and_then(|operand| super::sym_of(ctx, operand))
            == Some(entry.var)
}

fn initializer(ctx: &Ctx, entry: &Entry) -> bool {
    ctx.parent(entry.rhs).is_some_and(|parent| ctx.is(parent, "VariableDeclarator"))
        && ctx.nth(ctx.parent(entry.rhs).unwrap_or(0), 0) != Some(entry.rhs)
}

fn kind(ctx: &Ctx, variable: u32) -> &'static str {
    let ancestors: Vec<u32> = ctx.ancestors(variable).take(3).collect();
    let at = |index: usize, name: &str| ancestors.get(index).is_some_and(|node| ctx.is(*node, name));
    if at(1, "FieldDeclaration") {
        "field"
    } else if super::is_resource(ctx, variable) {
        "resource"
    } else if at(0, "CatchParameter") {
        "exception parameter"
    } else if at(2, "ForeachStatement") {
        "loop variable"
    } else if at(0, "FormalParameter") || at(0, "LambdaParameter") {
        "parameter"
    } else {
        "variable"
    }
}

fn message(ctx: &Ctx, entry: &Entry, reason: Option<&str>, field: bool, unary: bool) -> String {
    let mut out = String::new();
    if initializer(ctx, entry) {
        out.push_str(if field { "the field initializer for" } else { "the initializer for variable" });
    } else if ctx.is(entry.rhs, "VariableId") {
        if reason.is_some() {
            out.push_str("the initial value of ");
        }
        out.push_str(kind(ctx, entry.node));
    } else {
        out.push_str(if unary { "the updated value of " } else { "the value assigned to " });
        out.push_str(if field { "field" } else { "variable" });
    }
    out.push_str(&format!(" ''{}'' is never used", ctx.text(entry.node, "Name")));
    if let Some(reason) = reason {
        out.push_str(&format!(" ({reason})"));
    }
    let mut chars = out.chars();
    chars.next().map(|first| first.to_uppercase().chain(chars).collect()).unwrap_or_default()
}

fn ignorable_prefix(ctx: &Ctx, unary: u32, check: bool) -> bool {
    !check
        && ctx.flag(unary, "Prefix")
        && !ctx.parent(unary).is_some_and(|parent| ctx.is(parent, "ExpressionStatement"))
}

fn explicitly_unused(name: &str) -> bool {
    name.starts_with("ignored") || name.starts_with("unused") || name == "_"
}

pub fn unused_assignment(ctx: &Ctx, out: &mut Vec<Hit>) {
    let flow = ctx.flow();
    let check_prefix = ctx.property_flag("checkUnusedPrefixIncrement", false);
    let report_variables = ctx.property_flag("reportUnusedVariables", false);
    for id in &flow.unused {
        let entry = &flow.entries[*id as usize];
        let unary = unary_reassign(ctx, entry);
        if unary && ignorable_prefix(ctx, entry.rhs, check_prefix) {
            continue;
        }
        let field = super::is_field(ctx, entry.var);
        let overlap = !report_variables && (initializer(ctx, entry) || ctx.is(entry.rhs, "VariableId"));
        let killers = flow.killers.get(id).map(Vec::as_slice).unwrap_or_default();
        let reason = match killers {
            [] if field || overlap => continue,
            [] => None,
            [killer] if flow.entries[*killer as usize].rhs == entry.rhs => {
                if overlap {
                    continue;
                }
                (!super::is_foreach_variable(ctx, entry.node)).then(|| "reassigned every iteration".to_string())
            }
            [killer] => Some(format!("overwritten on line {}", line(ctx, flow.entries[*killer as usize].rhs))),
            _ => {
                let mut sorted: Vec<u32> = killers.iter().map(|killer| flow.entries[*killer as usize].rhs).collect();
                sorted.sort_by_key(|rhs| (line(ctx, *rhs), ctx.whole(*rhs, "BeginColumn").unwrap_or(0)));
                let lines: Vec<String> = sorted.iter().map(|rhs| line(ctx, *rhs).to_string()).collect();
                let (last, rest) = lines.split_last().unwrap_or((&lines[0], &[]));
                Some(format!("overwritten on lines {} and {last}", rest.join(", ")))
            }
        };
        if reason.is_none() && explicitly_unused(&ctx.text(entry.node, "Name")) {
            continue;
        }
        out.push(hit_saying(entry.rhs, message(ctx, entry, reason.as_deref(), field, unary)));
    }
}

/// Whether a comment right before the next branch says that falling through is meant.
fn commented(ctx: &Ctx, branch: u32, next: u32) -> bool {
    let (end, start) = (ctx.tree.nodes[branch as usize].end, ctx.tree.nodes[next as usize].start);
    let gap = crate::java::pmd::tree::unicode_unescaped(ctx.file.text.get(end..start).unwrap_or_default());
    let mut at = gap.as_str();
    while let Some(open) = at.find('/') {
        let rest = &at[open..];
        let close = if rest.starts_with("//") {
            rest.find('\n').unwrap_or(rest.len())
        } else if rest.starts_with("/*") {
            rest[2..].find("*/").map_or(rest.len(), |close| close + 4)
        } else {
            1
        };
        let comment = rest[..close].trim_end_matches('\r');
        if close > 1 && FALLS_THROUGH.is_match(comment) {
            return true;
        }
        at = &rest[close.max(1)..];
    }
    false
}

pub fn implicit_switch_fall_through(ctx: &Ctx, out: &mut Vec<Hit>) {
    let flow = ctx.flow();
    let mut switches: Vec<u32> = ["SwitchStatement", "SwitchExpression"].iter().flat_map(|name| ctx.all(name).to_vec()).collect();
    switches.sort_unstable();
    for switch in switches {
        let kids = ctx.kids(switch);
        let branches: Vec<u32> = kids.iter().copied().filter(|kid| matches!(ctx.name(*kid), "SwitchArrowBranch" | "SwitchFallthroughBranch")).collect();
        for (index, branch) in branches.iter().copied().enumerate() {
            if !ctx.is(branch, "SwitchFallthroughBranch") || kids.last() == Some(&branch) {
                break;
            }
            let falls = flow.falls.get(&branch).copied().unwrap_or(Tri::No);
            let statements = ctx.kids(branch).iter().any(|kid| !ctx.is(*kid, "SwitchLabel"));
            let Some(next) = branches.get(index + 1).copied() else { continue };
            if falls != Tri::No && statements && !commented(ctx, branch, next) {
                if let Some(label) = ctx.kid(next, "SwitchLabel") {
                    out.push(hit(label));
                }
            }
        }
    }
}
