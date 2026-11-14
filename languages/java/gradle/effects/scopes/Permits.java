package nitpicker.effects.scopes;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.FieldInsnNode;
import org.objectweb.asm.tree.IntInsnNode;
import org.objectweb.asm.tree.LdcInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.TypeInsnNode;
import org.objectweb.asm.tree.analysis.SourceValue;

final class Permits {
  private final Program program;
  private final Map<String, Integer> counts = new HashMap<>();

  Permits(Program program) {
    this.program = program;
  }

  boolean single(MethodFlow flow, int acquire) {
    for (int terminal : new Origins(flow).identity(flow.receiver(acquire)).terminals()) {
      AbstractInsnNode insn = flow.insns[terminal];
      Integer count = insn instanceof FieldInsnNode field ? fieldPermits(field) : created(flow, terminal);
      if (count != null) {
        return count == 1;
      }
    }
    return false;
  }

  private Integer fieldPermits(FieldInsnNode field) {
    String key = field.owner + "." + field.name;
    if (!counts.containsKey(key)) {
      counts.put(key, null);
      for (MethodFlow flow : program.all()) {
        for (int index = 0; flow.analyzed() && index < flow.insns.length; index++) {
          if (flow.insns[index] instanceof FieldInsnNode put && put.name.equals(field.name)
              && put.owner.equals(field.owner)
              && (put.getOpcode() == Opcodes.PUTFIELD || put.getOpcode() == Opcodes.PUTSTATIC)) {
            List<SourceValue> operands = flow.operands(index);
            if (operands.isEmpty()) {
              continue;
            }
            for (int source : new Origins(flow).identity(operands.get(operands.size() - 1)).terminals()) {
              Integer count = created(flow, source);
              if (count != null) {
                counts.put(key, count);
              }
            }
          }
        }
      }
    }
    return counts.get(key);
  }

  private Integer created(MethodFlow flow, int index) {
    AbstractInsnNode insn = flow.insns[index];
    if (insn instanceof MethodInsnNode call && call.owner.equals("kotlinx/coroutines/sync/SemaphoreKt")) {
      return constant(flow, flow.argument(index, 0));
    }
    if (!(insn instanceof TypeInsnNode type) || insn.getOpcode() != Opcodes.NEW
        || !type.desc.equals("java/util/concurrent/Semaphore")) {
      return null;
    }
    for (int at = index + 1; at < flow.insns.length; at++) {
      if (flow.insns[at] instanceof MethodInsnNode init && init.name.equals("<init>")
          && init.owner.equals(type.desc)) {
        return constant(flow, flow.argument(at, 0));
      }
    }
    return null;
  }

  private static Integer constant(MethodFlow flow, SourceValue value) {
    if (value == null) {
      return null;
    }
    for (int source : new Origins(flow).identity(value).terminals()) {
      AbstractInsnNode insn = flow.insns[source];
      int opcode = insn.getOpcode();
      if (opcode >= Opcodes.ICONST_M1 && opcode <= Opcodes.ICONST_5) {
        return opcode - Opcodes.ICONST_0;
      }
      if (insn instanceof IntInsnNode number) {
        return number.operand;
      }
      if (insn instanceof LdcInsnNode ldc && ldc.cst instanceof Integer number) {
        return number;
      }
    }
    return null;
  }
}
