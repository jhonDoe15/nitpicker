//! The rules on calls each test makes: `no-git-repository-per-test`, `no-node-process-per-test` and
//! `no-server-or-worker-per-test`.
use super::per_test_reports;
use super::subprocess::{describe_subprocess, git_subcommand, subprocess_bindings};
use super::wrapper::describe_wrapper_call;
use crate::typescript::rules::Context;
use crate::typescript::rules::test_assertions::unowned_async::nodes::{imported_callee_name, module_bindings};
use crate::typescript::rules::test_quality::runner_words::runner_word;

const GIT_RULE: &str = "no-git-repository-per-test";
const NODE_RULE: &str = "no-node-process-per-test";
const SERVER_RULE: &str = "no-server-or-worker-per-test";
const NODE_COMMANDS: [&str; 9] = ["node", "package-bin", "npx", "npm", "pnpm", "yarn", "bunx", "tsx", "ts-node"];
const SERVER_MODULES: [&str; 10] = ["http", "node:http", "https", "node:https", "http2", "node:http2", "net", "node:net", "tls", "node:tls"];
const WORKER_MODULES: [&str; 2] = ["worker_threads", "node:worker_threads"];
const SERVER_FACTORIES: [&str; 2] = ["createServer", "createSecureServer"];
const NODE_MESSAGE: &str = "Do not start a Node process (process.execPath, node, npx or a node_modules/.bin script) from a test or beforeEach. Import the function and call it in-process; start the application as a process only through the AppProcess harness in the test fixtures. An exception fits only when this test checks the process boundary itself (exit codes, signals, stdout).";

fn report_all(context: &mut Context, rule: &str, found: Vec<(u32, u32)>, message: &str) {
    for (start, end) in found {
        context.report_range(rule, start, Some(end), message.to_string());
    }
}

pub fn no_git_repository_per_test(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let bindings = subprocess_bindings(view.program());
    let found = per_test_reports(view, scopes, |node| {
        let (command, tokens) = match describe_subprocess(scopes, node, &bindings) {
            Some(direct) => (direct.command, direct.tokens),
            None => match describe_wrapper_call(scopes, node, &bindings) {
                Some(wrapper) => (wrapper.command, wrapper.tokens),
                None => return false,
            },
        };
        command.as_deref() == Some("git") && matches!(git_subcommand(&tokens), Some("init" | "clone"))
    });
    let hook = runner_word(context, GIT_RULE, "shared-setup-hook");
    let message = format!("Do not create a git repository in each test or beforeEach. Build a template repository once in {hook} and copy it per test with cpSync.");
    let found = found.iter().map(|node| (node.start(), node.end())).collect();
    report_all(context, GIT_RULE, found, &message);
}

pub fn no_node_process_per_test(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let bindings = subprocess_bindings(view.program());
    let found = per_test_reports(view, scopes, |node| {
        let command = describe_subprocess(scopes, node, &bindings).and_then(|described| described.command);
        command.is_some_and(|command| NODE_COMMANDS.contains(&command.as_str()))
    });
    let found = found.iter().map(|node| (node.start(), node.end())).collect();
    report_all(context, NODE_RULE, found, NODE_MESSAGE);
}

pub fn no_server_or_worker_per_test(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let servers = module_bindings(view.program(), &SERVER_MODULES);
    let workers = module_bindings(view.program(), &WORKER_MODULES);
    let found = per_test_reports(view, scopes, |node| {
        let Some(callee) = node.node("callee") else { return false };
        if node.is("CallExpression") {
            return imported_callee_name(callee, &servers).is_some_and(|name| SERVER_FACTORIES.contains(&name.as_str()));
        }
        imported_callee_name(callee, &workers).as_deref() == Some("Worker") || imported_callee_name(callee, &servers).as_deref() == Some("Server")
    });
    let hook = runner_word(context, SERVER_RULE, "shared-setup-hook");
    let message = format!("Do not start a server or worker thread in each test or beforeEach. Start it once in {hook} and reset its state between tests, or test the logic against an in-memory implementation and keep the real transport for transport tests. An exception fits only when each test needs a fresh server.");
    let found = found.iter().map(|node| (node.start(), node.end())).collect();
    report_all(context, SERVER_RULE, found, &message);
}
