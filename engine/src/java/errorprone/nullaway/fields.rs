//! NullAway's field initialization checks: a field that must not be null has to be given a value by its
//! declaration, by every constructor, or by an initializer block or method, and may not be read before that.
use super::*;
use crate::java::errorprone::hierarchy;
use crate::java::helpers::{has_modifier, marked_nullable};
use std::collections::HashSet;

const INIT: &str = "NullAway.Init";

/// Annotations on a field that say something else gives it a value: NullAway's defaults and the list in `languages/java/gradle/errorprone/checks.json`.
const EXCLUDED: &[&str] = &[
    "jakarta.inject.Inject",
    "javax.inject.Inject",
    "com.google.errorprone.annotations.concurrent.LazyInit",
    "org.apache.maven.plugins.annotations.Parameter",
    "org.mockito.Captor",
    "org.mockito.InjectMocks",
    "org.mockito.Mock",
    "org.mockito.Spy",
    "org.springframework.beans.factory.annotation.Autowired",
    "org.springframework.boot.test.mock.mockito.MockBean",
    "org.springframework.boot.test.mock.mockito.SpyBean",
    "org.springframework.test.context.bean.override.mockito.MockitoBean",
    "org.springframework.test.context.bean.override.mockito.MockitoSpyBean",
    "org.wiremock.spring.InjectWireMock",
    "org.junit.jupiter.api.io.TempDir",
    "org.assertj.core.api.junit.jupiter.InjectSoftAssertions",
    "com.google.inject.Inject",
    "jakarta.persistence.PersistenceContext",
    "javax.persistence.PersistenceContext",
    "org.springframework.beans.factory.annotation.Value",
];

/// Annotations that say a framework fills the fields in after the constructor without parameters has run:
/// NullAway's default and the list in `languages/java/gradle/errorprone/checks.json`.
const EXTERNAL: &[&str] = &[
    "lombok.Builder",
    "jakarta.persistence.Embeddable",
    "jakarta.persistence.Entity",
    "jakarta.persistence.MappedSuperclass",
    "javax.persistence.Embeddable",
    "javax.persistence.Entity",
    "javax.persistence.MappedSuperclass",
];

/// Framework methods that count as initializers in every class that overrides them.
const KNOWN_STARTERS: &[(&str, &str)] = &[
    ("android.view.View", "onFinishInflate"),
    ("android.app.Service", "onCreate"),
    ("android.app.Activity", "onCreate"),
    ("android.app.Fragment", "onCreate"),
    ("android.app.Fragment", "onAttach"),
    ("android.app.Fragment", "onCreateView"),
    ("android.app.Fragment", "onViewCreated"),
    ("android.app.Application", "onCreate"),
    ("javax.annotation.processing.Processor", "init"),
    ("android.support.v4.app.ActivityCompat", "onCreate"),
    ("android.support.v4.app.Fragment", "onCreate"),
    ("android.support.v4.app.Fragment", "onAttach"),
    ("android.support.v4.app.Fragment", "onCreateView"),
    ("android.support.v4.app.Fragment", "onViewCreated"),
    ("androidx.core.app.ActivityCompat", "onCreate"),
    ("androidx.fragment.app.Fragment", "onCreate"),
    ("androidx.fragment.app.Fragment", "onAttach"),
    ("androidx.fragment.app.Fragment", "onCreateView"),
    ("androidx.fragment.app.Fragment", "onActivityCreated"),
    ("androidx.fragment.app.Fragment", "onViewCreated"),
    ("android.support.multidex.Application", "onCreate"),
    ("org.apache.flink.api.common.functions.RichFunction", "open"),
];

/// A field read inside an initializer, and whether the field surely had a value there.
pub(super) struct Read<'t> {
    node: Node<'t>,
    unit: Node<'t>,
    class: String,
    field: String,
    fixed: bool,
    known: bool,
}

/// What the flow over each body leaves for the class-wide checks.
#[derive(Default)]
pub(super) struct Summary<'t> {
    /// By body: the paths that hold a value wherever the body ends normally. Nothing when it never does.
    exits: HashMap<usize, Option<Vec<String>>>,
    reads: Vec<Read<'t>>,
}

