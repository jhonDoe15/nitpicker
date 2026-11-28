//! What the methods and constructors of a file do, as far as side effects go. A body has none when it stores only
//! into its own locals (a constructor also into the fields of its object), throws nothing, has no `assert`,
//! lambda, method reference, string concatenation, enum or pattern `switch`, local or anonymous class, nor a
//! for-each loop over anything but an array, and calls only JDK methods without side effects (`jdk.rs`) and
//! methods of the run, which `settle.rs` judges. The static initializer of each class is summed up the same way,
//! its stores into the static fields of its own class allowed. This is narrower than SpotBugs, which also lets a body change the
//! objects it created itself: such bodies are taken as having side effects.
use super::super::Context;
use super::jdk;
use crate::engine::source::{children, walk};
use crate::java::types::expr::{Binding, Call};
use crate::java::types::model::{Type, flag};
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

/// A method of the run: its class, name (`<init>` for a constructor) and erased parameters.
pub type Key = (String, String, String);

/// The name the static initializer of a class goes by in a key.
pub const CLINIT: &str = "<clinit>";

/// What a body needs to have no side effect.
pub struct Summary {
    pub key: Key,
    /// Nothing in the body itself has an effect.
    pub clean: bool,
    /// Methods of the run it calls on an object, any override of which may run.
    pub virtual_calls: Vec<Key>,
    /// Methods and constructors of the run it calls directly.
    pub direct_calls: Vec<Key>,
    /// It only returns a default value and code outside the run may override it.
    pub open_default: bool,
    /// A method that returns nothing and has no code, which FindSelfComparison2 takes as having an effect.
    pub empty_void: bool,
}

pub fn key_of(call: &Call) -> Key {
    (call.declaring.clone(), call.method.name.clone(), jdk::parameters(&call.method.parameters))
}

struct Scan<'c, 'a> {
    context: &'c Context<'a>,
    /// Judging for FindSelfComparison2: a `throw`, a JDK constructor and a JDK method whose result SpotBugs reports
    /// as ignored have no effect.
    lenient: bool,
    constructor: bool,
    /// The class whose fields a constructor may store into.
    owner: Option<String>,
    /// The class whose static fields the body may store into: set for its static initializer only.
    initializing: Option<String>,
    summary: Summary,
}

impl Scan<'_, '_> {
    fn local(&self, target: Node) -> bool {
        let name = self.context.text(target);
        match target.kind() {
            "identifier" => match self.context.resolver.binding(target, name) {
                Some(Binding::Local(_)) => true,
                Some(Binding::Field(_, info, field)) if field.flags & flag::STATIC != 0 => self.initializing.as_deref() == Some(info.name.as_str()),
                Some(Binding::Field(_, info, _)) => self.constructor && self.owner.as_deref() == Some(info.name.as_str()),
                None => false,
            },
            "field_access" => {
                let object = target.child_by_field_name("object");
                let own = self.initializing.as_deref().is_some_and(|own| object.is_some_and(|object| own.rsplit(['.', '$']).next() == Some(self.context.text(object))));
                own || (self.constructor && object.is_some_and(|object| object.kind() == "this"))
            }
            _ => false,
        }
    }

    fn text_typed(&self, node: Node) -> bool {
        self.context.resolver.type_of(node).is_some_and(|kind| kind.name() == "java.lang.String")
    }

    fn call(&mut self, node: Node, call: Option<Call>) {
        let Some(call) = call else {
            self.summary.clean = false;
            return;
        };
        let index = self.context.resolver.index;
        if index.from_source(&call.declaring) {
            let direct = call.method.is_static || call.method.is_private || call.method.name == "<init>"
                || node.child_by_field_name("object").is_some_and(|object| object.kind() == "super");
            let key = key_of(&call);
            if direct { self.summary.direct_calls.push(key) } else { self.summary.virtual_calls.push(key) }
            return;
        }
        self.summary.clean &= if self.lenient { jdk::quiet(self.context, &call) } else { jdk::pure(self.context, &call) };
    }

