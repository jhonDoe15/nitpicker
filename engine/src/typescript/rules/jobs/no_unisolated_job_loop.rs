//! `no-unisolated-job-loop`: a `for...of` loop of a scheduled or queue job that awaits database or remote work for
//! each item with no per-item `try`/`catch` or `.catch(...)`.
use super::item_work::{is_isolated, item_work, settles_all};
use super::job_kinds::{Bindings, job_kind};
use crate::typescript::rules::writes::imports::imported_bindings;
use crate::typescript::rules::Context;
use crate::typescript::rules::contracts::infrastructure::interpolate;
use crate::typescript::rules::effects::describe_path;
use crate::typescript::rules::effects::summaries::State;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use std::cell::RefCell;

const RULE: &str = "no-unisolated-job-loop";
const MESSAGE: &str = concat!(
    "This loop in the {{job}} awaits {{work}} for each item with no per-item `try`/`catch` or `.catch(...)`, so the ",
    "first item that throws skips every item after it until the next run, and an item that keeps failing ",
    "blocks the rest for good. Catch and record the failure per item ",
    "(`try { ... } catch (error) { logger.error(...) }` or `.catch((error) => logger.error(error))`), enqueue one job per item, or use ",
    "`Promise.allSettled` and report the failures. ",
    "An exception fits only when the whole run must fail so that it is retried."
);

type Found = Vec<(u32, u32, String)>;

fn is_fixed_list(loop_node: Node) -> bool {
    let Some(right) = loop_node.node("right").filter(|right| right.is("ArrayExpression")) else { return false };
    right.list("elements").iter().all(|element| element.is_some_and(|element| element.is("Literal")))
}

fn loops_in(body: Node) -> Vec<Node> {
    let mut loops = Vec::new();
    let mut pending = vec![body];
    let mut index = 0;
    while index < pending.len() {
        let node = pending[index];
        index += 1;
        if node.is("ForOfStatement") {
            if !is_fixed_list(node) {
                loops.push(node);
            }
        } else {
            pending.extend(node.children().into_iter().filter(|child| !child.is("FunctionExpression") && !child.is("ArrowFunctionExpression")));
        }
    }
    loops
}

fn check(types: &RefCell<Types>, state: &mut State, bindings: &Bindings, function: Node, found: &mut Found) {
    let Some(job) = job_kind(function, bindings) else { return };
    let Some(body) = function.node("body") else { return };
    for loop_node in loops_in(body) {
        if types.borrow().refused.is_some() {
            return;
        }
        let work = item_work(types, state, loop_node);
        let first = work.into_iter().find(|item| !is_isolated(item.call, loop_node));
        if let Some(first) = first.filter(|_| !settles_all(loop_node)) {
            let text = interpolate(MESSAGE, &[("job", &job), ("work", &describe_path(&first.path))]);
            found.push((loop_node.start(), loop_node.end(), text));
        }
    }
}

pub fn no_unisolated_job_loop(context: &mut Context) {
    let (Some((view, _)), Some(types)) = (context.estree, context.types) else { return };
    let setting = context.setting(&format!("{RULE}.test-sources")).map(str::to_string);
    let mut state: State = {
        let mut borrowed = types.borrow_mut();
        if borrowed.refused.is_some() {
            return;
        }
        borrowed.take_store()
    };
    state.with_tests(setting.as_deref());
    let mut found: Found = Vec::new();
    let bindings = imported_bindings(view.program());
    for node in view.nodes().filter(|node| node.is("FunctionExpression") || node.is("ArrowFunctionExpression")) {
        if types.borrow().refused.is_some() {
            break;
        }
        check(types, &mut state, &bindings, node, &mut found);
    }
    let refused = types.borrow().refused.is_some();
    types.borrow_mut().put_store(if refused { state.after_refusal() } else { state });
    if refused {
        return;
    }
    for (start, end, text) in found {
        context.report_range(RULE, start, Some(end), text);
    }
}