fn rooted(name: &str, root: &str) -> bool {
    name.strip_prefix(root).is_some_and(|rest| rest.is_empty() || rest.starts_with(['.', '[']))
}

fn qualified(context: &Context, declaration: Node, listed: &[&str]) -> bool {
    hierarchy::annotation_names(context, declaration).into_iter().any(|written| {
        let name = context.resolver.class_name(declaration, written).unwrap_or_else(|| written.to_string());
        listed.contains(&name.as_str())
    })
}

/// Whether a method is one that NullAway takes as run right after construction.
pub(super) fn starter(context: &Context, method: Node) -> bool {
    if method.kind() != "method_declaration" {
        return false;
    }
    let name = method.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    let Some((mut origin, mut own)) = hierarchy::declared_method(context, method) else { return false };
    for _ in 0..32 {
        if own.starts || KNOWN_STARTERS.iter().any(|known| known.1 == name && known.0 == origin.name) {
            return true;
        }
        match hierarchy::super_method(context, origin, own) {
            Some(above) => (origin, own) = above,
            None => return false,
        }
    }
    false
}

/// Whether the flow over this body is needed for the field checks, and whether its field reads are.
pub(super) fn wanted(context: &Context, unit: Node) -> (bool, bool) {
    match unit.kind() {
        "constructor_declaration" | "static_initializer" | "block" => (true, true),
        "method_declaration" => (true, starter(context, unit)),
        "variable_declarator" => (false, true),
        _ => (false, false),
    }
}

impl<'t> Flow<'_, 't> {
    fn field_read(&mut self, node: Node<'t>, unit: Node<'t>, store: &Store) -> Option<Read<'t>> {
        let resolver = self.context.resolver;
        let (class, field) = match node.kind() {
            "identifier" => match resolver.binding(node, self.text(node))? {
                Binding::Field(_, class, field) => (class, field),
                Binding::Local(_) => return None,
            },
            "field_access" if node.child_by_field_name("object").is_some_and(|object| object.kind() == "this") => {
                let (class, field, _) = self.field(node)?;
                (class, field)
            }
            _ => return None,
        };
        let above = parent(node)?;
        let operator = above.child_by_field_name("operator").map(|operator| operator.kind());
        let harmless = match above.kind() {
            "assignment_expression" => operator == Some("=") && above.child_by_field_name("left") == Some(node),
            "binary_expression" if matches!(operator, Some("==" | "!=")) => {
                let other = if above.child_by_field_name("left") == Some(node) { above.child_by_field_name("right") } else { above.child_by_field_name("left") };
                other.is_some_and(|other| other.kind() == "null_literal")
            }
            _ => false,
        };
        if harmless {
            return None;
        }
        let fixed = field.flags & flag::STATIC != 0;
        let known = if fixed {
            let root = format!("{}.{}", class.name, field.name);
            self.paths.iter().any(|(name, path)| rooted(name, &root) && read(store, *path) == NONNULL)
        } else {
            let path = self.path(format!("this.{}", field.name));
            read(store, path) == NONNULL
        };
        Some(Read { node, unit, class: class.name.clone(), field: field.name.clone(), fixed, known })
    }

    /// Goes over the finished flow once more: what holds where the body ends normally, and what held before
    /// each field read.
    pub(super) fn observe(&mut self, inputs: &[Option<Store>], unit: Node<'t>, wanted: (bool, bool), summary: &mut Summary<'t>) {
        let (exits, reads) = wanted;
        let mut exit: Option<Store> = None;
        let mut seen: HashMap<usize, usize> = HashMap::new();
        for block in 0..self.cfg.blocks.len() {
            let Some(mut store) = inputs[block].clone() else { continue };
            let leaves = exits && (block == self.cfg.end || self.cfg.returns.contains(&block));
            if !reads && !leaves {
                continue;
            }
            self.copy = self.cfg.blocks[block].copy;
            for position in 0..self.cfg.blocks[block].steps.len() {
                let node = self.cfg.blocks[block].steps[position];
                if reads {
                    if let Some(read) = self.field_read(node, unit, &store) {
                        match seen.get(&node.id()) {
                            Some(at) => summary.reads[*at].known &= read.known,
                            None => {
                                seen.insert(node.id(), summary.reads.len());
                                summary.reads.push(read);
                            }
                        }
                    }
                }
                self.advance(node, &mut store);
            }
            if leaves {
                join(&mut exit, &store);
            }
        }
        self.copy = 0;
        if exits {
            let held = exit.map(|store| {
                let names = self.paths.iter().filter(|(name, path)| name.contains('.') && !name.contains('(') && read(&store, **path) == NONNULL);
                names.map(|(name, _)| name.clone()).collect()
            });
            summary.exits.insert(unit.id(), held);
        }
    }
}

