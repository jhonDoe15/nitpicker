package nitpicker.effects.rules;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.effects.Report;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import nitpicker.effects.flow.Walker;
import nitpicker.effects.kinds.Kinds;
import nitpicker.effects.kinds.Summaries;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class LoopIo {
  public static final String RULE = "IoCallInLoop";
  private static final Set<String> BATCH = Set.of("saveAll", "saveAllAndFlush", "deleteAll", "deleteAllById",
      "deleteAllInBatch", "deleteAllByIdInBatch", "findAllById", "batchUpdate", "batchInsert", "batchStore",
      "insertMany", "bulkWrite", "bulkOps", "multiGet", "multiSet", "batchGetItem", "batchWriteItem",
      "sendMessageBatch", "publishBatch", "executeBatch", "executeLargeBatch");
  private static final List<String> COLLECTIONS =
      List.of("java/util/Collection", "java/lang/Iterable", "java/util/Map");
  private final Program program;
  private final Summaries summaries;
  private final Report report;

  public LoopIo(Program program, Summaries summaries, Report report) {
    this.program = program;
    this.summaries = summaries;
    this.report = report;
  }

  public void run() {
    Walker walker = new Walker(program, true);
    for (MethodFlow entry : program.entries()) {
      walker.walk(entry, Walker.Ctx.NONE, new Walker.Visitor() {
        @Override
        public void visit(MethodFlow flow, int index, MethodInsnNode call, Walker.Ctx ctx) {
          if (ctx.element() && !chunked(flow, index)) {
            check(flow, index, call.owner, call.name, call.desc, ctx);
          }
        }

        @Override
        public void reference(MethodFlow flow, int index, String owner, String name, String desc, Walker.Ctx ctx) {
          if (ctx.element()) {
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
    boolean skipped = kind == null || kind.equals(Kinds.MESSAGE) || BATCH.contains(name)
        || (ctx.concurrent() && !kind.equals(Kinds.DATABASE)) || (direct != null && !flow.kotlin());
    if (skipped) {
      return;
    }
    List<String> path = new ArrayList<>();
    path.add(Summaries.label(owner, name, desc));
    if (direct == null) {
      path.addAll(helper.get(kind));
    }
    Map<String, Object> extra = new LinkedHashMap<>();
    extra.put("kind", kind);
    extra.put("form", ctx.concurrent() ? "concurrent" : "loop");
    extra.put("path", path);
    report.add(RULE, flow, index, Report.methodName(flow) + "|" + String.join(">", path), extra);
  }

  private boolean chunked(MethodFlow flow, int index) {
    MethodInsnNode call = (MethodInsnNode) flow.insns[index];
    if (!flow.analyzed()) {
      return false;
    }
    Type[] arguments = Type.getArgumentTypes(call.desc);
    Origins origins = new Origins(flow);
    for (int position = 0; position < arguments.length; position++) {
      if (collection(arguments[position]) && element(flow, origins, flow.argument(index, position))) {
        return true;
      }
    }
    return false;
  }

  private boolean collection(Type type) {
    return type.getSort() == Type.ARRAY
        || (type.getSort() == Type.OBJECT && program.index.isSubtypeOfAny(type.getInternalName(), COLLECTIONS));
  }

  private boolean element(MethodFlow flow, Origins origins, SourceValue value) {
    Origins.Identity identity = origins.identity(value);
    for (int terminal : identity.terminals()) {
      if (flow.insns[terminal].getOpcode() == Opcodes.AALOAD) {
        return true;
      }
      if (flow.insns[terminal] instanceof MethodInsnNode source
          && ((source.name.equals("next") && program.index.isSubtype(source.owner, "java/util/Iterator"))
          || (source.name.equals("get") && program.index.isSubtype(source.owner, "java/util/List")))) {
        return true;
      }
    }
    boolean body = flow.method.name.contains("lambda$") || program.anonymous(flow.owner.name);
    int parameters = Type.getArgumentTypes(flow.method.desc).length;
    return body && parameters > 0 && identity.parameters().contains(flow.parameterSlot(parameters - 1));
  }
}
