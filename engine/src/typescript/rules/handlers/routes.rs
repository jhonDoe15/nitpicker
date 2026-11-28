//! The places of a file where a route handler takes or returns something: what makes a method a Nest route, a
//! function a Next route handler, a call a response being sent, and an assignment a response body.
use crate::typescript::rules::contracts::infrastructure::package_of;
use crate::typescript::rules::contracts::walk::{decorator_names, is_nest_controller, symbol_infrastructure, type_symbols};
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::parse_handle;
use crate::typescript::types::server::Type;

const NEST_ROUTES: [&str; 9] = ["Get", "Post", "Put", "Patch", "Delete", "All", "Head", "Options", "Sse"];
const SEND_METHODS: [&str; 2] = ["json", "send"];
const STATIC_SENDERS: [&str; 2] = ["NextResponse", "Response"];

/// `isTransportObject`: the type of the node, by its symbol or its alias, is a request or response of a framework.
fn is_transport_object(types: &mut Types, expression: &str) -> bool {
    let Some(kind) = types.type_of(expression) else { return false };
    type_symbols(types, &kind).iter().any(|symbol| symbol_infrastructure(symbol).is_some_and(|found| found.is_transport()))
}

/// `isStaticSender`: `NextResponse` of Next or `Response` of the platform.
fn is_static_sender(types: &mut Types, expression: &str) -> bool {
    let Some(target) = types.symbol_named(expression, true) else { return false };
    let Some(declaration) = target.declarations.first() else { return false };
    let Some((_, _, file)) = parse_handle(declaration) else { return false };
    let package = package_of(file);
    STATIC_SENDERS.contains(&target.name.as_str())
        && (package.as_deref() == Some("next") || types.file_kind(declaration).default_library || package.as_deref() == Some("typescript"))
}

/// Whether a call is `object.json(...)` or `object.send(...)` on a response of a framework or the platform's.
pub fn is_send(types: &mut Types, call: &str) -> Option<String> {
    let callee = types.callee_of(call)?;
    let access = types.access_of(&callee)?;
    if !SEND_METHODS.contains(&access.name.as_str()) {
        return None;
    }
    (is_transport_object(types, &access.object) || is_static_sender(types, &access.object)).then_some(access.text)
}

/// Whether the node is an assignment target `response.body`; the text of the target.
pub fn is_body_target(types: &mut Types, target: &str) -> Option<String> {
    let access = types.access_of(target)?;
    (access.name == "body" && is_transport_object(types, &access.object)).then_some(access.text)
}

/// `nestRoute`: a method of a Nest controller that carries a route decorator; the class name and the method name.
pub fn nest_route(types: &mut Types, method: &str) -> Option<String> {
    let member = types.class_member(method)?;
    if !is_nest_controller(types, &member.class) {
        return None;
    }
    if !decorator_names(types, method, &["@nestjs/common"]).iter().any(|name| NEST_ROUTES.contains(&name.as_str())) {
        return None;
    }
    Some(format!("{}.{}", member.class_name.as_deref().unwrap_or("controller"), member.name_text))
}

/// The types a declaration's signature takes, then the type it returns.
pub fn signature_types(types: &mut Types, declaration: &str) -> Vec<Type> {
    types.signature_of(declaration).map(|signature| types.signature_types(&signature)).unwrap_or_default()
}
