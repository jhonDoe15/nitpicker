package nitpicker.effects.scopes;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.flow.Lambdas;
import nitpicker.effects.flow.Loop;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Program;
import nitpicker.effects.flow.Walker;
import nitpicker.effects.kinds.Call;
import nitpicker.effects.kinds.Summaries;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.AnnotationNode;
import org.objectweb.asm.tree.MethodInsnNode;

public final class Scopes {
  public record Scope(String label, MethodFlow flow, int start, int end) {}

  private static final List<String> TRANSACTIONAL = List.of(
      "Lorg/springframework/transaction/annotation/Transactional;", "Ljakarta/transaction/Transactional;",
      "Ljavax/transaction/Transactional;");
  private static final Set<String> SUSPENDED = Set.of("NOT_SUPPORTED", "NEVER");
  private static final Map<String, Set<String>> CALLBACKS = Map.of(
      "org/springframework/transaction/support/TransactionOperations", Set.of("execute", "executeWithoutResult"),
      "org/springframework/transaction/support/TransactionOperationsExtensionsKt",
      Set.of("executeWithoutResult"),
      "org/springframework/transaction/reactive/TransactionalOperator", Set.of("execute", "executeAndAwait"),
      "org/jetbrains/exposed/sql/transactions/ThreadLocalTransactionManagerKt",
      Set.of("transaction", "transaction$default"),
      "org/jetbrains/exposed/v1/jdbc/transactions/TransactionApiKt", Set.of("transaction", "transaction$default"));
  private static final List<String> LOCKS = List.of("java/util/concurrent/locks/Lock", "kotlinx/coroutines/sync/Mutex");
  private static final Set<String> ACQUIRE = Set.of("lock", "lockInterruptibly", "tryLock");
  private static final List<String> RETRYABLE = List.of("Lorg/springframework/retry/annotation/Retryable;",
      "Lorg/springframework/resilience/annotation/Retryable;", "Lio/github/resilience4j/retry/annotation/Retry;");
  private static final Map<String, String> RETRY_CALLS = Map.of(
      "io/github/resilience4j/retry/Retry", "decorate\\w*|execute\\w*",
      "io/github/resilience4j/kotlin/retry/RetryKt", "decorate\\w*|execute\\w*",
      "org/springframework/retry/RetryOperations", "execute",
      "org/springframework/core/retry/RetryOperations", "execute|invoke",
      "dev/failsafe/FailsafeExecutor", "get\\w*|run\\w*|compose\\w*",
      "net/jodah/failsafe/FailsafeExecutor", "get\\w*|run\\w*");
  private static final int DEPTH = 6;
  private final Program program;
  private final Walker walker;

  public Scopes(Program program) {
    this.program = program;
    this.walker = new Walker(program, false);
  }

  public List<Scope> transactions() {
    List<Scope> found = new ArrayList<>();
    for (MethodFlow flow : program.all()) {
      if (transactional(flow)) {
        found.add(new Scope("@Transactional", flow, 0, flow.insns.length - 1));
      }
      for (Lambdas.Use use : program.lambdas(flow)) {
        if (use.consumer() >= 0 && callback((MethodInsnNode) flow.insns[use.consumer()])) {
          MethodInsnNode call = (MethodInsnNode) flow.insns[use.consumer()];
          found.add(new Scope(Summaries.label(call.owner, call.name, call.desc), flow, use.index(), use.index()));
        }
      }
      found.addAll(ranges(flow, "java/sql/Connection", "setAutoCommit", Set.of("commit", "rollback")));
    }
    return found;
  }

  public List<Scope> locks() {
    List<Scope> found = new ArrayList<>();
    for (MethodFlow flow : program.all()) {
      if ((flow.method.access & Opcodes.ACC_SYNCHRONIZED) != 0) {
        found.add(new Scope("synchronized", flow, 0, flow.insns.length - 1));
      }
      for (int index = 0; index < flow.insns.length; index++) {
        if (flow.insns[index].getOpcode() == Opcodes.MONITORENTER) {
          int exit = monitorExit(flow, index);
          found.add(new Scope("synchronized", flow, index, exit < 0 ? flow.insns.length - 1 : exit));
        }
      }
      for (String type : LOCKS) {
        for (String acquire : ACQUIRE) {
          found.addAll(ranges(flow, type, acquire, Set.of("unlock")));
        }
      }
    }
    return found;
  }

  public List<Scope> retries() {
    List<Scope> found = new ArrayList<>();
    for (MethodFlow flow : program.all()) {
      AnnotationNode annotation = annotated(flow, RETRYABLE);
      if (annotation != null) {
        String label = "@" + annotation.desc.substring(annotation.desc.lastIndexOf('/') + 1).replace(";", "");
        found.add(new Scope(label, flow, 0, flow.insns.length - 1));
      }
      for (Lambdas.Use use : program.lambdas(flow)) {
        if (use.consumer() >= 0 && retrying((MethodInsnNode) flow.insns[use.consumer()])) {
          MethodInsnNode call = (MethodInsnNode) flow.insns[use.consumer()];
          found.add(new Scope(Summaries.label(call.owner, call.name, call.desc), flow, use.index(), use.index()));
        }
      }
      for (Loop loop : flow.analyzed() ? program.loops(flow) : List.<Loop>of()) {
        for (int[] attempt : loop.attempts()) {
          found.add(new Scope("retry loop", flow, attempt[0], attempt[1] - 1));
        }
      }
    }
    return found;
  }

