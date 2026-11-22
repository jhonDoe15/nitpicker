//! The places NullAway reports besides a dereference: an argument, a returned value, a value stored in a field.
use super::*;

/// Where javac puts a diagnostic for an expression: the operator of a binary expression or an assignment, the
/// parenthesis of a call, the dot of a field access, else the first token.
pub(super) fn position(node: Node) -> usize {
    let sign = |kind: &str| children(node).into_iter().rev().find(|part| part.kind() == kind).map(|part| part.start_byte());
    let found = match node.kind() {
        "binary_expression" | "assignment_expression" => node.child_by_field_name("operator").map(|operator| operator.start_byte()),
        "method_invocation" => node.child_by_field_name("arguments").map(|list| list.start_byte()),
        "field_access" | "class_literal" => sign("."),
        "ternary_expression" => sign("?"),
        "array_access" => sign("["),
        "instanceof_expression" => sign("instanceof"),
        "method_reference" => sign("::"),
        "object_creation_expression" | "array_creation_expression" => sign("new"),
        "update_expression" => children(node).into_iter().find(|part| matches!(part.kind(), "++" | "--")).map(|part| part.start_byte()),
        _ => None,
    };
    found.unwrap_or(node.start_byte())
}

impl<'t> Flow<'_, 't> {
    /// Which parameter positions of the called method must not be given null.
    fn required(&self, call: &Call) -> Vec<bool> {
        let resolver = self.context.resolver;
        let checked = annotated(self.context, &call.declaring);
        let mut required: Vec<bool> = (0..call.method.parameters.len())
            .map(|position| {
                let plain = call.method.parameters[position].name() != "java.lang.Void";
                checked && plain && (position >= 64 || call.method.nullable_parameters & (1 << position) == 0)
            })
            .collect();
        let exact = |table: &[models::Model]| -> Vec<usize> { table.iter().filter(|row| fits(resolver, row, call, false)).map(|row| row.3).collect() };
        for position in exact(models::NON_NULL_PARAMETERS) {
            if let Some(slot) = required.get_mut(position) {
                *slot = true;
            }
        }
        for position in exact(models::EXPLICITLY_NULLABLE_PARAMETERS) {
            if let Some(slot) = required.get_mut(position) {
                *slot = false;
            }
        }
        required
    }

    fn arguments_passed(&mut self, node: Node<'t>, reported: &mut Seen) {
        let resolver = self.context.resolver;
        let resolved = resolver.call_formals(node);
        if traced(self.context, node, "NP_DBG") {
            let line = node.start_position().row + 1;
            eprintln!("DBG {line} {} -> {:?}", self.context.text(node).lines().next().unwrap_or(""), resolved.as_ref().map(|(call, _)| (&call.declaring, &call.method.name, &call.method.parameters, call.method.nullable_parameters, call.method.varargs)));
            if let (None, Some(object)) = (&resolved, node.child_by_field_name("object")) {
                let name = node.child_by_field_name("name").map(|name| self.context.text(name)).unwrap_or_default();
                let owner = resolver.type_of(object);
                let known = owner.as_ref().map(|owner| resolver.index.methods(&owner.name(), name).iter().map(|(class, method)| format!("{}{:?}", class.name, method.parameters)).collect::<Vec<_>>());
                eprintln!("   UNRESOLVED receiver {owner:?} methods {known:?}");
            }
            for actual in Self::arguments(node) {
                eprintln!("   arg {} may {} known {:?}", self.context.text(actual).lines().next().unwrap_or(""), self.may_be_null(actual), self.known(strip(actual)));
            }
        }
        let Some((call, _)) = resolved else { return };
        let formals = call.method.parameters.len();
        if formals == 0 {
            return;
        }
        let mut required = self.required(&call);
        for (slot, open) in required.iter_mut().zip(self.declared_open(node).unwrap_or_default()) {
            *slot &= !open;
        }
        let actuals = Self::arguments(node);
        for (at, actual) in actuals.iter().enumerate() {
            let slot = at.min(formals - 1);
            let spread = call.method.varargs && at >= formals - 1;
            let whole = spread && actuals.len() == formals && {
                let kind = resolver.type_of(*actual);
                strip(*actual).kind() == "null_literal" || matches!(kind, Some(Type::Array(_)))
            };
            let needed = if whole { annotated(self.context, &call.declaring) } else { required[slot] };
            if !needed || !self.may_be_null(*actual) || !reported.insert((actual.id(), PASSED)) {
                continue;
            }
            let message = format!("passing @Nullable parameter '{}' where @NonNull is required", self.context.text(*actual));
            self.context.report("NullAway", *actual, position(*actual), &message);
        }
    }

    /// Whether a value returned from this method or lambda must not be null. A lambda whose body is one
    /// expression (`whole`) is only checked when its functional interface is in checked code; a `return`
    /// inside a lambda also when a library model says the interface method does not return null.
    fn returns_required(&self, unit: Node, whole: bool) -> bool {
        match unit.kind() {
            "method_declaration" => {
                let Some(kind) = unit.child_by_field_name("type") else { return false };
                let primitive = matches!(kind.kind(), "integral_type" | "floating_point_type" | "boolean_type" | "void_type");
                !primitive && self.context.text(kind) != "Void" && !crate::java::helpers::marked_nullable(self.context.file, unit)
            }
            "lambda_expression" => {
                let resolver = self.context.resolver;
                let Some(target) = resolver.lambda_target(unit) else { return false };
                let Some((declaring, method)) = resolver.index.functional_method(&target.name()) else { return false };
                let plain = !matches!(method.returns, Type::Primitive(_)) && method.returns.name() != "java.lang.Void";
                let open = method.flags & flag::NULLABLE != 0 || !rows(models::ALWAYS_NULLABLE_RETURNS, &declaring.name, method).is_empty();
                let modelled = !rows(models::NONNULL_RETURNS, &declaring.name, method).is_empty();
                plain && (annotated(self.context, &declaring.name) || !whole) && (modelled || annotated(self.context, &declaring.name) && !open)
            }
            _ => false,
        }
    }

    fn returned(&mut self, node: Node<'t>, unit: Node<'t>, reported: &mut Seen) {
        let value = named_children(node).into_iter().find(|part| !part.kind().ends_with("comment"));
        let Some(value) = value else { return };
        if self.returns_required(unit, false) && self.may_be_null(value) && reported.insert((node.id(), RETURNED)) {
            self.context.report("NullAway", node, node.start_byte(), "returning @Nullable expression from method with @NonNull return type");
        }
    }

    /// The value of a lambda whose body is an expression.
    pub(super) fn lambda_value(&mut self, lambda: Node<'t>) {
        let Some(body) = lambda.child_by_field_name("body").filter(|body| body.kind() != "block") else { return };
        if self.returns_required(lambda, true) && self.may_be_null(body) {
            self.context.report("NullAway", lambda, lambda.start_byte(), "returning @Nullable expression from method with @NonNull return type");
        }
    }

    fn stored(&mut self, node: Node<'t>, reported: &mut Seen) {
        let resolver = self.context.resolver;
        if node.child_by_field_name("operator").is_none_or(|operator| operator.kind() != "=") {
            return;
        }
        let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
        let target = match left.kind() {
            "identifier" => match resolver.binding(left, self.text(left)) {
                Some(Binding::Field(_, class, field)) => Some((class, field)),
                _ => None,
            },
            "field_access" => self.field(left).map(|(class, field, _)| (class, field)),
            _ => None,
        };
        let Some((class, field)) = target else { return };
        if !annotated(self.context, &class.name) || field.flags & flag::NULLABLE != 0 {
            return;
        }
        if self.may_be_null(right) && reported.insert((node.id(), STORED)) {
            self.context.report("NullAway", node, position(node), "assigning @Nullable expression to @NonNull field");
        }
    }

    fn maybe(&self, node: Node) -> bool {
        matches!(self.known(strip(node)), Some(NULL | NULLABLE))
    }

    pub(super) fn boxed(&self, node: Node) -> bool {
        matches!(self.context.resolver.type_of(node), Some(Type::Class(..)))
    }

    pub(super) fn primitive(&self, node: Node) -> bool {
        matches!(self.context.resolver.type_of(node), Some(Type::Primitive(_)))
    }

    /// Whether a condition is a boxed value that may be null: testing it unboxes it.
    pub(super) fn unboxed_test(&self, test: Node) -> bool {
        self.maybe(test) && self.boxed(test)
    }

    /// Whether the place a value is used in unboxes it. Unboxing is a dereference: the value is known to be
    /// non-null afterwards, and it happens as soon as the operand has been evaluated.
    pub(super) fn unboxes(&self, node: Node<'t>) -> bool {
        if !self.maybe(node) {
            return false;
        }
        let Some(above) = parent(node) else { return false };
        let field = |name: &str| above.child_by_field_name(name);
        let operator = field("operator").map(|operator| operator.kind());
        let primitive_name = |kind: Option<Node>| kind.is_some_and(|kind| matches!(kind.kind(), "integral_type" | "floating_point_type" | "boolean_type"));
        let used = match above.kind() {
            "binary_expression" if matches!(operator, Some("&&" | "||")) => false,
            "binary_expression" if matches!(operator, Some("==" | "!=")) => {
                let other = if field("left") == Some(node) { field("right") } else { field("left") };
                other.is_some_and(|other| self.primitive(other))
            }
            "binary_expression" => self.primitive(above),
            "unary_expression" | "update_expression" => true,
            "assignment_expression" if operator == Some("=") => field("right") == Some(node) && field("left").is_some_and(|left| self.primitive(left)),
            "assignment_expression" => field("left").and_then(|left| self.context.resolver.type_of(left)).is_none_or(|kind| kind.name() != "java.lang.String"),
            "variable_declarator" => field("value") == Some(node) && primitive_name(parent(above).and_then(|declaration| declaration.child_by_field_name("type"))),
            "cast_expression" => field("value") == Some(node) && primitive_name(field("type")),
            "array_access" => field("index") == Some(node),
            "return_statement" => {
                let method = crate::engine::source::ancestor(above, &["lambda_expression", "method_declaration", "class_body"]);
                primitive_name(method.filter(|method| method.kind() == "method_declaration").and_then(|method| method.child_by_field_name("type")))
            }
            "argument_list" => {
                let Some(call) = parent(above) else { return false };
                let at = Self::arguments(call).iter().position(|actual| *actual == node);
                let formals = self.context.resolver.call_formals(call).map(|(call, _)| call.method.parameters);
                let formal = at.and_then(|at| formals.as_ref().and_then(|formals| formals.get(at.min(formals.len().saturating_sub(1)))));
                matches!(formal, Some(Type::Primitive(_)))
            }
            _ => false,
        };
        used && self.boxed(node)
    }

    /// Reports a condition that is unboxed where it is tested.
    pub(super) fn unboxing_test(&mut self, test: Node<'t>, reported: &mut Seen) {
        let mut whole = test;
        while let Some(above) = parent(whole).filter(|above| above.kind() == "parenthesized_expression") {
            whole = above;
        }
        if self.may_be_null(test) && reported.insert((whole.id(), UNBOXED)) {
            let message = format!("unboxing of a @Nullable expression '{}'", self.context.text(whole));
            self.context.report("NullAway", whole, position(whole), &message);
        }
    }

    pub(super) fn unboxing(&mut self, operand: Node<'t>, reported: &mut Seen) {
        if self.may_be_null(operand) && reported.insert((operand.id(), UNBOXED)) {
            let message = format!("unboxing of a @Nullable expression '{}'", self.context.text(operand));
            self.context.report("NullAway", operand, position(operand), &message);
        }
    }

    /// The selector of a `switch` without a `case null`.
    fn selected(&mut self, selector: Node<'t>, reported: &mut Seen) {
        let Some(switch) = parent(selector).filter(|above| matches!(above.kind(), "switch_expression" | "switch_statement")) else { return };
        if switch.child_by_field_name("condition") != Some(selector) {
            return;
        }
        let Some(inner) = named_children(selector).into_iter().find(|part| !part.kind().ends_with("comment")) else { return };
        let labels = switch.child_by_field_name("body").map(named_children).unwrap_or_default();
        let null_case = labels.into_iter().flat_map(|case| children(case)).filter(|part| part.kind() == "switch_label").any(|label| {
            named_children(label).into_iter().any(|part| part.kind() == "null_literal" || named_children(part).into_iter().any(|inner| inner.kind() == "null_literal"))
        });
        if !null_case && self.may_be_null(inner) && reported.insert((selector.id(), SELECTED)) {
            let message = format!("switch selector expression '{}' is @Nullable", self.context.text(inner));
            self.context.report("NullAway", inner, position(inner), &message);
        }
    }

    pub(super) fn sites(&mut self, node: Node<'t>, unit: Node<'t>, reported: &mut Seen) {
        match node.kind() {
            "method_invocation" | "object_creation_expression" | "explicit_constructor_invocation" | "enum_constant" => self.arguments_passed(node, reported),
            "return_statement" => self.returned(node, unit, reported),
            "assignment_expression" => self.stored(node, reported),
            "enhanced_for_statement" => {
                if let Some(value) = node.child_by_field_name("value").filter(|value| self.may_be_null(*value)) {
                    if reported.insert((node.id(), LOOPED)) {
                        let message = format!("enhanced-for expression '{}' is @Nullable", self.context.text(value));
                        self.context.report("NullAway", value, position(value), &message);
                    }
                }
            }
            "parenthesized_expression" => self.selected(node, reported),
            _ => {}
        }
    }

    /// A field's own initializer.
    pub(super) fn initialized(&mut self, declarator: Node<'t>) {
        let (Some(name), Some(value), Some(declaration)) = (declarator.child_by_field_name("name"), declarator.child_by_field_name("value"), parent(declarator)) else { return };
        if crate::java::helpers::marked_nullable(self.context.file, declaration) {
            return;
        }
        if self.may_be_null(value) {
            self.context.report("NullAway", declarator, name.start_byte(), "assigning @Nullable expression to @NonNull field");
        }
    }
}