    fn visit(&mut self, node: Node) {
        let resolver = self.context.resolver;
        match node.kind() {
            "throw_statement" => self.summary.clean &= self.lenient,
            "assert_statement" | "lambda_expression" | "method_reference" | "class_body" | "try_with_resources_statement" | "synchronized_statement" => self.summary.clean = false,
            kind if TYPE_DECLARATIONS.contains(&kind) => self.summary.clean = false,
            "assignment_expression" => {
                let target = node.child_by_field_name("left");
                let concat = node.child_by_field_name("operator").is_some_and(|operator| self.context.text(operator) == "+=") && target.is_some_and(|target| self.text_typed(target));
                self.summary.clean &= !concat && target.is_some_and(|target| self.local(target));
            }
            "update_expression" => self.summary.clean &= node.named_child(0).is_some_and(|target| self.local(target)),
            "binary_expression" => {
                let plus = node.child_by_field_name("operator").is_some_and(|operator| self.context.text(operator) == "+");
                self.summary.clean &= !(plus && self.text_typed(node));
            }
            "enhanced_for_statement" => {
                let array = node.child_by_field_name("value").and_then(|value| resolver.type_of(value)).is_some_and(|kind| matches!(kind, Type::Array(_)));
                self.summary.clean &= array;
            }
            "switch_expression" => {
                let plain = node.child_by_field_name("condition").and_then(|condition| resolver.type_of(condition)).is_some_and(|kind| match kind.erased() {
                    Type::Primitive(_) => true,
                    Type::Class(name, _) => matches!(name.as_str(), "java.lang.String" | "java.lang.Integer" | "java.lang.Character" | "java.lang.Short" | "java.lang.Byte"),
                    _ => false,
                });
                let mut typed = false;
                walk(node, |part| typed |= matches!(part.kind(), "type_pattern" | "record_pattern" | "pattern"));
                self.summary.clean &= plain && !typed;
            }
            "method_invocation" => {
                let call = resolver.resolve_call(node);
                self.call(node, call);
            }
            "object_creation_expression" => {
                let call = resolver.resolve_constructor(node).map(|call| Call { method: crate::java::types::model::Method { name: "<init>".to_string(), ..call.method }, ..call });
                self.call(node, call);
            }
            "explicit_constructor_invocation" => {
                let call = resolver.resolve_delegation(node).map(|call| Call { method: crate::java::types::model::Method { name: "<init>".to_string(), ..call.method }, ..call });
                self.call(node, call);
            }
            _ => {}
        }
        for part in children(node) {
            if !self.summary.clean {
                return;
            }
            self.visit(part);
        }
    }
}

fn parameter_key(context: &Context, member: Node) -> String {
    let (erased, _, _) = context.resolver.parameters(member.child_by_field_name("parameters"));
    jdk::parameters(&erased)
}

/// The summaries of every method and constructor of the file; a class without a constructor gets its default one.
pub fn summaries(context: &Context, lenient: bool) -> Vec<Summary> {
    let mut found = Vec::new();
    for (own, class) in &context.classes {
        let Some(body) = class.child_by_field_name("body").or_else(|| children(*class).into_iter().find(|part| part.kind() == "class_body")) else { continue };
        let members = super::super::place::members(body);
        let initializers: Vec<Node> = members
            .iter()
            .copied()
            .filter(|member| (member.kind() == "field_declaration" && !crate::java::helpers::has_modifier(*member, "static")) || member.kind() == "block")
            .collect();
        let record = class.kind() == "record_declaration";
        let plain = record || class.kind() == "class_declaration";
        let mut constructors = 0;
        for member in &members {
            let (name, constructor) = match member.kind() {
                "method_declaration" => (member.child_by_field_name("name").map(|name| context.text(name).to_string()).unwrap_or_default(), false),
                "constructor_declaration" | "compact_constructor_declaration" => ("<init>".to_string(), true),
                _ => continue,
            };
            constructors += usize::from(constructor);
            let parameters = if member.kind() == "compact_constructor_declaration" { components(context, own) } else { parameter_key(context, *member) };
            let key = (own.clone(), name, parameters);
            let mut scan = Scan { context, lenient, constructor, owner: Some(own.clone()), initializing: None, summary: Summary { key, clean: plain || !constructor, virtual_calls: Vec::new(), direct_calls: Vec::new(), open_default: false, empty_void: false } };
            if let Some(code) = member.child_by_field_name("body") {
                scan.visit(code);
                let delegates = code.named_child(0).is_some_and(|first| first.kind() == "explicit_constructor_invocation");
                if constructor && !delegates {
                    super_call(&mut scan, *class);
                }
                let this = code.named_child(0).and_then(|first| first.child_by_field_name("constructor")).is_some_and(|called| called.kind() == "this");
                if constructor && !this {
                    initializers.iter().for_each(|initializer| scan.visit(*initializer));
                }
            } else {
                scan.summary.clean = false;
            }
            scan.summary.open_default = stub(context, *class, *member, &scan.summary.key);
            scan.summary.empty_void = jdk::empty_void(context, *member);
            found.push(scan.summary);
        }
        if class.kind() == "object_creation_expression" {
            let creation = *class;
            let mut scan = Scan { context, lenient, constructor: true, owner: Some(own.clone()), initializing: None, summary: Summary { key: (own.clone(), "<init>".to_string(), String::new()), clean: true, virtual_calls: Vec::new(), direct_calls: Vec::new(), open_default: false, empty_void: false } };
            anonymous_super(&mut scan, creation);
            initializers.iter().for_each(|initializer| scan.visit(*initializer));
            found.push(scan.summary);
        }
        if constructors == 0 && plain {
            let parameters = if record { components(context, own) } else { String::new() };
            let mut scan = Scan { context, lenient, constructor: true, owner: Some(own.clone()), initializing: None, summary: Summary { key: (own.clone(), "<init>".to_string(), parameters), clean: true, virtual_calls: Vec::new(), direct_calls: Vec::new(), open_default: false, empty_void: false } };
            super_call(&mut scan, *class);
            initializers.iter().for_each(|initializer| scan.visit(*initializer));
            found.push(scan.summary);
        }
        let key = (own.clone(), CLINIT.to_string(), String::new());
        let mut scan = Scan { context, lenient, constructor: false, owner: None, initializing: Some(own.clone()), summary: Summary { key, clean: true, virtual_calls: Vec::new(), direct_calls: Vec::new(), open_default: false, empty_void: false } };
        let statics = members.iter().filter(|member| {
            matches!(member.kind(), "static_initializer" | "constant_declaration") || (member.kind() == "field_declaration" && (crate::java::helpers::has_modifier(**member, "static") || class.kind() == "interface_declaration"))
        });
        statics.for_each(|member| scan.visit(*member));
        let mut asserts = false;
        walk(body, |node| asserts |= node.kind() == "assert_statement");
        scan.summary.clean &= !asserts;
        for constant in members.iter().filter(|member| member.kind() == "enum_constant") {
            enum_constant(&mut scan, own, &members, *constant);
        }
        found.push(scan.summary);
    }
    found
}

