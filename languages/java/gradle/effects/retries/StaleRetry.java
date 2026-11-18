package nitpicker.effects.retries;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.IntPredicate;
import java.util.function.Predicate;
import java.util.regex.Pattern;
import nitpicker.effects.Report;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.flow.Lambdas;
import nitpicker.effects.flow.Loop;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import nitpicker.effects.kinds.Call;
import nitpicker.effects.kinds.Kinds;
import nitpicker.effects.kinds.Summaries;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.AnnotationNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.LdcInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.TryCatchBlockNode;
import org.objectweb.asm.tree.TypeInsnNode;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class StaleRetry {
  public static final String RULE = "RetryWithStaleObject";
  private static final List<String> REACTIVE = List.of("reactor/core/publisher/Mono", "reactor/core/publisher/Flux");
  private static final Pattern WRITE = Pattern.compile("(save|saveAndFlush|update|create|insert|persist|merge"
      + "|replace|upsert)(?!All)\\w*");
  private static final List<String> VALUES = List.of("java/", "kotlin/", "javax/", "reactor/");
  private static final int DEPTH = 10;
  private final Program program;
  private final Conflicts conflicts;
  private final Summaries summaries;
  private final Report report;

  public StaleRetry(Program program, Summaries summaries, Report report) {
    this.program = program;
    this.conflicts = new Conflicts(program);
    this.summaries = summaries;
    this.report = report;
  }

  public void run() {
    for (MethodFlow flow : program.all()) {
      if (flow.external || !flow.analyzed()) {
        continue;
      }
      reactor(flow);
      loops(flow);
    }
    for (MethodFlow flow : program.entries()) {
      if (flow.analyzed() && conflicts.conflicting(flow)) {
        annotated(flow);
      }
    }
  }

  private void reactor(MethodFlow flow) {
    Origins origins = new Origins(flow);
    for (int index = 0; index < flow.insns.length; index++) {
      if (!(flow.insns[index] instanceof MethodInsnNode retry) || !retry.name.startsWith("retry")
          || !program.index.isSubtypeOfAny(retry.owner, REACTIVE)
          || !conflicts.retries(flow, origins, retry, index)) {
        continue;
      }
      Set<Integer> chain = chain(flow, origins, index);
      for (int at : chain) {
        if (flow.insns[at] instanceof MethodInsnNode call) {
          stale(flow, origins, call, at, "Reactor retry", chain::contains, identity -> false);
        }
      }
      for (Lambdas.Use use : program.lambdas(flow)) {
        if (chain.contains(use.consumer())) {
          use.bodies().forEach(body -> capturing(body, use.captured()));
        }
      }
    }
  }

  private void capturing(MethodFlow body, int captured) {
    boolean instance = (body.method.access & Opcodes.ACC_STATIC) == 0;
    Set<Integer> slots = new LinkedHashSet<>();
    for (int parameter = 0; parameter < captured - (instance ? 1 : 0); parameter++) {
      slots.add(body.parameterSlot(parameter));
    }
    Origins origins = new Origins(body);
    for (int at = 0; at < body.insns.length; at++) {
      if (!(body.insns[at] instanceof MethodInsnNode call) || !write(body, at, call)) {
        continue;
      }
      Type[] arguments = Type.getArgumentTypes(call.desc);
      for (int position = 0; position < arguments.length; position++) {
        Origins.Identity identity = origins.identity(body.argument(at, position));
        if (entity(arguments[position]) && identity.terminals().isEmpty()
            && identity.parameters().stream().anyMatch(slots::contains)) {
          flag(body, identity, call, at, "Reactor retry");
        }
      }
    }
  }

  private void flag(MethodFlow flow, Origins.Identity identity, MethodInsnNode call, int at, String scope) {
    String name = name(flow, identity, at);
    Map<String, Object> extra = new LinkedHashMap<>();
    extra.put("scope", scope);
    extra.put("object", name);
    extra.put("write", Summaries.label(call.owner, call.name, call.desc));
    report.add(RULE, flow, at, Report.methodName(flow) + "|" + scope + "|" + name, extra);
  }

  private Set<Integer> chain(MethodFlow flow, Origins origins, int retry) {
    Set<Integer> found = new LinkedHashSet<>();
    List<Integer> pending = new ArrayList<>(origins.identity(flow.receiver(retry)).terminals());
    for (int step = 0; step < DEPTH && !pending.isEmpty(); step++) {
      List<Integer> next = new ArrayList<>();
      for (int at : pending) {
        if (!(flow.insns[at] instanceof MethodInsnNode call) || !found.add(at)) {
          continue;
        }
        boolean operator = call.getOpcode() != Opcodes.INVOKESTATIC
            && program.index.isSubtypeOfAny(call.owner, REACTIVE);
        if (operator && flow.receiver(at) != null) {
          next.addAll(origins.identity(flow.receiver(at)).terminals());
        }
      }
      pending = next;
    }
    return found;
  }

  private boolean write(MethodFlow flow, int at, MethodInsnNode call) {
    if (!WRITE.matcher(call.name).matches()) {
      return false;
    }
    Map<String, List<String>> kinds = summaries.at(new Call(flow, at, call.owner, call.name, call.desc));
    return kinds.containsKey(Kinds.DATABASE);
  }

  private void stale(MethodFlow flow, Origins origins, MethodInsnNode call, int at, String scope,
      IntPredicate fresh, Predicate<Origins.Identity> refreshed) {
    if (!write(flow, at, call)) {
      return;
    }
    Type[] arguments = Type.getArgumentTypes(call.desc);
    for (int position = 0; position < arguments.length; position++) {
      if (!entity(arguments[position])) {
        continue;
      }
      Origins.Identity identity = origins.identity(flow.argument(at, position));
      boolean produced = identity.terminals().stream().anyMatch(fresh::test);
      if (!produced && !refreshed.test(identity)) {
        flag(flow, identity, call, at, scope);
      }
    }
  }

  private static boolean entity(Type type) {
    return type.getSort() == Type.OBJECT && (type.getInternalName().equals("java/lang/Object")
        || VALUES.stream().noneMatch(type.getInternalName()::startsWith));
  }

  private static String name(MethodFlow flow, Origins.Identity identity, int at) {
    for (int slot : identity.slots()) {
      String name = flow.localName(slot, at);
      if (name != null) {
        return name.startsWith("$") ? name.substring(1) : name;
      }
    }
    return "the object";
  }

  private void loops(MethodFlow flow) {
    Origins origins = new Origins(flow);
    for (Loop loop : program.loops(flow)) {
      for (int[] attempt : loop.attempts()) {
        if (!catches(flow, attempt)) {
          continue;
        }
        for (int at = attempt[0]; at < attempt[1] && at < flow.insns.length; at++) {
          if (flow.insns[at] instanceof MethodInsnNode call) {
            stale(flow, origins, call, at, "retry loop", inside -> inside >= loop.start() && inside <= loop.end(),
                identity -> refreshes(flow, origins, loop, identity));
          }
        }
      }
    }
  }

  private boolean refreshes(MethodFlow flow, Origins origins, Loop loop, Origins.Identity object) {
    for (int at = loop.start(); at <= loop.end() && at < flow.insns.length; at++) {
      if (flow.insns[at] instanceof MethodInsnNode call && call.name.equals("refresh")
          && Type.getArgumentTypes(call.desc).length > 0) {
        Origins.Identity refreshed = origins.identity(flow.argument(at, 0));
        if (refreshed.slots().stream().anyMatch(object.slots()::contains)
            || refreshed.terminals().stream().anyMatch(object.terminals()::contains)) {
          return true;
        }
      }
    }
    return false;
  }

  private boolean catches(MethodFlow flow, int[] attempt) {
    if (flow.method.tryCatchBlocks == null) {
      return false;
    }
    for (TryCatchBlockNode block : flow.method.tryCatchBlocks) {
      if (block.type != null && flow.index(block.start) == attempt[0] && flow.index(block.end) == attempt[1]
          && conflicts.conflict(block.type)) {
        return true;
      }
    }
    return false;
  }

  private void annotated(MethodFlow flow) {
    Origins origins = new Origins(flow);
    Type[] parameters = Type.getArgumentTypes(flow.method.desc);
    for (int at = 0; at < flow.insns.length; at++) {
      if (!(flow.insns[at] instanceof MethodInsnNode call) || !write(flow, at, call)) {
        continue;
      }
      Type[] arguments = Type.getArgumentTypes(call.desc);
      for (int position = 0; position < arguments.length; position++) {
        Origins.Identity identity = origins.identity(flow.argument(at, position));
        for (int parameter = 0; parameter < parameters.length; parameter++) {
          if (entity(arguments[position]) && entity(parameters[parameter])
              && identity.terminals().isEmpty() && identity.parameters().contains(flow.parameterSlot(parameter))) {
            flag(flow, identity, call, at, "@Retryable");
          }
        }
      }
    }
  }
}
