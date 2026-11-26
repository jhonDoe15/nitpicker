//! `no-local-time-zone`: the first problem found for each call or `new` expression is reported on it.
use super::date_calls::{constructor_problem, date_method_problem, intl_problem, parse_problem};
use super::library_calls::{date_fns_problem, dayjs_problem, luxon_problem};
use super::{Env, Problem};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;

const RULE: &str = "no-local-time-zone";

type Check = fn(&Env, Node) -> Option<Problem>;

const CALL_CHECKS: [Check; 6] = [date_method_problem, intl_problem, parse_problem, luxon_problem, date_fns_problem, dayjs_problem];
const NEW_CHECKS: [Check; 2] = [constructor_problem, intl_problem];

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let env = Env { scopes, types };
    let mut found = Vec::new();
    for node in view.nodes() {
        let checks: &[Check] = match node.kind() {
            "CallExpression" => &CALL_CHECKS,
            "NewExpression" => &NEW_CHECKS,
            _ => continue,
        };
        if let Some(problem) = checks.iter().find_map(|check| check(&env, node)) {
            found.push((node.start(), node.end(), problem.message()));
        }
        if types.borrow().refused.is_some() {
            return;
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
