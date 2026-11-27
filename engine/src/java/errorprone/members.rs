//! Class members in the order javac keeps them, and checks on that order.
use super::Context;
use super::fixes::Fix;
use super::fix_helpers::{add_modifiers, qualify_type, remove_modifiers};
use crate::engine::source::{children, named_children};
use std::collections::HashMap;
use tree_sitter::Node;

pub const BODIES: &[&str] = &["class_body", "interface_body", "enum_body", "annotation_type_body"];

/// One entry per member as javac lists them: a field declaration with two names is two members.
pub fn members<'t>(body: Node<'t>) -> Vec<Node<'t>> {
    let mut list = Vec::new();
    for child in named_children(body) {
        match child.kind() {
            "field_declaration" | "constant_declaration" => {
                let names = children(child).into_iter().filter(|part| part.kind() == "variable_declarator").count();
                list.extend(std::iter::repeat_n(child, names.max(1)));
            }
            "enum_body_declarations" => list.extend(members(child)),
            kind if kind.ends_with("comment") => {}
            _ => list.push(child),
        }
    }
    list
}

pub fn is_method(member: Node) -> bool {
    matches!(
        member.kind(),
        "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" | "annotation_type_element_declaration"
    )
}

fn method_key<'f>(context: &'f Context, method: Node) -> &'f str {
    if method.kind() == "method_declaration" || method.kind() == "annotation_type_element_declaration" {
        method.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
    } else {
        "<init>"
    }
}

pub fn ungrouped_overloads(context: &Context, node: Node) {
    if !BODIES.contains(&node.kind()) {
        return;
    }
    let list = members(node);
    let mut order: Vec<&str> = Vec::new();
    let mut groups: HashMap<&str, Vec<usize>> = HashMap::new();
    for (index, member) in list.iter().enumerate() {
        if is_method(*member) {
            let key = method_key(context, *member);
            groups.entry(key).or_insert_with(|| {
                order.push(key);
                Vec::new()
            }).push(index);
        }
    }
    for key in order {
        let indices = &groups[key];
        let mut group = 0;
        let numbered: Vec<(usize, usize)> = indices
            .iter()
            .enumerate()
            .map(|(at, index)| {
                if at > 0 && indices[at - 1] != index - 1 {
                    group += 1;
                }
                (*index, group)
            })
            .collect();
        if group == 0 || indices.iter().any(|index| context.suppressed("UngroupedOverloads", list[*index])) {
            continue;
        }
        let fix = grouping_fix(context, &list, indices);
        let name = if key == "<init>" { "constructor overloads".to_string() } else { format!("overloads of '{key}'") };
        for (index, own) in &numbered {
            let lines: Vec<String> = numbered
                .iter()
                .filter(|(_, other)| other != own)
                .map(|(other, _)| (list[*other].start_position().row + 1).to_string())
                .collect();
            let Some(at) = list[*index].child_by_field_name("name") else { continue };
            context.report_fixed(
                "UngroupedOverloads",
                node,
                at.start_byte(),
                &format!(
                    "Overloads should be grouped together, even when modifiers such as static or private differ between the methods; found ungrouped {name} on line(s): {}",
                    lines.join(", ")
                ),
                std::slice::from_ref(&fix),
            );
        }
    }
}

/// Where javac ends the member at `index`: a field with several names ends each but the last at its name.
fn member_end(list: &[Node], index: usize) -> usize {
    let member = list[index];
    let position = list[..index].iter().filter(|other| other.id() == member.id()).count();
    let declarators: Vec<Node> = children(member).into_iter().filter(|part| part.kind() == "variable_declarator").collect();
    match declarators.get(position) {
        Some(declarator) if position + 1 < declarators.len() => declarator.end_byte(),
        _ => member.end_byte(),
    }
}

/// Replaces the first overload with all of them and removes the others.
fn grouping_fix(context: &Context, list: &[Node], indices: &[usize]) -> Fix {
    let first = list[indices[0]];
    let mut grouped = format!("\n{}", context.text(first));
    let mut fix = Fix::new();
    for index in &indices[1..] {
        let start = member_end(list, index - 1);
        let end = member_end(list, *index);
        grouped.push_str(&context.file.text[start..end]);
        grouped.push('\n');
        fix = fix.delete(start, end);
    }
    fix.and(first.start_byte(), first.end_byte(), grouped)
}

