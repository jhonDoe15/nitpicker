package nitpicker.effects.retries;

import java.util.List;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.flow.Lambdas;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.AnnotationNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.LdcInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.TypeInsnNode;
import org.objectweb.asm.tree.analysis.SourceValue;

final class Conflicts {
  private static final List<String> CONFLICTS = List.of("org/springframework/dao/OptimisticLockingFailureException",
      "jakarta/persistence/OptimisticLockException", "javax/persistence/OptimisticLockException",
      "org/hibernate/StaleObjectStateException", "org/hibernate/StaleStateException");
  private static final List<String> RETRYABLE = List.of("Lorg/springframework/retry/annotation/Retryable;",
      "Lorg/springframework/resilience/annotation/Retryable;");
  private static final List<String> EXCEPTIONS = List.of("retryFor", "include", "includes", "value");
  private final Program program;

  Conflicts(Program program) {
    this.program = program;
  }

  boolean retries(MethodFlow flow, Origins origins, MethodInsnNode retry, int index) {
    return Type.getArgumentTypes(retry.desc).length > 0 && specMentions(flow, origins, flow.argument(index, 0), 0);
  }

  private boolean specMentions(MethodFlow flow, Origins origins, SourceValue value, int depth) {
    if (depth > 3) {
      return false;
    }
    for (int at : origins.identity(value).terminals()) {
      if (!(flow.insns[at] instanceof MethodInsnNode call)) {
        continue;
      }
      if (program.index.isProject(call.owner) && mentionsConflict(helper(call), depth + 1)) {
        return true;
      }
      for (int position = 0; position < Type.getArgumentTypes(call.desc).length; position++) {
        if (origins.dependsOn(flow.argument(at, position), insn -> names(flow.insns[insn]))) {
          return true;
        }
      }
      for (Lambdas.Use use : program.lambdas(flow)) {
        if (use.consumer() == at && use.bodies().stream().anyMatch(body -> mentionsConflict(body, depth + 1))) {
          return true;
        }
      }
      if (call.getOpcode() != Opcodes.INVOKESTATIC && flow.receiver(at) != null
          && specMentions(flow, origins, flow.receiver(at), depth + 1)) {
        return true;
      }
    }
    return false;
  }

  private boolean names(AbstractInsnNode insn) {
    String type = insn instanceof TypeInsnNode node ? node.desc
        : insn instanceof LdcInsnNode ldc && ldc.cst instanceof Type constant
            && constant.getSort() == Type.OBJECT ? constant.getInternalName() : null;
    return type != null && conflict(type);
  }

  boolean conflict(String type) {
    return program.index.isSubtypeOfAny(type, CONFLICTS);
  }

  private boolean mentionsConflict(MethodFlow flow, int depth) {
    if (flow == null) {
      return false;
    }
    for (AbstractInsnNode insn : flow.insns) {
      if (names(insn)) {
        return true;
      }
    }
    if (depth > 3) {
      return false;
    }
    for (AbstractInsnNode insn : flow.insns) {
      if (insn instanceof MethodInsnNode call && program.index.isProject(call.owner)
          && mentionsConflict(helper(call), depth + 1)) {
        return true;
      }
    }
    for (Lambdas.Use use : program.lambdas(flow)) {
      for (MethodFlow body : use.bodies()) {
        if (mentionsConflict(body, depth + 1)) {
          return true;
        }
      }
    }
    return false;
  }

  MethodFlow helper(MethodInsnNode call) {
    String key = program.declaration(call.owner, call.name, call.desc);
    MethodNode method = key == null ? null : program.method(key);
    ClassNode owner = key == null ? null : program.index.node(key.substring(0, key.indexOf('.')));
    return method == null || owner == null || Program.isAbstract(method) ? null : program.flow(owner, method);
  }

  private AnnotationNode retryable(MethodFlow flow) {
    AnnotationNode own = Annotations.findAny(RETRYABLE, flow.method.visibleAnnotations,
        flow.method.invisibleAnnotations);
    boolean visible = (flow.method.access & Opcodes.ACC_PUBLIC) != 0;
    return own != null || !visible ? own
        : Annotations.findAny(RETRYABLE, flow.owner.visibleAnnotations, flow.owner.invisibleAnnotations);
  }

  boolean conflicting(MethodFlow flow) {
    AnnotationNode annotation = retryable(flow);
    if (annotation == null) {
      return false;
    }
    for (String name : EXCEPTIONS) {
      for (String type : Annotations.strings(annotation, name)) {
        if (conflict(type)) {
          return true;
        }
      }
    }
    return false;
  }
}
