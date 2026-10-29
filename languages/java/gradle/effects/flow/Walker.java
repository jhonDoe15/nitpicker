package nitpicker.effects.flow;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.objectweb.asm.Handle;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.InvokeDynamicInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;

public final class Walker {
  public record Ctx(boolean element, boolean concurrent, boolean later) {
    public static final Ctx NONE = new Ctx(false, false);

    public Ctx(boolean element, boolean concurrent) {
      this(element, concurrent, false);
    }
  }

  public interface Visitor {
    void visit(MethodFlow flow, int index, MethodInsnNode call, Ctx ctx);

    default void reference(MethodFlow flow, int index, String owner, String name, String desc, Ctx ctx) {}
  }

  private static final Set<String> STREAM_STEPS = Set.of("map", "forEach", "forEachOrdered", "filter", "flatMap",
      "peek", "mapToObj", "mapToInt", "mapToLong", "mapToDouble", "anyMatch", "allMatch", "noneMatch", "reduce",
      "takeWhile", "dropWhile", "mapMulti", "flatMapToInt", "flatMapToLong", "flatMapToDouble", "flatMapToObj",
      "iterate", "generate", "sorted", "min", "max", "collect");
  private static final Set<String> SEQUENCE_STEPS = Set.of("map", "mapNotNull", "mapIndexed", "mapIndexedNotNull",
      "filter", "filterNot", "filterIndexed", "flatMap", "flatMapIterable", "flatMapIndexedIterable",
      "flatMapIndexedSequence", "onEach", "onEachIndexed", "takeWhile", "dropWhile", "forEach", "distinctBy",
      "sortedWith", "scan", "scanIndexed", "runningFold", "runningFoldIndexed", "runningReduce",
      "runningReduceIndexed", "generateSequence", "zip", "zipWithNext", "windowed", "chunked");
  private static final Map<String, Set<String>> ITERATING = Map.ofEntries(
      Map.entry("java/util/stream/BaseStream", STREAM_STEPS),
      Map.entry("java/util/stream/Collectors", Set.of("toMap", "toConcurrentMap", "groupingBy", "groupingByConcurrent",
          "partitioningBy", "mapping", "flatMapping", "filtering", "reducing", "summingInt", "summingLong",
          "summingDouble", "averagingInt", "averagingLong", "averagingDouble", "summarizingInt", "summarizingLong",
          "summarizingDouble", "teeing", "toUnmodifiableMap")),
      Map.entry("java/util/Comparator", Set.of("comparing", "comparingInt", "comparingLong", "comparingDouble",
          "thenComparing", "thenComparingInt", "thenComparingLong", "thenComparingDouble")),
      Map.entry("java/util/Arrays", Set.of("setAll", "parallelSetAll", "sort", "parallelSort")),
      Map.entry("java/lang/Iterable", Set.of("forEach")),
      Map.entry("java/util/Map", Set.of("forEach", "replaceAll")),
      Map.entry("java/util/Iterator", Set.of("forEachRemaining")),
      Map.entry("java/util/Collection", Set.of("removeIf")),
      Map.entry("java/util/List", Set.of("replaceAll", "sort")),
      Map.entry("kotlin/sequences/SequencesKt", SEQUENCE_STEPS),
      Map.entry("kotlin/collections/CollectionsKt", Set.of("sortedWith", "sortWith")),
      Map.entry("kotlin/comparisons/ComparisonsKt", Set.of("compareBy", "compareByDescending")),
      Map.entry("kotlinx/coroutines/flow/Flow", Set.of("collect")),
      Map.entry("kotlinx/coroutines/flow/FlowKt", Set.of("onEach", "collectLatest", "collectIndexed", "mapLatest",
          "transformLatest", "flatMapConcat", "flatMapLatest", "flatMapMerge", "scan", "runningFold", "runningReduce",
          "transformWhile", "takeWhile", "dropWhile")));
  private static final Set<String> PARALLEL = Set.of("parallelSetAll", "parallelSort", "flatMapMerge");
  private static final Map<String, Set<String>> ASYNC = Map.of(
      "java/util/concurrent/CompletableFuture", Set.of("supplyAsync", "runAsync"),
      "java/util/concurrent/Executor", Set.of("execute"),
      "java/util/concurrent/ExecutorService", Set.of("submit", "invokeAll", "invokeAny"),
      "kotlinx/coroutines/BuildersKt", Set.of("async", "launch"),
      "java/util/concurrent/StructuredTaskScope", Set.of("fork"));
  private static final Map<String, Set<String>> LATER = Map.of(
      "java/lang/Thread", Set.of("<init>", "startVirtualThread"),
      "java/lang/Thread$Builder", Set.of("start", "unstarted"),
      "java/util/Timer", Set.of("schedule", "scheduleAtFixedRate"),
      "java/util/concurrent/ScheduledExecutorService", Set.of("schedule", "scheduleAtFixedRate",
          "scheduleWithFixedDelay"),
      "org/springframework/scheduling/TaskScheduler", Set.of("schedule", "scheduleAtFixedRate",
          "scheduleWithFixedDelay"));
  private static final Set<String> JOINS = Set.of("join", "get", "await", "awaitAll", "joinAll", "allOf", "anyOf",
      "invokeAll", "resultNow", "getNow");
  private static final String LISTENER = "(add|register|set)\\w*(Listener|Callback|Handler)|subscribe|addCallback";
  private final Program program;
  private final boolean tracking;