fn in_generated_class(context: &Context, node: Node) -> bool {
    let mut current = crate::engine::source::parent(node);
    while let Some(at) = current {
        if matches!(at.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration")
            && super::hierarchy::has_annotation(context, at, "Generated")
        {
            return true;
        }
        current = crate::engine::source::parent(at);
    }
    false
}

pub fn missing_override(context: &Context, node: Node) {
    use super::hierarchy::{declared_method, formals, has_annotation, simple_name, super_method};
    use crate::java::types::model::flag;
    if node.kind() != "method_declaration" || crate::java::helpers::has_modifier(node, "static") || has_annotation(context, node, "Override") {
        return;
    }
    let Some(name) = node.child_by_field_name("name") else { return };
    let record = crate::engine::source::parent(node).and_then(crate::engine::source::parent).filter(|owner| owner.kind() == "record_declaration");
    if let Some(record) = record {
        let components = record.child_by_field_name("parameters").map(named_children).unwrap_or_default();
        let component = components.iter().any(|part| part.child_by_field_name("name").is_some_and(|own| context.text(own) == context.text(name)));
        if component && crate::java::helpers::has_modifier(node, "public") && formals(node).is_empty() {
            let message = format!("{} is an explicitly declared accessor method for a record component; expected @Override", context.text(name));
            context.report_fixed("MissingOverride", node, name.start_byte(), &message, &[Fix::new().insert(node.start_byte(), "@Override ")]);
            return;
        }
    }
    let Some((origin, method)) = declared_method(context, node) else { return };
    let Some((declaring, other)) = super_method(context, origin, method) else { return };
    if in_generated_class(context, node) || other.flags & flag::DEPRECATED != 0 {
        return;
    }
    let verb = if declaring.is_interface || other.is_abstract { "implements" } else { "overrides" };
    let message = format!("{} {verb} method in {}; expected @Override", context.text(name), simple_name(&declaring.name));
    context.report_fixed("MissingOverride", node, name.start_byte(), &message, &[Fix::new().insert(node.start_byte(), "@Override ")]);
}

const UTILITY: &str = "Classes which are not intended to be instantiated should be made non-instantiable with a private constructor. This includes utility classes (classes with only static members), and the main class.";

pub fn private_constructor_for_utility_class(context: &Context, node: Node) {
    use crate::java::helpers::has_modifier;
    if node.kind() != "class_declaration" || has_modifier(node, "abstract") {
        return;
    }
    if node.child_by_field_name("superclass").is_some() || node.child_by_field_name("interfaces").is_some() {
        return;
    }
    let mut around = Some(node);
    while let Some(at) = around {
        if super::DECLARATIONS[..5].contains(&at.kind()) && has_modifier(at, "private") {
            return;
        }
        around = crate::engine::source::parent(at);
    }
    if ["RunWith", "Implements", "AutoValue"].iter().any(|name| super::hierarchy::has_annotation(context, node, name)) {
        return;
    }
    let Some(body) = node.child_by_field_name("body") else { return };
    let list = members(body);
    let compiled = context.resolver.scope.names.get(&node.id()).and_then(|name| super::compiled::class(context, name));
    let instance = |member: &Node| match member.kind() {
        "class_declaration" | "method_declaration" | "field_declaration" => {
            !has_modifier(*member, "static") && !super::compiled::static_member(context, compiled, *member)
        }
        "constructor_declaration" | "compact_constructor_declaration" | "block" => true,
        _ => false,
    };
    let written = super::compiled::written_members(context, node);
    if (list.is_empty() && written.is_empty()) || list.iter().any(instance) || written.iter().any(|is_static| !is_static) {
        return;
    }
    if let Some(keyword) = children(node).into_iter().find(|part| part.kind() == "class") {
        let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
        let constructor = Fix::new().insert(node.end_byte() - 1, format!("\n\nprivate {name}() {{}}\n"));
        let fix = add_modifiers(constructor, node, &["final"]);
        context.report_fixed("PrivateConstructorForUtilityClass", node, keyword.start_byte(), UTILITY, &[fix]);
    }
}

/// A type as javac prints its tree: no spaces but one after each comma of a type argument list.
pub(super) fn printed_type(context: &Context, node: Node) -> String {
    match node.kind() {
        "generic_type" => {
            let mut text = String::new();
            for part in named_children(node) {
                if part.kind() == "type_arguments" {
                    let inner: Vec<String> = named_children(part).into_iter().map(|argument| printed_type(context, argument)).collect();
                    text.push_str(&format!("<{}>", inner.join(", ")));
                } else {
                    text.push_str(&printed_type(context, part));
                }
            }
            text
        }
        "array_type" => {
            let element = node.child_by_field_name("element").map(|element| printed_type(context, element)).unwrap_or_default();
            let dimensions = node.child_by_field_name("dimensions").map(|part| context.text(part).matches('[').count()).unwrap_or(1);
            format!("{element}{}", "[]".repeat(dimensions))
        }
        "wildcard" => {
            let bound = named_children(node).into_iter().find(|part| !part.kind().contains("annotation") && part.kind() != "super");
            match bound {
                Some(bound) if children(node).iter().any(|part| part.kind() == "super") => format!("? super {}", printed_type(context, bound)),
                Some(bound) => format!("? extends {}", printed_type(context, bound)),
                None => "?".to_string(),
            }
        }
        "scoped_type_identifier" => {
            let parts: Vec<String> =
                named_children(node).into_iter().filter(|part| !part.kind().contains("annotation")).map(|part| printed_type(context, part)).collect();
            parts.join(".")
        }
        _ => context.text(node).split_whitespace().collect(),
    }
}

struct Parameter {
    name: String,
    printed: String,
    varargs: bool,
}

fn parameters_of(context: &Context, method: Node) -> Vec<Parameter> {
    let holder = if method.kind() == "compact_constructor_declaration" {
        crate::engine::source::parent(method).and_then(crate::engine::source::parent)
    } else {
        Some(method)
    };
    holder
        .and_then(|holder| holder.child_by_field_name("parameters"))
        .map(named_children)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|part| match part.kind() {
            "formal_parameter" | "record_component" => {
                let name = part.child_by_field_name("name")?;
                let extra = part.child_by_field_name("dimensions").map(|dimensions| context.text(dimensions).matches('[').count()).unwrap_or(0);
                let printed = format!("{}{}", printed_type(context, part.child_by_field_name("type")?), "[]".repeat(extra));
                Some(Parameter { name: context.text(name).to_string(), printed, varargs: false })
            }
            "spread_parameter" => {
                let kind = named_children(part).into_iter().find(|inner| !matches!(inner.kind(), "modifiers" | "variable_declarator"))?;
                let declarator = named_children(part).into_iter().find(|inner| inner.kind() == "variable_declarator")?;
                let name = declarator.child_by_field_name("name")?;
                Some(Parameter { name: context.text(name).to_string(), printed: format!("{}...", printed_type(context, kind)), varargs: true })
            }
            _ => None,
        })
        .collect()
}

