//! AndroidInjectionBeforeSuper: `AndroidInjection.inject` called after the lifecycle method of the superclass.
use super::Context;
use super::call_match::static_on_class;
use super::hierarchy::formals;
use super::junit_init::enclosing_class;
use super::positions::preferred;
use crate::engine::source::named_children;
use tree_sitter::Node;

struct Kind {
    component: &'static str,
    lifecycle: &'static str,
    parameters: &'static [&'static str],
    injector: &'static str,
}

const KINDS: [Kind; 6] = [
    Kind { component: "android.app.Activity", lifecycle: "onCreate", parameters: &["android.os.Bundle"], injector: "dagger.android.AndroidInjection" },
    Kind { component: "android.app.Fragment", lifecycle: "onAttach", parameters: &["android.content.Context"], injector: "dagger.android.AndroidInjection" },
    Kind { component: "android.app.Fragment", lifecycle: "onAttach", parameters: &["android.app.Activity"], injector: "dagger.android.AndroidInjection" },
    Kind { component: "android.support.v4.app.Fragment", lifecycle: "onAttach", parameters: &["android.content.Context"], injector: "dagger.android.support.AndroidSupportInjection" },
    Kind { component: "android.support.v4.app.Fragment", lifecycle: "onAttach", parameters: &["android.app.Activity"], injector: "dagger.android.support.AndroidSupportInjection" },
    Kind { component: "android.app.Service", lifecycle: "onCreate", parameters: &[], injector: "dagger.android.AndroidInjection" },
];

fn matches_method(context: &Context, method: Node, kind: &Kind) -> bool {
    if method.child_by_field_name("name").is_none_or(|name| context.text(name) != kind.lifecycle) {
        return false;
    }
    let parameters = formals(method);
    if parameters.len() != kind.parameters.len() {
        return false;
    }
    let exact = parameters.iter().zip(kind.parameters).all(|(parameter, wanted)| {
        context.resolver.declared_type(*parameter, None).is_some_and(|found| matches!(&found, crate::java::types::model::Type::Class(name, _) if name == wanted))
    });
    exact
        && enclosing_class(method)
            .and_then(|class| context.resolver.scope.names.get(&class.id()))
            .is_some_and(|name| context.resolver.index.is_subtype(name, kind.component))
}

fn lifecycle_call(context: &Context, call: Node, kind: &Kind) -> bool {
    if call.child_by_field_name("name").is_none_or(|name| context.text(name) != kind.lifecycle) {
        return false;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return false };
    let owner = if call.child_by_field_name("object").is_some() { resolved.receiver.erased().name() } else { resolved.declaring.clone() };
    !resolved.method.is_static && context.resolver.index.is_subtype(&owner, kind.component)
}

fn inject_call(context: &Context, call: Node, kind: &Kind) -> bool {
    static_on_class(context, call, kind.injector, &["inject"])
        && context.resolver.resolve_call(call).is_some_and(|resolved| {
            matches!(resolved.method.parameters.as_slice(), [crate::java::types::model::Type::Class(name, _)] if name == kind.component)
        })
}

pub fn android_injection_before_super(context: &Context, method: Node) {
    if method.kind() != "method_declaration" {
        return;
    }
    let Some(kind) = KINDS.iter().find(|kind| matches_method(context, method, kind)) else { return };
    let Some(body) = method.child_by_field_name("body") else { return };
    let mut found_super = false;
    for statement in named_children(body).into_iter().filter(|part| part.kind() == "expression_statement") {
        let Some(call) = named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment")).filter(|part| part.kind() == "method_invocation") else { continue };
        if found_super && inject_call(context, call, kind) {
            let message = format!("AndroidInjection.inject() should always be invoked before calling super.{}()", kind.lifecycle);
            return context.report_fixed("AndroidInjectionBeforeSuper", call, preferred(context, call), &message, &[]);
        } else if lifecycle_call(context, call, kind) {
            found_super = true;
        }
    }
}
