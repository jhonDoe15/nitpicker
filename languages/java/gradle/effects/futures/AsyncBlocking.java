package nitpicker.effects.futures;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.effects.Report;
import nitpicker.effects.classes.Annotations;
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
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class AsyncBlocking {
  public static final String COMPLETED = "AsyncMethodDoesBlockingWork";
  public static final String TWIN = "WaitOnAsyncTwin";
  private static final String ASYNC = "Lorg/springframework/scheduling/annotation/Async;";
  private static final List<String> FUTURES = List.of("java/util/concurrent/Future",
      "java/util/concurrent/CompletionStage", "kotlinx/coroutines/Deferred");
  private static final Map<String, Set<String>> COMPLETED_CALLS = Map.of(
      "com/google/common/util/concurrent/Futures", Set.of("immediateFuture"),
      "java/util/concurrent/CompletableFuture", Set.of("completedFuture", "completedStage"),
      "kotlinx/coroutines/CompletableDeferredKt", Set.of("CompletableDeferred"));
  private static final Set<String> WAITS = Set.of("get", "join");
  private static final Map<String, Set<String>> STATIC_WAITS = Map.of(
      "com/google/common/util/concurrent/Futures", Set.of("getUnchecked", "getDone"),
      "com/google/common/util/concurrent/Uninterruptibles", Set.of("getUninterruptibly"));
  private static final List<String> ASYNC_RESULTS = List.of("reactor/core/publisher/Mono",
      "reactor/core/publisher/Flux", "org/reactivestreams/Publisher", "java/util/concurrent/Future",
      "java/util/concurrent/CompletionStage", "kotlinx/coroutines/Deferred");
  private final Program program;
  private final Summaries summaries;
  private final Report report;

  public AsyncBlocking(Program program, Summaries summaries, Report report) {
    this.program = program;
    this.summaries = summaries;
    this.report = report;
  }

  public void run() {
    for (MethodFlow flow : program.entries()) {
      if (!flow.analyzed()) {
        continue;
      }
      if (returnsFuture(flow) && !async(flow)) {
        completed(flow);
      }
      twin(flow);
    }
  }

  private boolean returnsFuture(MethodFlow flow) {
    Type type = Type.getReturnType(flow.method.desc);
    return type.getSort() == Type.OBJECT && program.index.isSubtypeOfAny(type.getInternalName(), FUTURES);
  }

  private boolean async(MethodFlow flow) {
    boolean visible = (flow.method.access & Opcodes.ACC_PUBLIC) != 0;
    if (marked(flow.method.visibleAnnotations, flow.method.invisibleAnnotations, 0)
        || (visible && marked(flow.owner.visibleAnnotations, flow.owner.invisibleAnnotations, 0))) {
      return true;
    }
    for (String type : program.index.ancestors(flow.owner.name)) {
      ClassNode node = program.index.library(type);
      for (MethodNode method : node == null ? List.<MethodNode>of() : node.methods) {
        if (method.name.equals(flow.method.name) && method.desc.equals(flow.method.desc)
            && marked(method.visibleAnnotations, method.invisibleAnnotations, 0)) {
          return true;
        }
      }
    }
    return false;
  }

  private boolean marked(List<AnnotationNode> visible, List<AnnotationNode> invisible, int depth) {
    if (Annotations.find(ASYNC, visible, invisible) != null) {
      return true;
    }
    for (List<AnnotationNode> list : Annotations.lists(visible, invisible)) {
      for (AnnotationNode annotation : list) {
        ClassNode type = depth < 3 ? program.index.library(Type.getType(annotation.desc).getInternalName()) : null;
        if (type != null && marked(type.visibleAnnotations, type.invisibleAnnotations, depth + 1)) {
          return true;
        }
      }
    }
    return false;
  }

  private void completed(MethodFlow flow) {
    Origins origins = new Origins(flow);
    for (int index = 0; index < flow.insns.length; index++) {
      if (flow.insns[index].getOpcode() != Opcodes.ARETURN) {
        continue;
      }
      for (int source : origins.identity(flow.operands(index).get(0)).terminals()) {
        if (flow.insns[source] instanceof MethodInsnNode call && completedCall(call)) {
          Call blocking = blocking(flow, origins, source);
          if (blocking != null) {
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("wrapper", Summaries.label(call.owner, call.name, call.desc));
            extra.put("path", path(blocking));
            report.add(COMPLETED, flow, source, Report.methodName(flow) + "|" + String.join(">", path(blocking)),
                extra);
          }
        }
      }
    }
  }

  private boolean completedCall(MethodInsnNode call) {
    Set<String> names = COMPLETED_CALLS.get(call.owner);
    return names != null && names.contains(call.name) && Type.getArgumentTypes(call.desc).length == 1;
  }

  private Call blocking(MethodFlow flow, Origins origins, int wrapper) {
    Call[] found = new Call[1];
    origins.dependsOn(flow.argument(wrapper, 0), at -> {
      if (found[0] == null && flow.insns[at] instanceof MethodInsnNode call && blockingKind(flow, at, call)) {
        found[0] = new Call(flow, at, call.owner, call.name, call.desc);
      }
      return false;
    });
    return found[0];
  }

  private boolean blockingKind(MethodFlow flow, int at, MethodInsnNode call) {
    Type result = Type.getReturnType(call.desc);
    boolean waits = result.getSort() == Type.OBJECT
        && program.index.isSubtypeOfAny(result.getInternalName(), ASYNC_RESULTS);
    if (waits || (call.owner.equals(flow.owner.name) && program.anonymous(call.owner))) {
      return false;
    }
    Map<String, List<String>> kinds = summaries.at(new Call(flow, at, call.owner, call.name, call.desc));
    return kinds.containsKey(Kinds.DATABASE) || kinds.containsKey(Kinds.REMOTE);
  }

  private List<String> path(Call call) {
    Map<String, List<String>> kinds = summaries.at(call);
    return kinds.containsKey(Kinds.DATABASE) ? kinds.get(Kinds.DATABASE) : kinds.get(Kinds.REMOTE);
  }

  private void twin(MethodFlow flow) {
    for (int index = 0; index < flow.insns.length; index++) {
      if (!(flow.insns[index] instanceof MethodInsnNode wait) || !waits(wait)) {
        continue;
      }
      SourceValue waited = Set.of("getUnchecked", "getDone", "getUninterruptibly").contains(wait.name)
          ? flow.argument(index, 0) : flow.receiver(index);
      MethodInsnNode async = direct(flow, waited);
      if (async != null && async.name.endsWith("Async") && synchronous(async) != null) {
        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("async", async.owner.substring(async.owner.lastIndexOf('/') + 1) + "." + async.name + "()");
        extra.put("sync", synchronous(async));
        report.add(TWIN, flow, index, Report.methodName(flow) + "|" + async.owner + "." + async.name, extra);
      }
    }
  }

  private boolean waits(MethodInsnNode call) {
    boolean instance = WAITS.contains(call.name) && program.index.isSubtypeOfAny(call.owner, FUTURES)
        && Type.getArgumentTypes(call.desc).length == 0;
    Set<String> statics = STATIC_WAITS.get(call.owner);
    return instance || (statics != null && statics.contains(call.name) && Type.getArgumentTypes(call.desc).length == 1);
  }

  private MethodInsnNode direct(MethodFlow flow, SourceValue value) {
    if (value == null || value.insns.size() != 1) {
      return null;
    }
    AbstractInsnNode insn = value.insns.iterator().next();
    if (insn.getOpcode() == Opcodes.CHECKCAST) {
      return direct(flow, flow.frame(flow.index(insn)) == null ? null : flow.operands(flow.index(insn)).get(0));
    }
    return insn instanceof MethodInsnNode call ? call : null;
  }

  private String synchronous(MethodInsnNode async) {
    String base = async.name.substring(0, async.name.length() - "Async".length());
    Type[] arguments = Type.getArgumentTypes(async.desc);
    String parameters = Type.getMethodDescriptor(Type.VOID_TYPE, arguments);
    parameters = parameters.substring(0, parameters.indexOf(')') + 1);
    return base.isEmpty() || !declares(async.owner, base, parameters, 0) ? null : base + "()";
  }

  private boolean declares(String type, String name, String parameters, int depth) {
    ClassNode node = program.index.library(type);
    if (node == null || depth > 8) {
      return false;
    }
    for (MethodNode method : node.methods) {
      if (method.name.equals(name) && method.desc.startsWith(parameters)) {
        return true;
      }
    }
    if (node.superName != null && declares(node.superName, name, parameters, depth + 1)) {
      return true;
    }
    for (String parent : node.interfaces) {
      if (declares(parent, name, parameters, depth + 1)) {
        return true;
      }
    }
    return false;
  }
}
