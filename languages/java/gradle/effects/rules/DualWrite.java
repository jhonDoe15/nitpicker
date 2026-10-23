package nitpicker.effects.rules;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import nitpicker.effects.Report;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import nitpicker.effects.flow.Walker;
import nitpicker.effects.kinds.Call;
import nitpicker.effects.kinds.Kinds;
import nitpicker.effects.kinds.Summaries;
import nitpicker.effects.writes.Events;
import org.objectweb.asm.tree.MethodInsnNode;
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

  public DualWrite(Program program, Report report) {
    this.program = program;
    this.events = new Events(program);
    this.effects = new Summaries(program, events);
    this.report = report;
  }

  public void run() {
    effects.compute();
    Walker walker = new Walker(program, false);
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
    Effect write = single.stream().filter(effect -> effect.has(Events.WRITE)).findFirst().orElse(null);
    List<Effect> published = single.stream().filter(Effect::publishes).filter(effect -> !relayed(effect)).toList();
    if (write == null || published.isEmpty()) {
      return;
    }
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

  private boolean relayed(Effect effect) {
    MethodFlow flow = effect.call().flow();
    int index = effect.call().index();
    boolean looped = program.loops(flow).stream().anyMatch(loop -> loop.contains(index));
    if (!looped || !flow.analyzed() || !(flow.insns[index] instanceof MethodInsnNode)) {
      return false;
    }
    Origins origins = new Origins(flow);
    for (SourceValue operand : flow.operands(index)) {
      if (origins.dependsOn(operand, source -> read(flow, source))) {
        return true;
      }
    }
    return false;
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