/// The parameters of a record's canonical constructor: its components.
fn components(context: &Context, own: &str) -> String {
    context.resolver.index.get(own).and_then(|info| info.record_components.clone()).map_or_else(String::new, |list| jdk::parameters(&list))
}

/// An enum constant, which the static initializer creates: its arguments and the constructor they go to.
fn enum_constant(scan: &mut Scan, own: &str, members: &[Node], constant: Node) {
    if let Some(arguments) = constant.child_by_field_name("arguments") {
        scan.visit(arguments);
    }
    if constant.child_by_field_name("body").is_some() {
        scan.summary.clean = false;
        return;
    }
    let given = constant.child_by_field_name("arguments").map_or(0, |list| crate::engine::source::named_children(list).into_iter().filter(|part| !part.kind().ends_with("comment")).count());
    let constructors: Vec<Node> = members.iter().copied().filter(|member| member.kind() == "constructor_declaration").collect();
    let fits = |member: &Node| member.child_by_field_name("parameters").is_some_and(|list| children(list).into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter")).count() == given);
    match constructors.iter().find(|member| fits(member)) {
        Some(member) => scan.summary.direct_calls.push((own.to_string(), "<init>".to_string(), parameter_key(scan.context, *member))),
        None if constructors.is_empty() => {}
        None => scan.summary.clean = false,
    }
}

/// The constructor of the class an anonymous class extends, which its own constructor calls with the arguments; a
/// creation on an outer instance (`outer.new In() {}`) also checks that instance for `null`, an effect.
fn anonymous_super(scan: &mut Scan, creation: Node) {
    let index = scan.context.resolver.index;
    if creation.child(0).is_some_and(|first| first.kind() != "new") {
        scan.summary.clean = false;
        return;
    }
    let Some(call) = scan.context.resolver.resolve_constructor(creation) else {
        let interface = creation.child_by_field_name("type").and_then(|kind| scan.context.resolver.type_node(kind)).is_some_and(|kind| index.get(&kind.erased().name()).is_some_and(|info| info.is_interface));
        scan.summary.clean &= interface;
        return;
    };
    if index.get(&call.declaring).is_some_and(|info| info.is_interface) || call.declaring == "java.lang.Object" {
        return;
    }
    let parameters = jdk::parameters(&call.method.parameters);
    if index.from_source(&call.declaring) {
        scan.summary.direct_calls.push((call.declaring, "<init>".to_string(), parameters));
    } else {
        scan.summary.clean &= jdk::known(&call.declaring, "<init>", &parameters).is_some_and(|known| known.pure);
    }
}

/// The implicit `super()` of a constructor: `Object`'s and `Record`'s have no effect, another class's must be judged.
fn super_call(scan: &mut Scan, class: Node) {
    let index = scan.context.resolver.index;
    let Some(own) = scan.context.resolver.scope.names.get(&class.id()) else { return };
    let Some(superclass) = index.get(own).and_then(|info| info.superclass.clone()) else { return };
    if matches!(superclass.as_str(), "java.lang.Object" | "java.lang.Record") {
        return;
    }
    if index.from_source(&superclass) {
        scan.summary.direct_calls.push((superclass, "<init>".to_string(), String::new()));
    } else {
        scan.summary.clean &= jdk::known(&superclass, "<init>", "").is_some_and(|known| known.pure);
    }
}

/// Whether a method only returns a default value, `this` or a parameter, and code outside the run may override it:
/// a public or protected method of a public class, neither static nor final, that overrides no method of a
/// superclass. It is a stub when it is also the only code of the run for each interface method it implements.
fn stub(context: &Context, class: Node, member: Node, key: &Key) -> bool {
    use crate::java::helpers::has_modifier;
    let index = context.resolver.index;
    let (own, name, parameters) = key;
    let overrides = index.lineage(own).iter().filter(|above| *above != own).any(|above| {
        index.get(above).is_some_and(|info| !info.is_interface && info.methods.iter().any(|method| method.name == *name && jdk::parameters(&method.parameters) == *parameters))
    }) || index.get(own).and_then(|info| info.methods.iter().find(|method| method.name == *name && jdk::parameters(&method.parameters) == *parameters)).is_some_and(|method| {
        index.lineage(own).iter().filter(|above| *above != own).filter_map(|above| index.get(above)).filter(|info| !info.is_interface).any(|info| info.methods.iter().any(|other| super::settle::bridged(method, other)))
    });
    if overrides {
        return false;
    }
    let interface = class.kind() == "interface_declaration";
    let open = (interface || has_modifier(member, "public") || has_modifier(member, "protected")) && !has_modifier(member, "static") && !has_modifier(member, "final") && !has_modifier(member, "private");
    if member.kind() != "method_declaration" || !open || !has_modifier(class, "public") {
        return false;
    }
    let Some(body) = member.child_by_field_name("body") else { return false };
    let statements: Vec<Node> = crate::engine::source::named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let [only] = statements[..] else { return false };
    only.kind() == "return_statement" && only.named_child(0).is_some_and(|value| default_value(context, member, value))
}

/// Whether javac compiles an expression to a single constant `-1`, `0` or `1` of an `int` kind, `0` of another
/// primitive, `null`, or a load of `this` or of a reference parameter.
fn default_value(context: &Context, member: Node, value: Node) -> bool {
    let value = crate::java::types::expr::unwrap(value);
    let text = context.text(value).replace('_', "");
    match value.kind() {
        "null_literal" | "true" | "false" | "this" => true,
        "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" => {
            let long = text.ends_with(['l', 'L']);
            let digits = text.trim_end_matches(['l', 'L']).to_ascii_lowercase();
            let digits = digits.strip_prefix("0x").or_else(|| digits.strip_prefix("0b")).unwrap_or(&digits).trim_start_matches('0');
            digits.is_empty() || (!long && digits == "1")
        }
        "decimal_floating_point_literal" => text.trim_end_matches(['f', 'F', 'd', 'D']).parse::<f64>().is_ok_and(|number| number == 0.0 && !text.starts_with('-')),
        "character_literal" => matches!(text.as_str(), "'\\0'" | "'\\u0000'" | "'\\u0001'"),
        "unary_expression" => {
            let operator = value.child_by_field_name("operator").map(|operator| context.text(operator));
            let operand = value.child_by_field_name("operand");
            match operator {
                Some("-") => operand.is_some_and(|operand| operand.kind() == "decimal_integer_literal" && context.text(operand) == "1"),
                Some("!") => operand.is_some_and(|operand| matches!(operand.kind(), "true" | "false")),
                _ => false,
            }
        }
        "cast_expression" => value.child_by_field_name("value").is_some_and(|inner| default_value(context, member, inner)),
        "identifier" => member.child_by_field_name("parameters").is_some_and(|list| {
            children(list).into_iter().filter(|part| part.kind() == "formal_parameter").any(|parameter| {
                let named = parameter.child_by_field_name("name").is_some_and(|name| context.text(name) == text);
                let reference = parameter.child_by_field_name("type").is_some_and(|kind| !matches!(kind.kind(), "integral_type" | "floating_point_type" | "boolean_type"));
                named && reference
            })
        }),
        _ => false,
    }
}
