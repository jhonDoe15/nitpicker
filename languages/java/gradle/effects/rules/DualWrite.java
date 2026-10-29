package nitpicker.effects.rules;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.effects.Report;
import nitpicker.effects.flow.Lambdas;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import nitpicker.effects.flow.Walker;
import nitpicker.effects.kinds.Call;
import nitpicker.effects.kinds.Kinds;
import nitpicker.effects.kinds.Summaries;
import nitpicker.effects.writes.Events;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.VarInsnNode;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class DualWrite {
  public static final String RULE = "DualWriteWithoutOutbox";
  private record Effect(Call call, Map<String, List<String>> kinds) {
    boolean has(String kind) {
      return kinds.containsKey(kind);
    }

    boolean publishes() {
      return has(Events.MESSAGE) || has(Events.DEFERRED);
    }
  }

  private final Program program;
  private final Events events;
  private final Summaries effects;
  private final Report report;
  private final Walker walker;
  private Map<MethodFlow, Call> outers;

  public DualWrite(Program program, Report report) {
    this.program = program;
    this.events = new Events(program);
    this.effects = new Summaries(program, events);
    this.report = report;
    this.walker = new Walker(program, false);
  }

  public void run() {
    effects.compute();
    for (MethodFlow entry : program.entries()) {
      List<Effect> found = new ArrayList<>();
      walker.walk(entry, Walker.Ctx.NONE, new Walker.Visitor() {
        @Override
        public void visit(MethodFlow flow, int index, MethodInsnNode call, Walker.Ctx ctx) {
          add(found, new Call(flow, index, call.owner, call.name, call.desc));
        }

        @Override
        public void reference(MethodFlow flow, int index, String owner, String name, String desc, Walker.Ctx ctx) {
          add(found, new Call(flow, index, owner, name, desc));
        }
      });
      check(entry, found);
    }
  }

  private void add(List<Effect> found, Call call) {
    if (call.owner().equals(call.flow().owner.name) && program.anonymous(call.owner())) {
      return;
    }
    Map<String, List<String>> kinds = new LinkedHashMap<>(effects.at(call));
    List<String> message = kinds.remove(Events.MESSAGE);
    if (message != null) {
      kinds.putIfAbsent(events.afterCommit(call.flow()) ? Events.DEFERRED : Events.MESSAGE, message);
    }
    if (!kinds.isEmpty()) {
      found.add(new Effect(call, kinds));
    }
  }

  private void check(MethodFlow entry, List<Effect> found) {
    List<Effect> single = found.stream().filter(effect -> !(effect.has(Events.WRITE) && effect.publishes())).toList();
    List<Effect> writes = single.stream().filter(effect -> effect.has(Events.WRITE)).toList();
    List<Effect> published = single.stream().filter(Effect::publishes).filter(effect -> !relayed(effect, writes))
        .toList();
    if (writes.isEmpty() || published.isEmpty()) {
      return;
    }
    Effect write = writes.get(0);
    Effect inline = published.stream().filter(effect -> effect.has(Events.MESSAGE)).findFirst().orElse(null);
    Effect message = inline != null ? inline : published.get(0);
    String form = inline != null ? Events.MESSAGE : Events.DEFERRED;
    Map<String, Object> extra = new LinkedHashMap<>();
    extra.put("form", inline != null ? "inline" : "afterCommit");
    extra.put("write", write.kinds().get(Events.WRITE));
    extra.put("path", message.kinds().get(form));
    String detail = Report.methodName(entry) + "|" + String.join(">", write.kinds().get(Events.WRITE)) + "|"
        + String.join(">", message.kinds().get(form));
    report.add(RULE, message.call().flow(), message.call().index(), detail, extra);
  }

  private boolean relayed(Effect published, List<Effect> writes) {
    Set<String> rows = rows(published.call());
    if (rows.isEmpty()) {
      return false;
    }
    for (Effect write : writes) {
      Call call = write.call();
      boolean after = call.flow() == published.call().flow() && call.index() > published.call().index();
      Set<String> written = rows(call);
      written.retainAll(rows);
      if (!after || written.isEmpty()) {
        return false;
      }
    }
    return true;
  }

  private Set<String> rows(Call call) {
    MethodFlow flow = call.flow();
    Set<String> found = new HashSet<>();
    if (!flow.analyzed() || !(flow.insns[call.index()] instanceof MethodInsnNode)) {
      return found;
    }
    Origins origins = new Origins(flow);
    for (SourceValue operand : flow.operands(call.index())) {
      origins.dependsOn(operand, source -> {
        if (read(flow, source)) {
          found.add(System.identityHashCode(flow) + ":" + source);
        } else if (element(flow, source)) {
          found.addAll(outerRows(flow));
        }
        return false;
      });
    }
    return found;
  }

  private boolean element(MethodFlow flow, int index) {
    int parameters = Type.getArgumentTypes(flow.method.desc).length;
    return parameters > 0 && flow.insns[index] instanceof VarInsnNode load && Origins.isLoad(load)
        && load.var == flow.parameterSlot(parameters - 1)
        && (flow.method.name.contains("lambda$") || program.anonymous(flow.owner.name));
  }

  private Set<String> outerRows(MethodFlow body) {
    if (outers == null) {
      outers = new HashMap<>();
      for (MethodFlow flow : program.all()) {
        for (Lambdas.Use use : program.lambdas(flow)) {
          use.bodies().forEach(inner -> outers.putIfAbsent(inner, new Call(flow, use.consumer(), "", "", "")));
        }
      }
    }
    Call outer = outers.get(body);
    if (outer == null || outer.index() < 0 || !walker.iterating((MethodInsnNode) outer.flow().insns[outer.index()])) {
      return Set.of();
    }
    return rows(outer);
  }

  private boolean read(MethodFlow flow, int index) {
    if (!(flow.insns[index] instanceof MethodInsnNode call)) {
      return false;
    }
    String kind = program.kinds.direct(call.owner, call.name, call.desc);
    return Kinds.DATABASE.equals(kind) && !effects.at(new Call(flow, index, call.owner, call.name, call.desc))
        .containsKey(Events.WRITE);
  }
}
