package nitpicker.effects.rows;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.effects.Report;
import nitpicker.effects.flow.Lambdas;
import nitpicker.effects.flow.Loop;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Program;
import nitpicker.effects.kinds.Summaries;
import nitpicker.effects.scopes.Scopes;
import java.util.function.IntPredicate;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.VarInsnNode;

public final class SetBasedUpdates {
  public static final String RULE = "RowsChangedInMemory";
  private static final Set<String> SAVES = Set.of("saveAll", "saveAllAndFlush");
  private static final Set<String> DELETES = Set.of("deleteAll", "deleteAllInBatch");
  private final Program program;
  private final Rows rows;
  private final Lifecycle lifecycle;
  private final Body body;
  private final Set<MethodFlow> transactional;
  private final Report report;

  public SetBasedUpdates(Program program, Scopes scopes, Report report) {
    this.program = program;
    this.rows = new Rows(program);
    this.lifecycle = new Lifecycle(program);
    this.body = new Body(program);
    this.report = report;
    this.transactional = new HashSet<>();
    for (Scopes.Scope scope : scopes.transactions()) {
      if (scope.label().equals("@Transactional") && scope.start() == 0) {
        transactional.add(scope.flow());
      }
    }
  }

  public void run() {
    for (MethodFlow flow : program.entries()) {
      if (!flow.analyzed()) {
        continue;
      }
      Uses uses = null;
      for (int index = 0; index < flow.insns.length; index++) {
        if (flow.insns[index] instanceof MethodInsnNode call && rows.finder(call) && rows.collection(call)) {
          uses = uses == null ? new Uses(flow) : uses;
          check(flow, uses, index, call);
        }
      }
    }
  }

  private void check(MethodFlow flow, Uses uses, int index, MethodInsnNode call) {
    ClassNode entity = rows.entityOf(call);
    if (entity == null) {
      return;
    }
    List<Integer> users = uses.of(index);
    Body.Result result = null;
    boolean saved = false;
    boolean removed = false;
    for (int user : users) {
      MethodInsnNode at = flow.insns[user] instanceof MethodInsnNode found ? found : null;
      if (at != null && SAVES.contains(at.name) && program.kinds.isRepository(at.owner)) {
        saved = true;
      } else if (at != null && DELETES.contains(at.name) && program.kinds.isRepository(at.owner)) {
        removed = true;
      } else if (result == null && at != null && iterates(at)) {
        result = loop(flow, uses, user, at);
      } else {
        return;
      }
    }
    boolean update = result != null && !result.deletes() && (saved || transactional.contains(flow)) && !removed;
    boolean delete = (result != null && result.deletes() && !saved && !removed)
        || (result == null && removed && !saved && users.size() == 1);
    if ((update || delete) && !lifecycle.skipsBulk(entity, delete)) {
      Map<String, Object> extra = new LinkedHashMap<>();
      extra.put("form", delete ? "delete" : "update");
      extra.put("origin", Summaries.label(call.owner, call.name, call.desc));
      extra.put("entity", entity.name.substring(entity.name.lastIndexOf('/') + 1));
      report.add(RULE, flow, index, Report.methodName(flow) + "|" + extra.get("form") + "|" + extra.get("origin"),
          extra);
    }
  }

  private boolean iterates(MethodInsnNode call) {
    return (call.name.equals("iterator") || call.name.equals("forEach"))
        && program.index.isSubtype(call.owner, "java/lang/Iterable");
  }

  private Body.Result loop(MethodFlow flow, Uses uses, int user, MethodInsnNode at) {
    if (at.name.equals("forEach")) {
      for (Lambdas.Use use : program.lambdas(flow)) {
        if (use.consumer() == user && use.bodies().size() == 1) {
          MethodFlow lambda = use.bodies().get(0);
          int slot = lambda.parameterSlot(Type.getArgumentTypes(lambda.method.desc).length - 1);
          return program.lambdas(lambda).isEmpty()
              ? body.inspect(lambda, 0, lambda.insns.length - 1, element(lambda, slot)) : null;
        }
      }
      return null;
    }
    for (int next : uses.of(user)) {
      if (flow.insns[next] instanceof MethodInsnNode call && call.name.equals("next")) {
        for (Loop loop : program.loops(flow)) {
          if (loop.contains(next)) {
            return body.inspect(flow, loop.start(), loop.end(), at2 -> at2 == next);
          }
        }
      }
    }
    return null;
  }

  private static IntPredicate element(MethodFlow lambda, int slot) {
    return at -> lambda.insns[at] instanceof VarInsnNode load && load.var == slot
        && load.getOpcode() == Opcodes.ALOAD;
  }
}