struct Slot<'t> {
    name: String,
    declarator: Node<'t>,
    declaration: Node<'t>,
    last: bool,
}

struct Entities<'c, 't> {
    context: &'c Context<'c>,
    summary: &'c Summary<'t>,
    owner: Node<'t>,
    name: String,
    members: Vec<Node<'t>>,
    instance: Vec<Slot<'t>>,
    fixed: Vec<Slot<'t>>,
    constructors: Vec<Node<'t>>,
    starters: Vec<Node<'t>>,
    fixed_starters: Vec<Node<'t>>,
    blocks: Vec<Node<'t>>,
    fixed_blocks: Vec<Node<'t>>,
}

fn primitive(declaration: Node, declarator: Node) -> bool {
    let kind = declaration.child_by_field_name("type");
    let plain = kind.is_some_and(|kind| matches!(kind.kind(), "integral_type" | "floating_point_type" | "boolean_type"));
    plain && declarator.child_by_field_name("dimensions").is_none()
}

fn first_statement(body: Node) -> Option<Node> {
    named_children(body).into_iter().find(|part| !part.kind().ends_with("comment"))
}

/// Whether a constructor starts by calling another constructor of its class.
fn delegates(constructor: Node) -> bool {
    let first = constructor.child_by_field_name("body").and_then(first_statement);
    first.is_some_and(|first| first.kind() == "explicit_constructor_invocation" && first.child_by_field_name("constructor").is_some_and(|called| called.kind() == "this"))
}

fn body_of(unit: Node) -> Option<Node> {
    match unit.kind() {
        "block" => Some(unit),
        "static_initializer" => children(unit).into_iter().find(|part| part.kind() == "block"),
        _ => unit.child_by_field_name("body"),
    }
}

impl<'c, 't> Entities<'c, 't> {
    fn of(context: &'c Context<'c>, summary: &'c Summary<'t>, body: Node<'t>, owner: Node<'t>) -> Option<Self> {
        let name = crate::java::types::scope::declared_name(context.file, context.resolver.scope, owner)?;
        let members: Vec<Node> = named_children(body)
            .into_iter()
            .flat_map(|member| if member.kind() == "enum_body_declarations" { named_children(member) } else { vec![member] })
            .collect();
        let mut found = Entities {
            context,
            summary,
            owner,
            name,
            members: members.clone(),
            instance: Vec::new(),
            fixed: Vec::new(),
            constructors: Vec::new(),
            starters: Vec::new(),
            fixed_starters: Vec::new(),
            blocks: Vec::new(),
            fixed_blocks: Vec::new(),
        };
        for member in members {
            match member.kind() {
                "constructor_declaration" | "compact_constructor_declaration" => found.constructors.push(member),
                "method_declaration" if starter(context, member) => {
                    if has_modifier(member, "static") { found.fixed_starters.push(member) } else { found.starters.push(member) }
                }
                "block" => found.blocks.push(member),
                "static_initializer" => found.fixed_blocks.push(member),
                "field_declaration" => {
                    let skipped = marked_nullable(context.file, member) || hierarchy::has_annotation(context, member, "MonotonicNonNull") || qualified(context, member, EXCLUDED);
                    if skipped {
                        continue;
                    }
                    let fixed = has_modifier(member, "static");
                    let last = has_modifier(member, "final");
                    for declarator in crate::java::helpers::declarators(member) {
                        let Some(written) = declarator.child_by_field_name("name") else { continue };
                        if declarator.child_by_field_name("value").is_some() || primitive(member, declarator) {
                            continue;
                        }
                        let slot = Slot { name: context.text(written).to_string(), declarator, declaration: member, last };
                        if fixed { found.fixed.push(slot) } else { found.instance.push(slot) }
                    }
                }
                _ => {}
            }
        }
        Some(found)
    }