/// A method against the one it overrides: it may not return null where that one does not, nor refuse null
/// in a parameter where that one accepts it.
pub(super) fn overriding(context: &Context, method: Node) {
    use crate::java::errorprone::hierarchy;
    if method.kind() != "method_declaration" {
        return;
    }
    let Some((origin, own)) = hierarchy::declared_method(context, method) else { return };
    if own.is_static || !annotated(context, &origin.name) {
        return;
    }
    let Some((declaring, above)) = hierarchy::super_method(context, origin, own) else { return };
    if !annotated(context, &declaring.name) {
        return;
    }
    let generic = if above.type_parameters.is_empty() { String::new() } else { format!("<{}>", above.type_parameters.join(",")) };
    let shown = format!("{}.{generic}{}({})", declaring.name, above.name, above.shown);
    let void = matches!(&above.returns, Type::Primitive(name) if *name == "void");
    let models = super::models::NONNULL_RETURNS;
    let nullable_above = (above.flags & flag::NULLABLE != 0 || !rows(super::models::ALWAYS_NULLABLE_RETURNS, &declaring.name, above).is_empty()) && rows(models, &declaring.name, above).is_empty();
    let nullable_own = (own.flags & flag::NULLABLE != 0 || !rows(super::models::ALWAYS_NULLABLE_RETURNS, &origin.name, own).is_empty()) && rows(models, &origin.name, own).is_empty();
    let accepted = accepted(context, &declaring.name, above);
    if !void && !nullable_above && nullable_own {
        if let Some(name) = method.child_by_field_name("name") {
            context.report("NullAway", method, name.start_byte(), &format!("method returns @Nullable, but superclass method {shown} returns @NonNull"));
        }
        return;
    }
    let formals = hierarchy::formals(method);
    for (at, formal) in formals.iter().enumerate().take(64) {
        let accepts = accepted & (1 << at) != 0;
        let refuses = own.nullable_parameters & (1 << at) == 0;
        let name = formal.child_by_field_name("name").or_else(|| children(*formal).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|part| part.child_by_field_name("name")));
        if let (true, true, Some(name)) = (accepts, refuses, name) {
            let message = format!("parameter {} is @NonNull, but parameter in superclass method {shown} is @Nullable", context.text(name));
            context.report("NullAway", *formal, name.start_byte(), &message);
            return;
        }
    }
}