#[derive(Default)]
struct Trie {
    next: HashMap<String, Trie>,
}

/// The order in which the trie of earlier overloads takes the parameters; `None` when it is the written order.
fn trie_order(trie: &mut Trie, parameters: &[Parameter]) -> Option<Vec<usize>> {
    let mut input: Vec<usize> = (0..parameters.len()).collect();
    let mut output: Vec<usize> = Vec::new();
    let mut at = trie;
    loop {
        let found = input.iter().position(|index| !parameters[*index].varargs && at.next.contains_key(&parameters[*index].name));
        let Some(found) = found else { break };
        let index = input.remove(found);
        output.push(index);
        at = at.next.get_mut(&parameters[index].name)?;
    }
    for index in input {
        output.push(index);
        if parameters[index].varargs {
            // javac's trie hangs the rest under a node nothing else can reach.
            break;
        }
        at = at.next.entry(parameters[index].name.clone()).or_default();
    }
    let complete: Vec<usize> = output.iter().copied().chain((0..parameters.len()).filter(|index| !output.contains(index))).collect();
    complete.iter().enumerate().any(|(place, index)| place != *index).then_some(complete)
}

/// The constructor the compiler adds to a record that does not write its canonical one, placed at the record itself.
fn implicit_canonical<'t>(context: &Context, body: Node<'t>, written: &[(Node<'t>, Vec<Parameter>)]) -> Option<(Node<'t>, Vec<Parameter>)> {
    let record = crate::engine::source::parent(body).filter(|owner| owner.kind() == "record_declaration")?;
    let components = parameters_of(context, record);
    let canonical = |(method, parameters): &(Node, Vec<Parameter>)| {
        method.kind() == "compact_constructor_declaration"
            || parameters.len() == components.len() && parameters.iter().zip(&components).all(|(own, component)| own.printed == component.printed)
    };
    (!written.iter().any(canonical) && !context.suppressed("InconsistentOverloads", record)).then_some((record, components))
}

pub fn inconsistent_overloads(context: &Context, node: Node) {
    if !BODIES.contains(&node.kind()) {
        return;
    }
    let mut order: Vec<&str> = Vec::new();
    let mut groups: HashMap<&str, Vec<Node>> = HashMap::new();
    for member in members(node).into_iter().filter(|member| is_method(*member) && !context.suppressed("InconsistentOverloads", *member)) {
        let key = method_key(context, member);
        groups.entry(key).or_insert_with(|| {
            order.push(key);
            Vec::new()
        }).push(member);
    }
    for key in order {
        let mut methods: Vec<(Node, Vec<Parameter>)> = groups[key].iter().map(|method| (*method, parameters_of(context, *method))).collect();
        if key == "<init>" {
            methods.extend(implicit_canonical(context, node, &methods));
        }
        if methods.len() < 2 {
            continue;
        }
        methods.sort_by_key(|(method, parameters)| (parameters.len(), method.start_byte()));
        let mut trie = Trie::default();
        for (method, parameters) in &methods {
            let Some(expected) = trie_order(&mut trie, parameters) else { continue };
            let overriding = super::hierarchy::declared_method(context, *method)
                .is_some_and(|(origin, own)| super::hierarchy::super_method(context, origin, own).is_some());
            if overriding {
                continue;
            }
            let listed: Vec<String> = expected.iter().map(|index| format!("{} {}", parameters[*index].printed, parameters[*index].name)).collect();
            let at = if method.kind() == "record_declaration" {
                children(*method).into_iter().find(|child| child.kind() == "record").map_or(method.start_byte(), |keyword| keyword.start_byte())
            } else {
                method.child_by_field_name("name").map_or(method.start_byte(), |name| name.start_byte())
            };
            let message = format!(
                "The parameters of this method are inconsistent with other overloaded versions. A consistent order would be: {key}({})",
                listed.join(", ")
            );
            context.report("InconsistentOverloads", node, at, &message);
        }
    }
}

fn builder_owner(name: &str) -> bool {
    name.rsplit(['.', '$']).next().is_some_and(|simple| simple.ends_with("Builder"))
}

fn builder_return(context: &Context, owner: &str, returns: &crate::java::types::model::Type) -> bool {
    match returns {
        crate::java::types::model::Type::Class(name, _) => {
            builder_owner(owner) && name != crate::java::types::model::OBJECT && context.resolver.index.is_subtype(owner, name)
        }
        _ => false,
    }
}

fn gives_this(context: &Context, expression: Node) -> bool {
    let inner = |field: &str| expression.child_by_field_name(field).is_some_and(|part| gives_this(context, part));
    match expression.kind() {
        "this" => true,
        "method_invocation" => context.resolver.resolve_call(expression).is_some_and(|call| {
            !call.method.is_static && builder_return(context, &call.declaring, &call.method.returns)
        }),
        "ternary_expression" => inner("consequence") && inner("alternative"),
        "parenthesized_expression" => named_children(expression).into_iter().next().is_some_and(|part| gives_this(context, part)),
        "cast_expression" => inner("value"),
        "field_access" => inner("object"),
        "assignment_expression" | "binary_expression" => inner("right"),
        _ => false,
    }
}

fn other_return(context: &Context, node: Node) -> bool {
    children(node).into_iter().any(|part| match part.kind() {
        "lambda_expression" | "method_declaration" | "constructor_declaration" => false,
        "return_statement" => {
            named_children(part).into_iter().next().is_none_or(|value| !gives_this(context, value)) || other_return(context, part)
        }
        _ => other_return(context, part),
    })
}

pub fn builder_return_this(context: &Context, node: Node) {
    if node.kind() != "method_declaration" || crate::java::helpers::has_modifier(node, "static") {
        return;
    }
    let (Some(body), Some(name)) = (node.child_by_field_name("body"), node.child_by_field_name("name")) else { return };
    let Some((owner, method)) = super::hierarchy::declared_method(context, node) else { return };
    if builder_return(context, &owner.name, &method.returns) && other_return(context, body) {
        let annotation = qualify_type(context, node, "com.google.errorprone.annotations.CheckReturnValue", &mut Fix::new());
        let fix = Fix::new().insert(node.start_byte(), format!("@{annotation}\n")).with_imports();
        context.report_fixed("BuilderReturnThis", node, name.start_byte(), "Builder instance method does not return 'this'", &[fix]);
    }
}

const KEEP_FIELD: &[&str] = &[
    "jakarta.persistence.Basic", "jakarta.persistence.Column", "jakarta.persistence.Id", "jakarta.persistence.Version",
    "jakarta.xml.bind.annotation.XmlElement", "javax.persistence.Basic", "javax.persistence.Column", "javax.persistence.Id",
    "javax.persistence.Version", "javax.xml.bind.annotation.XmlElement", "net.starlark.java.annot.StarlarkBuiltin", "org.junit.Rule",
    "org.junit.jupiter.api.extension.RegisterExtension", "org.openqa.selenium.support.FindAll", "org.openqa.selenium.support.FindBy",
    "org.openqa.selenium.support.FindBys", "org.apache.beam.sdk.transforms.DoFn.TimerId", "org.apache.beam.sdk.transforms.DoFn.StateId",
    "org.springframework.boot.test.mock.mockito.MockBean", "org.springframework.test.context.bean.override.mockito.MockitoBean",
];

const KEEP_METHOD: &[&str] = &[
    "com.google.inject.Inject", "javax.inject.Inject", "jakarta.inject.Inject", "com.google.inject.Provides", "dagger.Provides",
    "com.google.inject.multibindings.ProvidesIntoMap", "com.google.inject.multibindings.ProvidesIntoSet",
    "com.google.inject.multibindings.ProvidesIntoOptional", "android.webkit.JavascriptInterface",
    "com.fasterxml.jackson.annotation.JsonCreator", "com.fasterxml.jackson.annotation.JsonProperty",
    "com.fasterxml.jackson.annotation.JsonSetter", "com.fasterxml.jackson.annotation.JsonValue", "com.google.acai.AfterTest",
    "com.google.acai.BeforeSuite", "com.google.acai.BeforeTest", "com.google.caliper.Benchmark", "com.google.common.eventbus.Subscribe",
    "com.google.inject.throwingproviders.CheckedProvides", "com.tngtech.java.junit.dataprovider.DataProvider",
    "jakarta.annotation.PreDestroy", "jakarta.annotation.PostConstruct", "jakarta.persistence.PostLoad", "jakarta.persistence.PostPersist",
    "jakarta.persistence.PostRemove", "jakarta.persistence.PostUpdate", "jakarta.persistence.PrePersist", "jakarta.persistence.PreRemove",
    "jakarta.persistence.PreUpdate", "jakarta.validation.constraints.AssertFalse", "jakarta.validation.constraints.AssertTrue",
    "javax.annotation.PreDestroy", "javax.annotation.PostConstruct", "javax.persistence.PostLoad", "javax.persistence.PostPersist",
    "javax.persistence.PostRemove", "javax.persistence.PostUpdate", "javax.persistence.PrePersist", "javax.persistence.PreRemove",
    "javax.persistence.PreUpdate", "javax.validation.constraints.AssertFalse", "javax.validation.constraints.AssertTrue",
    "net.bytebuddy.asm.Advice.OnMethodEnter", "net.bytebuddy.asm.Advice.OnMethodExit", "org.apache.beam.sdk.transforms.DoFn.FinishBundle",
    "org.apache.beam.sdk.transforms.DoFn.ProcessElement", "org.apache.beam.sdk.transforms.DoFn.StartBundle",
    "org.aspectj.lang.annotation.Pointcut", "org.aspectj.lang.annotation.After", "org.aspectj.lang.annotation.Before",
    "org.springframework.context.annotation.Bean", "org.testng.annotations.AfterClass", "org.testng.annotations.AfterMethod",
    "org.testng.annotations.BeforeClass", "org.testng.annotations.BeforeMethod", "org.testng.annotations.DataProvider",
    "org.junit.jupiter.api.BeforeAll", "org.junit.jupiter.api.AfterAll", "org.junit.jupiter.api.AfterEach", "org.junit.jupiter.api.BeforeEach",
    "org.junit.jupiter.api.RepeatedTest", "org.junit.jupiter.api.Test", "org.junit.jupiter.params.ParameterizedTest",
];

const KEEP_ALWAYS: &[&str] = &["org.apache.beam.sdk.transforms.DoFn.ProcessElement", "org.junit.jupiter.api.Nested"];

const TYPES: &[&str] =
    &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];

