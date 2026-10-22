package nitpicker.effects.flow;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.objectweb.asm.tree.MethodInsnNode;

public final class Walker {
  public record Ctx(boolean element, boolean concurrent) {
    public static final Ctx NONE = new Ctx(false, false);
  }

  public interface Visitor {
    void visit(MethodFlow flow, int index, MethodInsnNode call, Ctx ctx);

    default void reference(MethodFlow flow, int index, String owner, String name, String desc, Ctx ctx) {}
  }

  private static final Set<String> STREAM_STEPS = Set.of("map", "forEach", "forEachOrdered", "filter", "flatMap",
      "peek", "mapToObj", "mapToInt", "mapToLong", "mapToDouble", "anyMatch", "allMatch", "noneMatch", "reduce",
      "takeWhile", "dropWhile", "mapMulti", "flatMapToInt");
  private static final Map<String, Set<String>> ITERATING = Map.of(
      "java/util/stream/BaseStream", STREAM_STEPS,
      "java/lang/Iterable", Set.of("forEach"),
      "java/util/Map", Set.of("forEach", "replaceAll"),
      "java/util/Iterator", Set.of("forEachRemaining"),
      "java/util/Collection", Set.of("removeIf"),
      "java/util/List", Set.of("replaceAll"),
      "kotlin/sequences/SequencesKt", Set.of("map", "mapNotNull", "mapIndexed", "filter", "filterNot", "flatMap",
          "onEach", "takeWhile", "dropWhile", "forEach"));
  private static final Map<String, Set<String>> ASYNC = Map.of(
      "java/util/concurrent/CompletableFuture", Set.of("supplyAsync", "runAsync"),
      "java/util/concurrent/Executor", Set.of("execute"),
      "java/util/concurrent/ExecutorService", Set.of("submit", "invokeAll", "invokeAny"),
      "kotlinx/coroutines/BuildersKt", Set.of("async", "launch", "async$default", "launch$default"),
      "java/lang/Thread", Set.of("startVirtualThread"),
      "java/lang/Thread$Builder", Set.of("start"),
      "java/util/concurrent/StructuredTaskScope", Set.of("fork"));
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
      Ctx inner = inner(flow, use, at(flow, use.index(), ctx));
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
      return new Ctx(true, base.concurrent() || parallel(flow, use.consumer(), 0));
    }
    if (matches(ASYNC, call) && base.element()) {
      return new Ctx(true, true);
    }
    return base;
  }

  public boolean iterating(MethodInsnNode call) {
    return matches(ITERATING, call);
  }

  private boolean matches(Map<String, Set<String>> table, MethodInsnNode call) {
    for (Map.Entry<String, Set<String>> entry : table.entrySet()) {
      if (entry.getValue().contains(call.name) && program.index.isSubtype(call.owner, entry.getKey())) {
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
