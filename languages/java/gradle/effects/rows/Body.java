package nitpicker.effects.rows;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.IntPredicate;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.IincInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.VarInsnNode;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class Body {
  public record Result(String entity, boolean deletes) {}

  private static final List<String> BOXES = List.of("java/lang/Integer", "java/lang/Long", "java/lang/Boolean",
      "java/lang/Double", "java/lang/Short", "java/lang/Byte", "java/lang/Character", "java/lang/Float");
  private final Program program;

  public Body(Program program) {
    this.program = program;
  }

  public Result inspect(MethodFlow flow, int from, int to, IntPredicate element) {
    Origins origins = new Origins(flow);
    Set<Integer> written = written(flow, from, to);
    IntPredicate dependent = at -> element.test(at) || Origins.isLoad(flow.insns[at])
        && written.contains(((VarInsnNode) flow.insns[at]).var);
    String entity = null;
    boolean deletes = false;
    boolean sets = false;
    for (int index = from; index <= to && index < flow.insns.length; index++) {
      if (!(flow.insns[index] instanceof MethodInsnNode call) || tolerated(call)) {
        continue;
      }
      SourceValue receiver = flow.receiver(index);
      boolean setter = call.name.matches("set\\p{Lu}\\w*") && receiver != null
          && origins.dependsOn(receiver, element) && independent(flow, origins, index, call, dependent);
      boolean delete = call.name.equals("delete") && program.kinds.isRepository(call.owner)
          && Type.getArgumentTypes(call.desc).length == 1
          && origins.dependsOn(flow.argument(index, 0), element);
      if (!setter && !delete) {
        return null;
      }
      entity = setter ? call.owner : entity;
      deletes |= delete;
      sets |= setter;
    }
    boolean one = sets != deletes;
    return one ? new Result(entity, deletes) : null;
  }

  private static boolean independent(MethodFlow flow, Origins origins, int index, MethodInsnNode call,
      IntPredicate element) {
    int arguments = Type.getArgumentTypes(call.desc).length;
    for (int position = 0; position < arguments; position++) {
      if (origins.dependsOn(flow.argument(index, position), element)) {
        return false;
      }
    }
    return true;
  }

  private static Set<Integer> written(MethodFlow flow, int from, int to) {
    Set<Integer> slots = new HashSet<>();
    for (int index = from; index <= to && index < flow.insns.length; index++) {
      AbstractInsnNode insn = flow.insns[index];
      int opcode = insn.getOpcode();
      if (insn instanceof IincInsnNode iinc) {
        slots.add(iinc.var);
      } else if (insn instanceof VarInsnNode var && opcode >= Opcodes.ISTORE && opcode <= Opcodes.ASTORE) {
        slots.add(var.var);
      }
    }
    return slots;
  }

  private boolean tolerated(MethodInsnNode call) {
    return call.owner.startsWith("kotlin/jvm/internal/")
        || (call.name.equals("valueOf") && BOXES.contains(call.owner))
        || (call.name.equals("hasNext") || call.name.equals("next"))
            && program.index.isSubtype(call.owner, "java/util/Iterator");
  }
}