/// Kept for a framework: an annotation named `Keep` or `UsedReflectively`, or one of the listed ones.
pub fn kept(context: &Context, declaration: Node, listed: &[&str]) -> bool {
    let Some(modifiers) = crate::java::helpers::modifiers(declaration) else { return false };
    children(modifiers).into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")).any(|annotation| {
        let Some(name) = annotation.child_by_field_name("name") else { return false };
        let written = context.text(name);
        let simple = written.rsplit('.').next().unwrap_or(written);
        if matches!(simple, "Keep" | "UsedReflectively") {
            return true;
        }
        let full = context.resolver.class_name(annotation, written).unwrap_or_else(|| written.to_string());
        listed.contains(&full.as_str()) || KEEP_ALWAYS.contains(&full.as_str())
    })
}

pub(super) fn hidden(node: Node) -> bool {
    let mut current = Some(node);
    while let Some(at) = current {
        let holder = crate::engine::source::parent(at);
        if TYPES.contains(&at.kind()) {
            let member = holder.is_some_and(|holder| holder.kind().ends_with("_body") || holder.kind() == "enum_body_declarations" || holder.kind() == "program");
            if !member {
                return true;
            }
        }
        if at.kind() == "class_body" && holder.is_some_and(|holder| matches!(holder.kind(), "object_creation_expression" | "enum_constant")) {
            return true;
        }
        let declares = TYPES.contains(&at.kind())
            || matches!(at.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" | "field_declaration");
        if declares && crate::java::helpers::has_modifier(at, "private") {
            return true;
        }
        current = holder;
    }
    false
}

const EFFECTIVELY_PRIVATE: &str = "This declaration has public or protected modifiers, but is effectively private.";

pub fn effectively_private(context: &Context, node: Node) {
    let kind = node.kind();
    let method = matches!(kind, "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" | "annotation_type_element_declaration");
    let field = matches!(kind, "field_declaration" | "constant_declaration");
    if !method && !field && !TYPES.contains(&kind) {
        return;
    }
    let open = crate::java::helpers::has_modifier(node, "public") || crate::java::helpers::has_modifier(node, "protected");
    if !open || !hidden(node) {
        return;
    }
    if kept(context, node, if method { KEEP_METHOD } else if field { KEEP_FIELD } else { &["org.junit.jupiter.api.Nested"] }) {
        return;
    }
    if method {
        if super::hierarchy::has_annotation(context, node, "Override") {
            return;
        }
        let inherited = super::hierarchy::declared_method(context, node)
            .is_some_and(|(origin, own)| super::hierarchy::super_method(context, origin, own).is_some());
        if inherited {
            return;
        }
    }
    let fix = remove_modifiers(Fix::new(), node, &["public", "protected"]);
    if field {
        for declarator in children(node).into_iter().filter(|part| part.kind() == "variable_declarator") {
            if let Some(name) = declarator.child_by_field_name("name") {
                context.report_fixed("EffectivelyPrivate", node, name.start_byte(), EFFECTIVELY_PRIVATE, &[fix.clone()]);
            }
        }
        return;
    }
    let at = if method {
        node.child_by_field_name("name").map(|name| name.start_byte())
    } else {
        children(node).into_iter().find(|part| matches!(part.kind(), "class" | "interface" | "enum" | "record" | "@interface")).map(|word| word.start_byte())
    };
    context.report_fixed("EffectivelyPrivate", node, at.unwrap_or(node.start_byte()), EFFECTIVELY_PRIVATE, &[fix]);
}