  public Walker(Program program, boolean tracking) {
    this.program = program;
    this.tracking = tracking;
  }

  public void walk(MethodFlow flow, Ctx ctx, Visitor visitor) {
    walk(flow, ctx, visitor, new HashSet<>());
  }

  private void walk(MethodFlow flow, Ctx ctx, Visitor visitor, Set<MethodFlow> path) {
    if (!path.add(flow) || path.size() > 8) {
      return;
    }
    for (int index = 0; index < flow.insns.length; index++) {
      if (flow.insns[index] instanceof MethodInsnNode call) {
        visitor.visit(flow, index, call, at(flow, index, ctx));
      }
    }
    for (Lambdas.Use use : program.lambdas(flow)) {
      Ctx outer = at(flow, use.index(), ctx);
      if (later(flow, use)) {
        if (tracking && (outer.element() || outer.later())) {
          use.bodies().forEach(body -> walk(body, new Ctx(false, false, true), visitor, path));
        }
        continue;
      }
      Ctx inner = inner(flow, use, outer);
      if (use.reference() != null) {
        visitor.reference(flow, use.index(), use.reference().getOwner(), use.reference().getName(),
            use.reference().getDesc(), inner);
      }
      for (MethodFlow body : use.bodies()) {
        walk(body, inner, visitor, path);
      }
    }
    path.remove(flow);
  }

  public Ctx at(MethodFlow flow, int index, Ctx ctx) {
    if (!tracking || ctx.element()) {
      return ctx;
    }
    for (Loop loop : program.loops(flow)) {
      if (loop.contains(index) && !loop.paging() && !loop.attempt(index)) {
        return new Ctx(true, ctx.concurrent());
      }
    }
    return ctx;
  }

  private Ctx inner(MethodFlow flow, Lambdas.Use use, Ctx base) {
    if (!tracking || use.consumer() < 0) {
      return base;
    }
    MethodInsnNode call = (MethodInsnNode) flow.insns[use.consumer()];
    if (matches(ITERATING, call)) {
      boolean concurrent = PARALLEL.contains(bare(call.name)) || parallel(flow, use.consumer(), 0);
      return new Ctx(true, base.concurrent() || concurrent);
    }
    if (matches(ASYNC, call) && base.element()) {
      return new Ctx(true, true);
    }
    return base;
  }

  public boolean iterating(MethodInsnNode call) {
    return matches(ITERATING, call);
  }

  public boolean async(MethodInsnNode call) {
    return matches(ASYNC, call);
  }

  public boolean later(MethodFlow flow, Lambdas.Use use) {
    if (use.consumer() < 0) {
      return false;
    }
    MethodInsnNode call = (MethodInsnNode) flow.insns[use.consumer()];
    if (matches(LATER, call) || call.name.matches(LISTENER)) {
      return true;
    }
    boolean future = call.name.endsWith("Async") || call.name.equals("submit");
    return future && matches(ASYNC, call) && !joined(flow);
  }

  public boolean detached(MethodFlow flow, Lambdas.Use use) {
    return use.consumer() < 0 || later(flow, use)
        || (async((MethodInsnNode) flow.insns[use.consumer()]) && !joined(flow));
  }

  private boolean joined(MethodFlow flow) {
    for (AbstractInsnNode insn : flow.insns) {
      if (insn instanceof MethodInsnNode call && JOINS.contains(call.name)
          && (program.index.isSubtype(call.owner, "java/util/concurrent/Future")
              || program.index.isSubtype(call.owner, "java/util/concurrent/CompletionStage")
              || call.owner.startsWith("kotlinx/coroutines/")
              || program.index.isSubtype(call.owner, "java/util/concurrent/ExecutorService"))) {
        return true;
      }
      if (insn instanceof InvokeDynamicInsnNode indy && indy.bsmArgs.length > 1
          && indy.bsmArgs[1] instanceof Handle handle && JOINS.contains(handle.getName())) {
        return true;
      }
    }
    return false;
  }

  private static String bare(String name) {
    return name.endsWith("$default") ? name.substring(0, name.length() - "$default".length()) : name;
  }

  private boolean matches(Map<String, Set<String>> table, MethodInsnNode call) {
    for (Map.Entry<String, Set<String>> entry : table.entrySet()) {
      if (entry.getValue().contains(bare(call.name)) && program.index.isSubtype(call.owner, entry.getKey())) {
        return true;
      }
    }
    return false;
  }

  private boolean parallel(MethodFlow flow, int callIndex, int depth) {
    if (depth > 12 || !flow.analyzed()) {
      return false;
    }
    Origins origins = new Origins(flow);
    for (int source : origins.identity(flow.receiver(callIndex)).terminals()) {
      if (flow.insns[source] instanceof MethodInsnNode call) {
        if (List.of("parallelStream", "parallel").contains(call.name)) {
          return true;
        }
        if (program.index.isSubtype(call.owner, "java/util/stream/BaseStream") && parallel(flow, source, depth + 1)) {
          return true;
        }
      }
    }
    return false;
  }
}
