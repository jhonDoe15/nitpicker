use crate::typescript::rules::Context;
use crate::typescript::rules::support::estree::{expression_id, key_name, member, parent, wrapper_top};
use crate::typescript::rules::support::globals::{is_global_object, is_process_module, is_process_value};
use oxc_ast::AstKind;
use oxc_ast::ast::{AssignmentTarget, AssignmentTargetProperty, BindingPattern, Expression, ImportDeclarationSpecifier, ModuleExportName, StringLiteral};
use oxc_semantic::{NodeId, SymbolId};
use oxc_span::{GetSpan, Span};
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-production-console";
const CONSOLE: &str = "console";
const ALL_STREAMS: &str = "stdout and process.stderr";
static COMPOSITION_ROOT: LazyLock<Regex> = LazyLock::new(|| {
    let file = r"(?:main|server|composition-root)\.[cm]?[jt]sx?";
    Regex::new(&format!("(?:^|/)(?:main/(?:{file}|composition-root/.+)|src/{file})$")).expect("pattern")
});

enum Found {
    Console(Span, String),
    Stream(Span, String),
}

fn stream_use(span: Span, name: Option<&str>) -> Option<Found> {
    name.filter(|name| matches!(*name, "stdout" | "stderr")).map(|name| Found::Stream(span, name.to_string()))
}

fn console_reference(context: &Context, used: NodeId) -> Found {
    let top = wrapper_top(context, used);
    let above = parent(context, top);
    let Some(access) = member(above.kind()).filter(|access| expression_id(access.object) == top) else {
        return Found::Console(context.semantic.nodes().kind(top).span(), CONSOLE.to_string());
    };
    let property = match &access.name {
        Some(name) => format!(".{name}"),
        None => format!("[{}]", context.text(access.property)),
    };
    let callee = wrapper_top(context, access.id);
    let called = matches!(parent(context, callee).kind(), AstKind::CallExpression(call) if expression_id(&call.callee) == callee);
    Found::Console(access.span, format!("console{property}{}", if called { "()" } else { "" }))
}

fn is_type_context(context: &Context, used: NodeId) -> bool {
    match parent(context, wrapper_top(context, used)).kind() {
        AstKind::TSTypeQuery(_) => true,
        AstKind::UnaryExpression(unary) => unary.operator.is_typeof(),
        _ => false,
    }
}

fn global_console_uses(context: &Context, found: &mut Vec<Found>) {
    let scoping = context.semantic.scoping();
    let unresolved = scoping.root_unresolved_references().iter().filter(|(name, _)| name.as_str() == CONSOLE);
    for reference in unresolved.flat_map(|(_, references)| references.iter()) {
        let used = scoping.get_reference(*reference).node_id();
        if !is_type_context(context, used) {
            found.push(console_reference(context, used));
        }
    }
}

fn check_member<'a>(context: &Context<'a, '_>, kind: AstKind<'a>, found: &mut Vec<Found>) {
    let Some(access) = member(kind) else { return };
    if access.name.as_deref() == Some(CONSOLE) && is_global_object(context, access.object) {
        found.push(console_reference(context, access.id));
    }
    if let Some(stream) = stream_use(access.span, access.name.as_deref()) && is_process_value(context, access.object) {
        found.push(stream);
    }
}

fn rest_stream_reads(context: &Context, symbol: Option<SymbolId>, found: &mut Vec<Found>) {
    let Some(symbol) = symbol else { return };
    let scoping = context.semantic.scoping();
    for reference in scoping.get_resolved_reference_ids(symbol) {
        let reader = parent(context, scoping.get_reference(*reference).node_id());
        found.extend(member(reader.kind()).and_then(|access| stream_use(access.span, access.name.as_deref())));
    }
}

fn check_properties<'a>(context: &Context<'a, '_>, source: &'a Expression<'a>, properties: &[(Span, Option<String>)], found: &mut Vec<Found>) -> bool {
    if is_global_object(context, source) {
        let named = properties.iter().filter(|(_, name)| name.as_deref() == Some(CONSOLE));
        found.extend(named.map(|(span, _)| Found::Console(*span, CONSOLE.to_string())));
    }
    let from_process = is_process_value(context, source);
    if from_process {
        found.extend(properties.iter().filter_map(|(span, name)| stream_use(*span, name.as_deref())));
    }
    from_process
}

