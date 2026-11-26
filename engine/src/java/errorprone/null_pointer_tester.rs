//! UnnecessarySetDefault: a `NullPointerTester.setDefault` that sets what the tester already uses.
use super::Context;
use super::call_match::{instance_on_exact_class, static_on_class};
use super::fixes::Fix;
use super::nodes::position;
use super::positions::arguments;
use crate::engine::source::parent;
use crate::java::types::model::Type;
use tree_sitter::Node;

const TESTER: &str = "com.google.common.testing.NullPointerTester";

/// How a default value is written: its source, or a call of a static factory without arguments.
enum Default {
    Source(&'static str),
    Factory(&'static str, &'static str),
}

const DEFAULTS: &[(&str, Default)] = &[
    ("java.lang.reflect.Type", Default::Source("Object.class")),
    ("java.lang.reflect.GenericDeclaration", Default::Source("Object.class")),
    ("java.lang.reflect.AnnotatedElement", Default::Source("Object.class")),
    ("com.google.common.collect.SortedMapDifference", Default::Source("Maps.difference(ImmutableSortedMap.of(), ImmutableSortedMap.of())")),
    ("com.google.common.collect.MapDifference", Default::Source("Maps.difference(ImmutableMap.of(), ImmutableMap.of())")),
    ("com.google.common.collect.Range", Default::Factory("com.google.common.collect.Range", "all")),
    ("com.google.common.collect.ImmutableClassToInstanceMap", Default::Source("ImmutableClassToInstanceMap.builder().build()")),
    ("com.google.common.collect.ClassToInstanceMap", Default::Source("ImmutableClassToInstanceMap.builder().build()")),
    ("com.google.common.collect.RowSortedTable", Default::Source("Tables.unmodifiableRowSortedTable(TreeBasedTable.create())")),
    ("com.google.common.collect.ImmutableTable", Default::Factory("com.google.common.collect.ImmutableTable", "of")),
    ("com.google.common.collect.Table", Default::Factory("com.google.common.collect.ImmutableTable", "of")),
    ("com.google.common.collect.ImmutableBiMap", Default::Factory("com.google.common.collect.ImmutableBiMap", "of")),
    ("com.google.common.collect.BiMap", Default::Factory("com.google.common.collect.ImmutableBiMap", "of")),
    ("com.google.common.collect.ImmutableSortedMultiset", Default::Factory("com.google.common.collect.ImmutableSortedMultiset", "of")),
    ("com.google.common.collect.SortedMultiset", Default::Factory("com.google.common.collect.ImmutableSortedMultiset", "of")),
    ("com.google.common.collect.ImmutableMultiset", Default::Factory("com.google.common.collect.ImmutableMultiset", "of")),
    ("com.google.common.collect.Multiset", Default::Factory("com.google.common.collect.ImmutableMultiset", "of")),
    ("com.google.common.collect.SortedSetMultimap", Default::Source("Multimaps.unmodifiableSortedSetMultimap(TreeMultimap.create())")),
    ("com.google.common.collect.ImmutableSetMultimap", Default::Factory("com.google.common.collect.ImmutableSetMultimap", "of")),
    ("com.google.common.collect.SetMultimap", Default::Factory("com.google.common.collect.ImmutableSetMultimap", "of")),
    ("com.google.common.collect.ImmutableListMultimap", Default::Factory("com.google.common.collect.ImmutableListMultimap", "of")),
    ("com.google.common.collect.ListMultimap", Default::Factory("com.google.common.collect.ListMultimap", "of")),
    ("com.google.common.collect.ImmutableMultimap", Default::Factory("com.google.common.collect.ImmutableMultimap", "of")),
    ("com.google.common.collect.Multimap", Default::Factory("com.google.common.collect.ImmutableMultimap", "of")),
    ("java.util.NavigableMap", Default::Source("Maps.unmodifiableNavigableMap(Maps.newTreeMap())")),
    ("com.google.common.collect.ImmutableSortedMap", Default::Factory("com.google.common.collect.ImmutableSortedMap", "of")),
    ("java.util.SortedMap", Default::Factory("com.google.common.collect.ImmutableSortedMap", "of")),
    ("com.google.common.collect.ImmutableMap", Default::Factory("com.google.common.collect.ImmutableMap", "of")),
    ("java.util.Map", Default::Factory("com.google.common.collect.ImmutableMap", "of")),
    ("java.util.NavigableSet", Default::Source("Sets.unmodifiableNavigableSet(Sets.newTreeSet())")),
    ("com.google.common.collect.ImmutableSortedSet", Default::Factory("com.google.common.collect.ImmutableSortedSet", "of")),
    ("java.util.SortedSet", Default::Factory("com.google.common.collect.ImmutableSortedSet", "of")),
    ("com.google.common.collect.ImmutableSet", Default::Factory("com.google.common.collect.ImmutableSet", "of")),
    ("java.util.Set", Default::Factory("com.google.common.collect.ImmutableSet", "of")),
    ("com.google.common.collect.ImmutableList", Default::Factory("com.google.common.collect.ImmutableList", "of")),
    ("java.util.List", Default::Factory("com.google.common.collect.ImmutableList", "of")),
    ("com.google.common.collect.ImmutableCollection", Default::Factory("com.google.common.collect.ImmutableList", "of")),
    ("java.util.Collection", Default::Factory("com.google.common.collect.ImmutableList", "of")),
    ("java.lang.Iterable", Default::Factory("com.google.common.collect.ImmutableSet", "of")),
    ("java.util.ListIterator", Default::Source("ImmutableList.of().listIterator()")),
    ("com.google.common.collect.PeekingIterator", Default::Source("Iterators.peekingIterator(ImmutableSet.of().iterator())")),
    ("java.util.Iterator", Default::Source("ImmutableSet.of().iterator()")),
    ("com.google.common.io.CharSource", Default::Factory("com.google.common.io.CharSource", "empty")),
    ("com.google.common.io.ByteSource", Default::Factory("com.google.common.io.ByteSource", "empty")),
    ("java.io.File", Default::Source("new File(\"\")")),
    ("java.nio.DoubleBuffer", Default::Source("DoubleBuffer.allocate(0)")),
    ("java.nio.FloatBuffer", Default::Source("FloatBuffer.allocate(0)")),
    ("java.nio.LongBuffer", Default::Source("LongBuffer.allocate(0)")),
    ("java.nio.IntBuffer", Default::Source("IntBuffer.allocate(0)")),
    ("java.nio.ShortBuffer", Default::Source("ShortBuffer.allocate(0)")),
    ("java.nio.ByteBuffer", Default::Source("ByteBuffer.allocate(0)")),
    ("java.nio.CharBuffer", Default::Source("CharBuffer.allocate(0)")),
    ("java.nio.Buffer", Default::Source("ByteBuffer.allocate(0)")),
    ("java.io.StringReader", Default::Source("new StringReader(\"\")")),
    ("java.io.Reader", Default::Source("new StringReader(\"\")")),
    ("java.lang.Readable", Default::Source("new StringReader(\"\")")),
    ("java.io.ByteArrayInputStream", Default::Source("new ByteArrayInputStream(new byte[0])")),
    ("java.io.InputStream", Default::Source("new ByteArrayInputStream(new byte[0])")),
    ("com.google.common.base.Stopwatch", Default::Factory("com.google.common.base.Stopwatch", "createUnstarted")),
    ("com.google.common.base.Ticker", Default::Factory("com.google.common.base.Ticker", "systemTicker")),
    ("com.google.common.base.Equivalence", Default::Factory("com.google.common.base.Equivalence", "equals")),
    ("com.google.common.base.Predicate", Default::Factory("com.google.common.base.Predicates", "alwaysTrue")),
    ("com.google.common.base.Optional", Default::Factory("com.google.common.base.Optional", "absent")),
    ("com.google.common.base.Splitter", Default::Source("Splitter.on(',')")),
    ("com.google.common.base.Joiner", Default::Source("Joiner.on(',')")),
    ("com.google.common.base.CharMatcher", Default::Factory("com.google.common.base.CharMatcher", "none")),
    ("java.util.Locale", Default::Source("Locale.US")),
    ("java.util.Currency", Default::Source("Currency.getInstance(Locale.US)")),
    ("java.nio.charset.Charset", Default::Source("Charsets.UTF_8")),
    ("java.util.concurrent.TimeUnit", Default::Source("TimeUnit.SECONDS")),
    ("java.util.regex.Pattern", Default::Source("Pattern.compile(\"\")")),
    ("java.lang.String", Default::Source("\"\"")),
    ("java.lang.CharSequence", Default::Source("\"\"")),
    ("java.math.BigDecimal", Default::Source("BigDecimal.ZERO")),
    ("java.math.BigInteger", Default::Source("BigInteger.ZERO")),
    ("com.google.common.primitives.UnsignedLong", Default::Source("UnsignedLong.ZERO")),
    ("com.google.common.primitives.UnsignedInteger", Default::Source("UnsignedInteger.ZERO")),
    ("java.lang.Number", Default::Source("0")),
    ("java.lang.Object", Default::Source("\"\"")),
    ("Optional.class", Default::Factory("java.util.Optional", "empty")),
    ("OptionalInt.class", Default::Factory("java.util.OptionalInt", "empty")),
    ("OptionalLong.class", Default::Factory("java.util.OptionalLong", "empty")),
    ("OptionalDouble.class", Default::Factory("java.util.OptionalDouble", "empty")),
];

fn matches_default(context: &Context, value: Node, default: &Default) -> bool {
    match default {
        Default::Source(source) => context.text(value) == *source,
        Default::Factory(class, name) => {
            static_on_class(context, value, class, &[name]) && context.resolver.resolve_call(value).is_some_and(|found| found.method.parameters.is_empty())
        }
    }
}

pub fn unnecessary_set_default(context: &Context, node: Node) {
    if !instance_on_exact_class(context, node, TESTER, &["setDefault"]) {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(node) else { return };
    let (class, object) = (Type::class("java.lang.Class"), Type::class("java.lang.Object"));
    if resolved.method.parameters != [class, object] {
        return;
    }
    let list = arguments(node);
    let [first, second] = list[..] else { return };
    let Some(Type::Class(_, given)) = context.resolver.type_of(first) else { return };
    let [Type::Class(name, _)] = &given[..] else { return };
    let Some((_, default)) = DEFAULTS.iter().find(|(key, _)| key == name) else { return };
    if !matches_default(context, second, default) {
        return;
    }
    let mut fixes = Vec::new();
    match parent(node) {
        Some(statement) if statement.kind() == "expression_statement" => fixes.push(Fix::new().delete(statement.start_byte(), statement.end_byte())),
        _ => {
            if let Some(receiver) = node.child_by_field_name("object") {
                fixes.push(Fix::new().delete(receiver.end_byte(), node.end_byte()));
            }
        }
    }
    context.report_fixed("UnnecessarySetDefault", node, position(node), "Unnecessary call to NullPointerTester#setDefault", &fixes);
}