  public List<Call> sites(Scope scope) {
    List<Call> found = new ArrayList<>();
    collect(scope.flow(), scope.start(), scope.end(), found, new HashSet<>(), 0);
    return found;
  }

  private void collect(MethodFlow flow, int start, int end, List<Call> found, Set<MethodFlow> seen, int depth) {
    if (depth > DEPTH || !seen.add(flow)) {
      return;
    }
    for (int index = start; index <= end && index < flow.insns.length; index++) {
      if (flow.insns[index] instanceof MethodInsnNode call) {
        found.add(new Call(flow, index, call.owner, call.name, call.desc));
      }
    }
    for (Lambdas.Use use : program.lambdas(flow)) {
      boolean inside = use.index() >= start && use.index() <= end;
      if (!inside || (use.consumer() >= 0 && walker.async((MethodInsnNode) flow.insns[use.consumer()]))) {
        continue;
      }
      if (use.reference() != null) {
        found.add(new Call(flow, use.index(), use.reference().getOwner(), use.reference().getName(),
            use.reference().getDesc()));
      }
      for (MethodFlow body : use.bodies()) {
        collect(body, 0, body.insns.length - 1, found, seen, depth + 1);
      }
    }
  }

  private boolean retrying(MethodInsnNode call) {
    for (Map.Entry<String, String> entry : RETRY_CALLS.entrySet()) {
      if (call.name.matches(entry.getValue()) && program.index.isSubtype(call.owner, entry.getKey())) {
        return true;
      }
    }
    return false;
  }

  private static AnnotationNode annotated(MethodFlow flow, List<String> descs) {
    int generated = Opcodes.ACC_SYNTHETIC | Opcodes.ACC_BRIDGE | Opcodes.ACC_STATIC;
    if ((flow.method.access & generated) != 0 || flow.method.name.startsWith("<")) {
      return null;
    }
    AnnotationNode own = Annotations.findAny(descs, flow.method.visibleAnnotations, flow.method.invisibleAnnotations);
    if (own != null || (flow.method.access & Opcodes.ACC_PUBLIC) == 0) {
      return own;
    }
    return Annotations.findAny(descs, flow.owner.visibleAnnotations, flow.owner.invisibleAnnotations);
  }

  private boolean callback(MethodInsnNode call) {
    for (Map.Entry<String, Set<String>> entry : CALLBACKS.entrySet()) {
      if (entry.getValue().contains(call.name) && program.index.isSubtype(call.owner, entry.getKey())) {
        return true;
      }
    }
    return false;
  }

  private boolean transactional(MethodFlow flow) {
    AnnotationNode annotation = annotated(flow, TRANSACTIONAL);
    return annotation != null && active(annotation);
  }

  private static boolean active(AnnotationNode annotation) {
    String propagation = Annotations.enumValue(annotation, "propagation");
    String type = Annotations.enumValue(annotation, "value");
    return (propagation == null || !SUSPENDED.contains(propagation)) && (type == null || !SUSPENDED.contains(type));
  }

  private List<Scope> ranges(MethodFlow flow, String type, String open, Set<String> close) {
    List<Scope> found = new ArrayList<>();
    for (int index = 0; index < flow.insns.length; index++) {
      if (flow.insns[index] instanceof MethodInsnNode call && call.name.equals(open)
          && program.index.isSubtype(call.owner, type) && opens(flow, index)) {
        int end = closing(flow, index, type, close);
        String label = simple(call.owner) + "." + open + "()";
        found.add(new Scope(label, flow, index, end < 0 ? flow.insns.length - 1 : end));
      }
    }
    return found;
  }

  private static boolean opens(MethodFlow flow, int index) {
    MethodInsnNode call = (MethodInsnNode) flow.insns[index];
    if (!call.name.equals("setAutoCommit")) {
      return true;
    }
    return index > 0 && flow.insns[index - 1].getOpcode() == Opcodes.ICONST_0;
  }

  private static int monitorExit(MethodFlow flow, int from) {
    for (int index = from + 1; index < flow.insns.length; index++) {
      if (flow.insns[index].getOpcode() == Opcodes.MONITOREXIT) {
        return index;
      }
    }
    return -1;
  }

  private int closing(MethodFlow flow, int from, String type, Set<String> names) {
    for (int index = from + 1; index < flow.insns.length; index++) {
      if (flow.insns[index] instanceof MethodInsnNode call && names.contains(call.name)
          && program.index.isSubtype(call.owner, type)) {
        return index;
      }
    }
    return -1;
  }

  static String simple(String type) {
    return type.substring(type.lastIndexOf('/') + 1).replace('$', '.');
  }
}