fn check_pattern<'a>(context: &Context<'a, '_>, id: NodeId, kind: AstKind<'a>, found: &mut Vec<Found>) {
    let source = match parent(context, id).kind() {
        AstKind::VariableDeclarator(declarator) => declarator.init.as_ref(),
        AstKind::AssignmentPattern(pattern) => Some(&pattern.right),
        AstKind::FormalParameter(parameter) => parameter.initializer.as_deref(),
        AstKind::AssignmentExpression(assignment) => Some(&assignment.right),
        AstKind::AssignmentTargetWithDefault(target) => Some(&target.init),
        _ => None,
    };
    let Some(source) = source else { return };
    match kind {
        AstKind::ObjectPattern(pattern) => {
            let properties: Vec<_> = pattern.properties.iter().map(|property| (property.span, key_name(&property.key, property.computed))).collect();
            if check_properties(context, source, &properties, found)
                && let Some(BindingPattern::BindingIdentifier(rest)) = pattern.rest.as_ref().map(|rest| &rest.argument)
            {
                rest_stream_reads(context, rest.symbol_id.get(), found);
            }
        }
        AstKind::ObjectAssignmentTarget(pattern) => {
            let properties: Vec<_> = pattern
                .properties
                .iter()
                .map(|property| match property {
                    AssignmentTargetProperty::AssignmentTargetPropertyIdentifier(short) => (short.span, Some(short.binding.name.to_string())),
                    AssignmentTargetProperty::AssignmentTargetPropertyProperty(full) => (full.span, key_name(&full.name, full.computed)),
                })
                .collect();
            if check_properties(context, source, &properties, found)
                && let Some(AssignmentTarget::AssignmentTargetIdentifier(rest)) = pattern.rest.as_ref().map(|rest| &rest.target)
            {
                rest_stream_reads(context, context.semantic.scoping().get_reference(rest.reference_id()).symbol_id(), found);
            }
        }
        _ => {}
    }
}

fn exported_name<'a>(name: &ModuleExportName<'a>) -> Option<&'a str> {
    match name {
        ModuleExportName::IdentifierName(identifier) => Some(identifier.name.as_str()),
        ModuleExportName::IdentifierReference(identifier) => Some(identifier.name.as_str()),
        ModuleExportName::StringLiteral(literal) => literal.value.as_str(),
    }
}

fn process_source(source: &StringLiteral) -> bool {
    source.value.as_str().is_some_and(is_process_module)
}

fn check_module_edges(kind: AstKind, found: &mut Vec<Found>) {
    match kind {
        AstKind::ImportDeclaration(import) if process_source(&import.source) && !import.import_kind.is_type() => {
            for specifier in import.specifiers.iter().flatten() {
                if let ImportDeclarationSpecifier::ImportSpecifier(named) = specifier && !named.import_kind.is_type() {
                    found.extend(stream_use(named.span, exported_name(&named.imported)));
                }
            }
        }
        AstKind::ExportFromDeclaration(export) if process_source(&export.source) && !export.export_kind.is_type() => {
            let named = export.specifiers.iter().filter(|specifier| !specifier.export_kind.is_type());
            found.extend(named.filter_map(|specifier| stream_use(specifier.span, exported_name(&specifier.local))));
        }
        AstKind::ExportAllDeclaration(export) if process_source(&export.source) && !export.export_kind.is_type() => {
            found.push(Found::Stream(export.span, ALL_STREAMS.to_string()));
        }
        _ => {}
    }
}

pub fn check(context: &mut Context) {
    let mut found = Vec::new();
    global_console_uses(context, &mut found);
    for node in context.semantic.nodes().iter() {
        check_member(context, node.kind(), &mut found);
        check_pattern(context, node.id(), node.kind(), &mut found);
        check_module_edges(node.kind(), &mut found);
    }
    let streams_allowed = match context.setting(&format!("{RULE}.streams-allowed")) {
        Some(answer) => answer == "true",
        None => COMPOSITION_ROOT.is_match(&context.file.path.replace('\\', "/")),
    };
    for entry in found {
        match entry {
            Found::Console(span, reference) => context.report_range(RULE, span.start, Some(span.end), format!("Use the application logger instead of {reference}. Program output goes through a `{{ write(text: string): void }}` parameter that the composition root fills with process.stdout or process.stderr. An exception fits only when this module is a script that prints the program output.")),
            Found::Stream(span, stream) if !streams_allowed => context.report_range(RULE, span.start, Some(span.end), format!("Reach process.{stream} only in the composition root or an entry point: take a `{{ write(text: string): void }}` parameter and write through it, and let the entry pass process.stdout or process.stderr (and any isTTY or columns value) as an argument. An exception fits only when this module is a script that prints the program output.")),
            Found::Stream(..) => {}
        }
    }
}
