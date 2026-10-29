package nitpicker.effects.flow;

import java.util.ArrayList;
import java.util.List;
import org.objectweb.asm.Handle;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FieldInsnNode;
import org.objectweb.asm.tree.InvokeDynamicInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.TypeInsnNode;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class Lambdas {
  public record Use(int index, Handle reference, List<MethodFlow> bodies, int consumer, int argument, int captured) {}

  private static final String FACTORY = "java/lang/invoke/LambdaMetafactory";

  private Lambdas() {}

  static List<Use> of(Program program, MethodFlow flow) {
    List<Use> uses = new ArrayList<>();
    for (int index = 0; index < flow.insns.length; index++) {
      AbstractInsnNode insn = flow.insns[index];
      if (insn instanceof InvokeDynamicInsnNode indy && FACTORY.equals(indy.bsm.getOwner())
          && indy.bsmArgs.length > 1 && indy.bsmArgs[1] instanceof Handle handle) {
        uses.add(lambda(program, flow, index, indy, handle));
      } else if (anonymousType(program, insn) != null) {
        ClassNode node = program.index.node(anonymousType(program, insn));
        int[] consumer = consumer(flow, index);
        uses.add(new Use(index, null, program.bodies(node), consumer[0], consumer[1], 0));
      }
    }
    return uses;
  }

  private static String anonymousType(Program program, AbstractInsnNode insn) {
    String type = null;
    if (insn.getOpcode() == Opcodes.NEW) {
      type = ((TypeInsnNode) insn).desc;
    } else if (insn instanceof FieldInsnNode field && insn.getOpcode() == Opcodes.GETSTATIC
        && field.name.equals("INSTANCE")) {
      type = field.owner;
    }
    return type != null && program.anonymous(type) ? type : null;
  }

  private static Use lambda(Program program, MethodFlow flow, int index, InvokeDynamicInsnNode indy, Handle handle) {
    int[] consumer = consumer(flow, index);
    int captured = Type.getArgumentTypes(indy.desc).length;
    ClassNode owner = program.index.node(handle.getOwner());
    MethodNode target = program.index.declared(handle.getOwner(), handle.getName(), handle.getDesc());
    boolean body = owner != null && target != null
        && ((target.access & Opcodes.ACC_SYNTHETIC) != 0 || handle.getName().contains("lambda$"));
    if (body) {
      return new Use(index, null, List.of(program.flow(owner, target)), consumer[0], consumer[1], captured);
    }
    return new Use(index, handle, List.of(), consumer[0], consumer[1], captured);
  }

  private static int[] consumer(MethodFlow flow, int created) {
    if (!flow.analyzed()) {
      return new int[] {-1, -1};
    }
    Origins origins = new Origins(flow);
    for (int index = created + 1; index < flow.insns.length; index++) {
      if (!(flow.insns[index] instanceof MethodInsnNode call)) {
        continue;
      }
      List<SourceValue> operands = flow.operands(index);
      int offset = call.getOpcode() == Opcodes.INVOKESTATIC ? 0 : 1;
      for (int position = offset; position < operands.size(); position++) {
        if (origins.identity(operands.get(position)).terminals().contains(created)) {
          return new int[] {index, position - offset};
        }
      }
    }
    return new int[] {-1, -1};
  }
}
