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
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import nitpicker.effects.flow.Walker;
import nitpicker.effects.kinds.Call;
import nitpicker.effects.kinds.Summaries;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.AnnotationNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FieldInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.TypeInsnNode;

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
  private final Locks locks;

  public Scopes(Program program) {
    this.program = program;
    this.walker = new Walker(program, false);
    this.locks = new Locks(program);
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
    }
    found.addAll(locks.commits());
    return found;
  }

  public List<Scope> locks() {
    return locks.locks();
  }

  public boolean fillOnce(Scope scope, Call site) {
    return locks.fillOnce(scope, site);
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
        if (use.consumer() >= 0 && retrying((MethodInsnNode) flow.insns[use.consumer()])
            && withRetryPolicy(flow, use.consumer())) {
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
      if (!inside || walker.detached(flow, use)) {
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

  private boolean withRetryPolicy(MethodFlow flow, int consumer) {
    MethodInsnNode call = (MethodInsnNode) flow.insns[consumer];
    if (!call.owner.endsWith("/FailsafeExecutor") || !flow.analyzed()) {
      return true;
    }
    Origins origins = new Origins(flow);
    List<Integer> fields = new ArrayList<>();
    boolean direct = origins.dependsOn(flow.receiver(consumer), at -> {
      if (flow.insns[at] instanceof FieldInsnNode field && field.getOpcode() == Opcodes.GETFIELD) {
        fields.add(at);
      }
      return retryPolicy(flow.insns[at]);
    });
    return direct || mentionsRetryPolicy(flow) || fields.stream().anyMatch(at -> assignedWithPolicy(flow, at));
  }

  private boolean assignedWithPolicy(MethodFlow flow, int read) {
    FieldInsnNode field = (FieldInsnNode) flow.insns[read];
    for (MethodFlow other : program.bodies(flow.owner)) {
      for (AbstractInsnNode insn : other.insns) {
        if (insn instanceof FieldInsnNode put && put.getOpcode() == Opcodes.PUTFIELD && put.name.equals(field.name)
            && mentionsRetryPolicy(other)) {
          return true;
        }
      }
    }
    for (MethodNode method : flow.owner.methods) {
      if (method.name.equals("<init>") && mentionsRetryPolicy(program.flow(flow.owner, method))) {
        return true;
      }
    }
    return false;
  }

  private static boolean mentionsRetryPolicy(MethodFlow flow) {
    for (AbstractInsnNode insn : flow.insns) {
      if (retryPolicy(insn)) {
        return true;
      }
    }
    return false;
  }

  private static boolean retryPolicy(AbstractInsnNode insn) {
    String text = insn instanceof MethodInsnNode call ? call.owner + call.desc
        : insn instanceof TypeInsnNode type ? type.desc
        : insn instanceof FieldInsnNode field ? field.desc : "";
    return text.contains("failsafe/RetryPolicy");
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
    return annotated(flow.owner, flow.method, descs);
  }

  private static AnnotationNode annotated(ClassNode owner, MethodNode method, List<String> descs) {
    int generated = Opcodes.ACC_SYNTHETIC | Opcodes.ACC_BRIDGE | Opcodes.ACC_STATIC | Opcodes.ACC_PRIVATE;
    if ((method.access & generated) != 0 || method.name.startsWith("<")) {
      return null;
    }
    AnnotationNode own = Annotations.findAny(descs, method.visibleAnnotations, method.invisibleAnnotations);
    if (own != null || (method.access & Opcodes.ACC_PUBLIC) == 0) {
      return own;
    }
    return Annotations.findAny(descs, owner.visibleAnnotations, owner.invisibleAnnotations);
  }

  public boolean suspends(Call site) {
    String declaration = program.declaration(site.owner(), site.name(), site.desc());
    MethodNode method = declaration == null ? null : program.method(declaration);
    if (method == null) {
      return false;
    }
    ClassNode owner = program.index.node(declaration.substring(0, declaration.indexOf('.')));
    AnnotationNode annotation = annotated(owner, method, TRANSACTIONAL);
    return annotation != null && !active(annotation);
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

  static String simple(String type) {
    return type.substring(type.lastIndexOf('/') + 1).replace('$', '.');
  }
}