/// The parameter positions a library model table gives for exactly this method of this class.
pub(super) fn rows(table: &'static [super::models::Model], class: &str, method: &crate::java::types::model::Method) -> Vec<usize> {
    let erased = erase(&method.shown);
    table.iter().filter(|row| row.0 == class && row.1 == method.name && row.2 == erased).map(|row| row.3).collect()
}

/// The parameters of a method that accept null: its own marks where its class is checked, then the library models.
pub(super) fn accepted(context: &Context, class: &str, method: &crate::java::types::model::Method) -> u64 {
    let mut accepted = if annotated(context, class) { method.nullable_parameters } else { 0 };
    for at in rows(super::models::EXPLICITLY_NULLABLE_PARAMETERS, class, method) {
        accepted |= 1 << at.min(63);
    }
    for at in rows(super::models::NON_NULL_PARAMETERS, class, method) {
        accepted &= !(1 << at.min(63));
    }
    accepted
}

/// A printed parameter list without type arguments or type annotations, as the library model tables write signatures.
fn erase(shown: &str) -> String {
    let mut depth = 0;
    let mut out = String::new();
    let mut chars = shown.chars();
    while let Some(character) = chars.next() {
        match character {
            '<' => depth += 1,
            '>' => depth -= 1,
            '@' if depth == 0 => {
                if out.ends_with(' ') {
                    out.pop();
                }
                for next in chars.by_ref() {
                    if next == ' ' {
                        break;
                    }
                }
            }
            _ if depth == 0 => out.push(character),
            _ => {}
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::erase;

    #[test]
    fn erase_strips_type_arguments_and_type_annotations() {
        assert_eq!(erase("java.lang.@org.jspecify.annotations.Nullable ClassLoader"), "java.lang.ClassLoader");
        assert_eq!(
            erase("@org.jspecify.annotations.Nullable T,java.lang.@org.jspecify.annotations.Nullable Object"),
            "T,java.lang.Object"
        );
        assert_eq!(
            erase("java.util.@org.jspecify.annotations.Nullable List<java.lang.@org.jspecify.annotations.Nullable String>"),
            "java.util.List"
        );
        assert_eq!(erase("java.lang.String @org.jspecify.annotations.Nullable ..."), "java.lang.String...");
    }
}

