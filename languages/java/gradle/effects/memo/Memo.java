package nitpicker.effects.memo;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import nitpicker.effects.flow.Lambdas;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FieldInsnNode;
import org.objectweb.asm.tree.FieldNode;
import org.objectweb.asm.tree.JumpInsnNode;
import org.objectweb.asm.tree.LdcInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class Memo {
  private final Program program;
  private final Map<MethodFlow, List<int[]>> branches = new HashMap<>();

  public Memo(Program program) {
    this.program = program;
  }

  public boolean guarded(MethodFlow flow, int index) {
    for (int[] range : branches.computeIfAbsent(flow, this::find)) {
      if (index >= range[0] && index <= range[1]) {
        return true;
      }
    }
    return false;
  }

  public boolean once(MethodFlow flow, Lambdas.Use use) {
    if (use.consumer() < 0 || use.argument() != 1 || !flow.analyzed()
        || !(flow.insns[use.consumer()] instanceof MethodInsnNode call) || !call.name.equals("computeIfAbsent")
        || !program.index.isSubtype(call.owner, "java/util/Map")) {
      return false;
    }
    Origins origins = new Origins(flow);
    return all(origins, flow.receiver(use.consumer()), flow, false)
        && all(origins, flow.argument(use.consumer(), 0), flow, true);
  }

  private boolean all(Origins origins, SourceValue value, MethodFlow flow, boolean constant) {
    if (value == null) {
      return false;
    }
    List<Integer> terminals = List.copyOf(origins.identity(value).terminals());
    if (terminals.isEmpty() || !origins.identity(value).parameters().isEmpty()) {
      return false;
    }
    for (int terminal : terminals) {
      AbstractInsnNode insn = flow.insns[terminal];
      boolean literal = insn instanceof LdcInsnNode || (insn.getOpcode() >= Opcodes.ICONST_M1
          && insn.getOpcode() <= Opcodes.SIPUSH);
      boolean field = insn.getOpcode() == Opcodes.GETSTATIC && (!constant || finalField((FieldInsnNode) insn));
      if (!(field || (constant && literal))) {
        return false;
      }
    }
    return true;
  }

  private boolean finalField(FieldInsnNode access) {
    ClassNode owner = program.index.node(access.owner);
    if (owner == null) {
      return false;
    }
    for (FieldNode field : owner.fields) {
      if (field.name.equals(access.name)) {
        return (field.access & Opcodes.ACC_FINAL) != 0;
      }
    }
    return false;
  }

  private List<int[]> find(MethodFlow flow) {
    List<int[]> found = new ArrayList<>();
    if (!flow.analyzed()) {
      return found;
    }
    Origins origins = new Origins(flow);
    for (int index = 0; index < flow.insns.length; index++) {
      if (!(flow.insns[index] instanceof JumpInsnNode jump) || !testsZero(jump.getOpcode())
          || flow.operands(index).isEmpty()) {
        continue;
      }
      int target = flow.index(jump.label);
      for (int terminal : origins.identity(flow.operands(index).get(0)).terminals()) {
        if (target > index && flow.insns[terminal] instanceof FieldInsnNode read
            && read.getOpcode() == Opcodes.GETSTATIC) {
          int[] range = branch(flow, index, target, jump.getOpcode(), read);
          if (range != null) {
            found.add(range);
          }
        }
      }
    }
    return found;
  }

  private static boolean testsZero(int opcode) {
    return opcode == Opcodes.IFNULL || opcode == Opcodes.IFNONNULL || opcode == Opcodes.IFEQ
        || opcode == Opcodes.IFNE;
  }

  private static int[] branch(MethodFlow flow, int index, int target, int opcode, FieldInsnNode field) {
    boolean skipsWhenSet = opcode == Opcodes.IFNONNULL || opcode == Opcodes.IFNE;
    if (!pure(flow, index, target, skipsWhenSet)) {
      return null;
    }
    int from = skipsWhenSet ? index + 1 : target;
    int to = skipsWhenSet ? target - 1 : flow.insns.length - 1;
    int last = -1;
    for (int at = from; at <= to; at++) {
      if (flow.insns[at] instanceof FieldInsnNode write && write.getOpcode() == Opcodes.PUTSTATIC
          && write.owner.equals(field.owner) && write.name.equals(field.name)) {
        last = at;
      }
    }
    return last < 0 ? null : new int[] {from, skipsWhenSet ? to : last};
  }

  private static boolean pure(MethodFlow flow, int index, int target, boolean skipsWhenSet) {
    if (skipsWhenSet) {
      for (int at = index + 1; at < target; at++) {
        if (flow.insns[at] instanceof JumpInsnNode other && other.getOpcode() != Opcodes.GOTO
            && flow.index(other.label) == target) {
          return false;
        }
      }
      return true;
    }
    int before = target - 1;
    while (before >= 0 && flow.insns[before].getOpcode() < 0) {
      before--;
    }
    int opcode = before < 0 ? -1 : flow.insns[before].getOpcode();
    return opcode == Opcodes.GOTO || opcode == Opcodes.ATHROW
        || (opcode >= Opcodes.IRETURN && opcode <= Opcodes.RETURN);
  }
}