    fn left(&self, unit: Node) -> &'c [String] {
        self.summary.exits.get(&unit.id()).and_then(|held| held.as_deref()).unwrap_or(&[])
    }

    /// Whether no subclass can replace the methods of this class.
    fn closed(&self) -> bool {
        match self.owner.kind() {
            "record_declaration" => true,
            "enum_declaration" => {
                let body = self.owner.child_by_field_name("body");
                !body.map(named_children).unwrap_or_default().into_iter().any(|constant| children(constant).iter().any(|part| part.kind() == "class_body"))
            }
            _ => has_modifier(self.owner, "final"),
        }
    }

    /// The method of this class that a statement calls on `this`, when no subclass can change what it does.
    fn safe(&self, call: Node<'t>) -> Option<Node<'t>> {
        if call.child_by_field_name("object").is_some_and(|object| object.kind() != "this") {
            return None;
        }
        let name = self.context.text(call.child_by_field_name("name")?);
        let named: Vec<Node> = self.members.iter().copied().filter(|member| member.kind() == "method_declaration" && member.child_by_field_name("name").is_some_and(|own| self.context.text(own) == name)).collect();
        if named.is_empty() {
            return None;
        }
        let found = self.context.resolver.resolve_call(call)?;
        if found.declaring != self.name || found.method.is_static {
            return None;
        }
        let arity = found.method.parameters.len();
        let fitting: Vec<Node> = named.into_iter().filter(|member| hierarchy::formals(*member).len() == arity || found.method.varargs).collect();
        let declaration = match fitting.len() {
            1 => fitting[0],
            _ => fitting.into_iter().find(|member| {
                hierarchy::declared_method(self.context, *member).is_some_and(|(_, own)| own.parameters.iter().map(|kind| kind.erased().name()).eq(found.method.parameters.iter().map(|kind| kind.erased().name())))
            })?,
        };
        let sealed = has_modifier(declaration, "private") || has_modifier(declaration, "final") || self.closed();
        (sealed && !has_modifier(declaration, "static") && !has_modifier(declaration, "native")).then_some(declaration)
    }

    /// The safe methods called as statements of a body, also inside a `try` that has no `catch`.
    fn safe_calls(&self, block: Node<'t>, until: Option<usize>, out: &mut Vec<Node<'t>>) {
        for statement in named_children(block) {
            if until.is_some_and(|until| statement.start_byte() > until) {
                continue;
            }
            match statement.kind() {
                "expression_statement" => {
                    let call = first_statement(statement).filter(|call| call.kind() == "method_invocation");
                    out.extend(call.and_then(|call| self.safe(call)));
                }
                "try_statement" | "try_with_resources_statement" => {
                    let parts = children(statement);
                    if parts.iter().any(|part| part.kind() == "catch_clause") {
                        continue;
                    }
                    if let Some(body) = statement.child_by_field_name("body") {
                        self.safe_calls(body, until, out);
                    }
                    for last in parts.into_iter().filter(|part| part.kind() == "finally_clause") {
                        if let Some(body) = children(last).into_iter().find(|part| part.kind() == "block") {
                            self.safe_calls(body, until, out);
                        }
                    }
                }
                _ => {}
            }
        }
    }

    /// The instance fields that surely hold a value when a constructor, block or method has run.
    fn guaranteed(&self, unit: Node<'t>) -> HashSet<&'c str> {
        let mut units = vec![unit];
        if let Some(body) = body_of(unit) {
            self.safe_calls(body, None, &mut units);
        }
        units.into_iter().flat_map(|unit| self.left(unit)).filter_map(|name| name.strip_prefix("this.")).collect()
    }

    fn external(&self, declaration: Node) -> bool {
        qualified(self.context, declaration, EXTERNAL)
    }

    fn quiet(&self, declaration: Node) -> bool {
        self.context.suppressed(INIT, declaration)
    }

    fn report_field(&self, slot: &Slot, fixed: bool) {
        if self.quiet(slot.declarator) {
            return;
        }
        let Some(written) = slot.declarator.child_by_field_name("name") else { return };
        let nested = parent(self.owner).is_some_and(|above| above.kind() != "program");
        let label = if nested {
            let package = &self.context.resolver.scope.package;
            let flat = self.name.strip_prefix(package.as_str()).map_or(self.name.as_str(), |rest| rest.trim_start_matches('.'));
            format!("{}.{}", flat.replace('.', "$"), slot.name)
        } else {
            slot.name.clone()
        };
        let kind = if fixed { "@NonNull static field" } else { "@NonNull field" };
        self.context.report("NullAway", slot.declarator, written.start_byte(), &format!("{kind} '{label}' not initialized"));
    }

    fn report_method(&self, method: Node, lacking: &[usize]) {
        if self.quiet(method) || hierarchy::has_annotation(self.context, method, "NullUnmarked") {
            return;
        }
        let Some(written) = method.child_by_field_name("name") else { return };
        let shown: Vec<String> = lacking.iter().map(|at| format!("'{}' (line {})", self.instance[*at].name, self.context.file.line(self.instance[*at].declaration))).collect();
        let listed = if shown.len() == 1 { format!("field {} is initialized", shown[0]) } else { format!("fields {} are initialized", shown.join(", ")) };
        let message = format!("initializer method does not guarantee @NonNull {listed} along all control-flow paths (remember to check for exceptions or early returns).");
        self.context.report("NullAway", method, written.start_byte(), &message);
    }

    /// Reports the instance fields left without a value. Gives back the fields some constructor leaves open.
    fn instance(&self) -> Vec<usize> {
        let tracked = !self.constructors.is_empty();
        let class_external = self.external(self.owner);
        let mut missing: Vec<(Node, Vec<usize>)> = Vec::new();
        let mut open: Vec<usize> = Vec::new();
        if tracked {
            for constructor in &self.constructors {
                let bare = hierarchy::formals(*constructor).is_empty() && constructor.kind() == "constructor_declaration";
                if delegates(*constructor) || bare && (class_external || self.external(*constructor)) {
                    continue;
                }
                let done = self.guaranteed(*constructor);
                let lacking: Vec<usize> = (0..self.instance.len()).filter(|at| !done.contains(self.instance[*at].name.as_str())).collect();
                for at in &lacking {
                    if !open.contains(at) {
                        open.push(*at);
                    }
                }
                if !lacking.is_empty() {
                    missing.push((*constructor, lacking));
                }
            }
        } else {
            open = (0..self.instance.len()).collect();
        }
        open.retain(|at| !self.instance[*at].last);
        let mut later: HashSet<&str> = HashSet::new();
        for unit in self.starters.iter().chain(&self.blocks) {
            later.extend(self.guaranteed(*unit));
        }
        let single = (self.starters.len() == 1).then(|| self.starters[0]);
        let mut blamed: Vec<(Node, Vec<usize>)> = Vec::new();
        let mut blame = |method: Node<'t>, at: usize| match blamed.iter_mut().find(|entry| entry.0 == method) {
            Some(entry) => entry.1.push(at),
            None => blamed.push((method, vec![at])),
        };
        for at in open.iter().copied().filter(|at| !later.contains(self.instance[*at].name.as_str())) {
            let slot = &self.instance[at];
            if self.quiet(slot.declaration) {
                continue;
            }
            if let Some(single) = single {
                blame(single, at);
            } else if !tracked {
                if !(class_external && self.starters.is_empty()) {
                    self.report_field(slot, false);
                }
            } else {
                for (constructor, lacking) in &missing {
                    if lacking.contains(&at) {
                        blame(*constructor, at);
                    }
                }
            }
        }
        for (method, lacking) in &blamed {
            self.report_method(*method, lacking);
        }
        open
    }

    fn fixed(&self) {
        let done: Vec<&String> = self.fixed_blocks.iter().chain(&self.fixed_starters).flat_map(|unit| self.left(*unit)).collect();
        for slot in &self.fixed {
            let root = format!("{}.{}", self.name, slot.name);
            if !done.iter().any(|name| rooted(name, &root)) {
                self.report_field(slot, true);
            }
        }
    }

    /// For each field declaration, initializer block, constructor and single initializer method: the paths
    /// that the initializers running before it have given a value.
    fn earlier(&self, open: &[usize]) -> HashMap<usize, Vec<String>> {
        let mut before = HashMap::new();
        let mut so_far: Vec<String> = Vec::new();
        for member in &self.members {
            if matches!(member.kind(), "field_declaration" | "block" | "static_initializer") {
                before.insert(member.id(), so_far.clone());
            }
            if matches!(member.kind(), "block" | "static_initializer") {
                let fixed = member.kind() == "static_initializer";
                so_far.extend(self.left(*member).iter().filter(|name| name.starts_with("this.") != fixed).cloned());
            }
        }
        for constructor in &self.constructors {
            before.insert(constructor.id(), so_far.clone());
        }
        if let [single] = self.starters[..] {
            let mut held = so_far.clone();
            held.extend((0..self.instance.len()).filter(|at| !open.contains(at)).map(|at| format!("this.{}", self.instance[at].name)));
            before.insert(single.id(), held);
        }
        if let [single] = self.fixed_starters[..] {
            before.insert(single.id(), so_far.clone());
        }
        before
    }

    fn reads(&self, reads: &[&Read<'t>], open: &[usize]) {
        let before = self.earlier(open);
        for read in reads {
            let slots = if read.fixed { &self.fixed } else { &self.instance };
            let Some(slot) = slots.iter().find(|slot| slot.name == read.field).filter(|_| read.class == self.name) else { continue };
            let unit = read.unit;
            let member = if unit.kind() == "variable_declarator" { parent(unit).unwrap_or(unit) } else { unit };
            let instance_unit = match unit.kind() {
                "constructor_declaration" | "block" => true,
                "method_declaration" => !has_modifier(unit, "static"),
                _ => false,
            };
            let relevant = match unit.kind() {
                "constructor_declaration" => !delegates(unit),
                "method_declaration" if instance_unit => self.starters[..] == [unit],
                "method_declaration" => self.fixed_starters[..] == [unit],
                _ => true,
            };
            if !relevant || read.fixed && instance_unit || read.known || self.quiet(slot.declaration) {
                continue;
            }
            let path = if read.fixed { format!("{}.{}", self.name, slot.name) } else { format!("this.{}", slot.name) };
            if before.get(&member.id()).is_some_and(|held| held.iter().any(|name| rooted(name, &path))) {
                continue;
            }
            if !read.fixed && unit.kind() != "variable_declarator" {
                let mut called = Vec::new();
                if let Some(body) = body_of(unit) {
                    self.safe_calls(body, Some(read.node.start_byte()), &mut called);
                }
                if called.into_iter().any(|method| self.left(method).contains(&path)) {
                    continue;
                }
            }
            if self.quiet(read.node) {
                continue;
            }
            let message = format!("read of @NonNull field '{}' before initialization", slot.name);
            self.context.report("NullAway", read.node, sites::position(read.node), &message);
        }
    }
}

/// The class-wide part: every class body against what the flow over its constructors, blocks and methods left.
pub(super) fn check<'t>(context: &Context, root: Node<'t>, summary: &Summary<'t>) {
    let mut reads: HashMap<usize, Vec<&Read<'t>>> = HashMap::new();
    for read in &summary.reads {
        let member = if read.unit.kind() == "variable_declarator" { parent(read.unit).unwrap_or(read.unit) } else { read.unit };
        reads.entry(member.id()).or_default().push(read);
    }
    walk(root, |body| {
        if !matches!(body.kind(), "class_body" | "enum_body") {
            return;
        }
        let Some(owner) = parent(body) else { return };
        if unmarked(context, owner) {
            return;
        }
        let Some(class) = Entities::of(context, summary, body, owner) else { return };
        let open = class.instance();
        class.fixed();
        let mine: Vec<&Read> = class.members.iter().filter_map(|member| reads.get(&member.id())).flatten().copied().collect();
        if !mine.is_empty() {
            class.reads(&mine, &open);
        }
    });
}
