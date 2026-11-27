//! `no-route-without-auth`: a Nest route handler or a router route without the auth requirement the project's
//! other routes declare, learned for the project and passed in as entries.
mod nest;
mod routes;
mod shapes;

use self::nest::nest_handlers;
use self::routes::routes;
use self::shapes::{SEPARATOR, shape_label};
use crate::typescript::rules::Context;
use crate::typescript::rules::writes::imports::imported_bindings;
use std::collections::HashMap;

const RULE: &str = "no-route-without-auth";
const FALLBACK: &str = "fallback";
const OPEN_ON_PURPOSE: &str = "An exception fits a route that is open on purpose (a health check, a login, a webhook).";

fn followed_by(entries: &[String]) -> HashMap<String, String> {
    let mut followed = HashMap::new();
    for entry in entries {
        let mut parts = entry.split(SEPARATOR);
        let framework = parts.next().unwrap_or_default().to_string();
        followed.insert(framework, parts.collect::<Vec<_>>().join(SEPARATOR));
    }
    followed
}

fn missing_shape(shape: &str) -> String {
    format!("This route does not declare `{shape}`, the auth requirement that almost every route in this project declares, so callers it was not meant for can reach it. Add `{shape}`, or mark the route public with the marker the project uses. {OPEN_ON_PURPOSE}")
}

fn missing_guard() -> String {
    format!("This route has no guard at method or class level and no public marker, while other routes in this project declare one, so every caller can reach it. Add a guard (`@UseGuards(...)` or the project auth decorator), or mark the route public. {OPEN_ON_PURPOSE}")
}

fn missing_middleware(middleware: &str) -> String {
    format!("This route is registered without `{middleware}`, the auth middleware that almost every route in this project uses, so callers it was not meant for can reach it. Add `{middleware}` to the route, or to the router before it. {OPEN_ON_PURPOSE}")
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let entries: Vec<String> = serde_json::from_str(context.setting(&format!("{RULE}.entries")).unwrap_or("[]")).unwrap_or_default();
    let followed = followed_by(&entries);
    if followed.is_empty() {
        return;
    }
    let bindings = imported_bindings(view.program());
    let mut found: Vec<(u32, u32, String)> = Vec::new();
    if let Some(shape) = followed.get("nest") {
        for handler in nest_handlers(view, &bindings).into_iter().filter(|handler| !handler.is_public) {
            let Some(key) = handler.node.node("key") else { continue };
            if shape != FALLBACK && !handler.shapes.contains(shape) {
                found.push((key.start(), key.end(), missing_shape(&shape_label(shape))));
            } else if shape == FALLBACK && !handler.is_auth {
                found.push((key.start(), key.end(), missing_guard()));
            }
        }
    }
    if let Some(middleware) = followed.get("route") {
        for route in routes(view, &bindings).into_iter().filter(|route| !(route.is_public || route.shapes.contains(middleware))) {
            found.push((route.node.start(), route.node.end(), missing_middleware(middleware)));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
