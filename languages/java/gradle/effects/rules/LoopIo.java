package nitpicker.effects.rules;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.effects.Report;
import nitpicker.effects.batch.Batching;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import nitpicker.effects.flow.Walker;
import nitpicker.effects.kinds.Kinds;
import nitpicker.effects.kinds.Summaries;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.IincInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.VarInsnNode;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class LoopIo {
  public static final String RULE = "IoCallInLoop";
  private static final Set<String> BATCH = Set.of("saveAll", "saveAllAndFlush", "deleteAll", "deleteAllById",
      "deleteAllInBatch", "deleteAllByIdInBatch", "findAllById", "batchUpdate", "batchInsert", "batchStore",
      "insertMany", "bulkWrite", "bulkOps", "multiGet", "multiSet", "batchGetItem", "batchWriteItem",
      "sendMessageBatch", "publishBatch", "executeBatch", "executeLargeBatch", "executePipelined", "mget", "mset",
      "hmget", "hmset", "findAllByIdIn");
  private static final Set<String> CHUNKS = Set.of("subList", "partition", "chunked", "windowed", "split");
  private static final Set<String> COPIES = Set.of("copyOf", "toList", "toSet", "toMutableList", "unmodifiableList",
      "asList", "copyOfRange");
  private static final List<String> COLLECTIONS =
      List.of("java/util/Collection", "java/lang/Iterable", "java/util/Map");
  private final Program program;
  private final Batching batching;
  private final Summaries summaries;
  private final Report report;

  public LoopIo(Program program, Summaries summaries, Report report) {
    this.program = program;
    this.batching = new Batching(program);
    this.summaries = summaries;
    this.report = report;
  }

  public void run() {
    Walker walker = new Walker(program, true);
    for (MethodFlow entry : program.entries()) {
      walker.walk(entry, Walker.Ctx.NONE, new Walker.Visitor() {
        @Override
        public void visit(MethodFlow flow, int index, MethodInsnNode call, Walker.Ctx ctx) {
          if (ctx.element() && !chunked(flow, index) && !stepped(flow, index)) {
            check(flow, index, call.owner, call.name, call.desc, ctx);
          } else if (ctx.later()) {
            later(flow, index, call);
          }
        }

        @Override
        public void reference(MethodFlow flow, int index, String owner, String name, String desc, Walker.Ctx ctx) {
          boolean chunk = Arrays.stream(Type.getArgumentTypes(desc)).anyMatch(LoopIo.this::collection);
          if (ctx.element() && !chunk) {
            check(flow, index, owner, name, desc, ctx);
          }
        }
      });
    }
  }

  private void check(MethodFlow flow, int index, String owner, String name, String desc, Walker.Ctx ctx) {
    if (owner.equals(flow.owner.name) && program.anonymous(owner)) {
      return;
    }
    String direct = program.kinds.direct(owner, name, desc);
    Map<String, List<String>> helper = direct == null ? summaries.of(owner, name, desc) : Map.of();
    String kind = direct != null ? direct
        : helper.containsKey(Kinds.DATABASE) ? Kinds.DATABASE
        : helper.containsKey(Kinds.REMOTE) ? Kinds.REMOTE : null;
    if (kind == null) {
      return;
    }
    List<String> path = new ArrayList<>();
    path.add(Summaries.label(owner, name, desc));
    if (direct == null) {
      path.addAll(helper.get(kind));
    }
    String last = path.get(path.size() - 1);
    boolean batch = BATCH.contains(name) || BATCH.contains(last.substring(last.indexOf('.') + 1, last.indexOf('(')));
    boolean stepped = direct != null && flow.insns[index] instanceof MethodInsnNode at
        && batching.flushedInSteps(flow, index, at);
    boolean exempt = kind.equals(Kinds.MESSAGE) || batch || stepped || (ctx.concurrent() && !kind.equals(Kinds.DATABASE));
    String form = ctx.concurrent() ? "concurrent" : "loop";
    if (direct != null) {
      report.cover(RULE, flow, index, kind, form, !exempt);
    }
    if (exempt) {
      return;
    }
    Map<String, Object> extra = new LinkedHashMap<>();
    extra.put("kind", kind);
    extra.put("form", form);
    extra.put("path", path);
    if (program.kinds.isRedis(last)) {
      extra.put("store", "redis");
    }
    report.add(RULE, flow, index, Report.methodName(flow) + "|" + String.join(">", path), extra);
  }

  private void later(MethodFlow flow, int index, MethodInsnNode call) {
    String direct = program.kinds.direct(call.owner, call.name, call.desc);
    if (direct != null) {
      report.cover(RULE, flow, index, direct, "later", false);
    }
  }

  private boolean chunked(MethodFlow flow, int index) {
    MethodInsnNode call = (MethodInsnNode) flow.insns[index];
    if (!flow.analyzed()) {
      return false;
    }
    Type[] arguments = Type.getArgumentTypes(call.desc);
    Origins origins = new Origins(flow);
    for (int position = 0; position < arguments.length; position++) {
      SourceValue argument = flow.argument(index, position);
      if (collection(arguments[position])
          && (element(flow, origins, argument) || batching.accumulated(flow, index, argument))) {
        return true;
      }
    }
    return false;
  }

  private boolean stepped(MethodFlow flow, int index) {
    if (!flow.analyzed()) {
      return false;
    }
    Origins origins = new Origins(flow);
    boolean first = false;
    boolean max = false;
    int current = index;
    for (int depth = 0; depth < 8 && flow.insns[current] instanceof MethodInsnNode call
        && call.getOpcode() != Opcodes.INVOKESTATIC; depth++) {
      int previous = -1;
      for (int terminal : origins.identity(flow.receiver(current)).terminals()) {
        if (flow.insns[terminal] instanceof MethodInsnNode) {
          previous = terminal;
        }
      }
      if (previous < 0) {
        break;
      }
      MethodInsnNode step = (MethodInsnNode) flow.insns[previous];
      if (step.name.equals("setParameter") && chunkArgument(flow, origins, previous)) {
        return true;
      }
      first |= step.name.equals("setFirstResult") && advancingArgument(flow, origins, previous);
      max |= step.name.equals("setMaxResults") && !single(flow, origins, previous);
      current = previous;
    }
    return first && max;
  }

  private boolean chunkArgument(MethodFlow flow, Origins origins, int index) {
    MethodInsnNode step = (MethodInsnNode) flow.insns[index];
    for (int position = 0; position < Type.getArgumentTypes(step.desc).length; position++) {
      if (origins.identity(flow.argument(index, position)).terminals().stream()
          .anyMatch(terminal -> chunk(flow, origins, terminal, 0))) {
        return true;
      }
    }
    return false;
  }

  private boolean advancingArgument(MethodFlow flow, Origins origins, int index) {
    for (int position = 0; position < Type.getArgumentTypes(((MethodInsnNode) flow.insns[index]).desc).length;
        position++) {
      if (origins.dependsOn(flow.argument(index, position), at -> advancing(flow, index, at))) {
        return true;
      }
    }
    return false;
  }

  private boolean single(MethodFlow flow, Origins origins, int index) {
    Set<Integer> terminals = origins.identity(flow.argument(index, 0)).terminals();
    return !terminals.isEmpty() && terminals.stream().allMatch(at -> flow.insns[at].getOpcode() == Opcodes.ICONST_1);
  }

  private boolean advancing(MethodFlow flow, int call, int at) {
    if (!(flow.insns[at] instanceof VarInsnNode load) || load.getOpcode() != Opcodes.ILOAD) {
      return false;
    }
    return program.loops(flow).stream().filter(loop -> loop.contains(call)).anyMatch(loop -> {
      for (int next = loop.start(); next <= loop.end(); next++) {
        boolean stored = flow.insns[next] instanceof IincInsnNode iinc && iinc.var == load.var
            || flow.insns[next] instanceof VarInsnNode store && store.getOpcode() == Opcodes.ISTORE
                && store.var == load.var;
        if (stored) {
          return true;
        }
      }
      return false;
    });
  }

  private boolean collection(Type type) {
    return type.getSort() == Type.ARRAY
        || (type.getSort() == Type.OBJECT && program.index.isSubtypeOfAny(type.getInternalName(), COLLECTIONS));
  }

  private boolean element(MethodFlow flow, Origins origins, SourceValue value) {
    Origins.Identity identity = origins.identity(value);
    for (int terminal : identity.terminals()) {
      if (program.element(flow, terminal) || chunk(flow, origins, terminal, 0)) {
        return true;
      }
    }
    boolean body = flow.method.name.contains("lambda$") || program.anonymous(flow.owner.name);
    int parameters = Type.getArgumentTypes(flow.method.desc).length;
    return body && parameters > 0 && identity.parameters().contains(flow.parameterSlot(parameters - 1));
  }

  private boolean chunk(MethodFlow flow, Origins origins, int terminal, int depth) {
    if (!(flow.insns[terminal] instanceof MethodInsnNode source) || depth > 3) {
      return false;
    }
    if (CHUNKS.contains(source.name)) {
      return true;
    }
    if (!COPIES.contains(source.name) || flow.operands(terminal).isEmpty()) {
      return false;
    }
    for (int inner : origins.identity(flow.operands(terminal).get(0)).terminals()) {
      if (program.element(flow, inner) || chunk(flow, origins, inner, depth + 1)) {
        return true;
      }
    }
    return false;
  }
}
