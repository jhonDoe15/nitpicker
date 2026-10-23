import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.objectweb.asm.Handle;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.FieldInsnNode;
import org.objectweb.asm.tree.InvokeDynamicInsnNode;
import org.objectweb.asm.tree.LdcInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.TryCatchBlockNode;
import org.objectweb.asm.tree.analysis.Frame;
import org.objectweb.asm.tree.analysis.Interpreter;

final class FlowInterpreter extends Interpreter<Flow> {
  private static final String LAMBDA_FACTORY = "java/lang/invoke/LambdaMetafactory";
  private static final Set<Integer> DOUBLE_WORDS =
      Set.of(Opcodes.LALOAD, Opcodes.DALOAD, Opcodes.LADD, Opcodes.DADD, Opcodes.LSUB, Opcodes.DSUB,
          Opcodes.LMUL, Opcodes.DMUL, Opcodes.LDIV, Opcodes.DDIV, Opcodes.LREM, Opcodes.DREM, Opcodes.LSHL,
          Opcodes.LSHR, Opcodes.LUSHR, Opcodes.LAND, Opcodes.LOR, Opcodes.LXOR, Opcodes.LNEG, Opcodes.DNEG,
          Opcodes.I2L, Opcodes.I2D, Opcodes.L2D, Opcodes.F2L, Opcodes.F2D, Opcodes.D2L, Opcodes.LCONST_0,
          Opcodes.LCONST_1, Opcodes.DCONST_0, Opcodes.DCONST_1);

  private final MethodNode method;
  private final MethodFlow flow;
  private final Library library;
  private final Flows flows;
  private final int[] argumentOfLocal;

  FlowInterpreter(MethodNode method, MethodFlow flow, Library library, Flows flows) {
    super(Opcodes.ASM9);
    this.method = method;
    this.flow = flow;
    this.library = library;
    this.flows = flows;
    this.argumentOfLocal = new int[Math.max(method.maxLocals, 1) + 2];
    boolean isStatic = (method.access & Opcodes.ACC_STATIC) != 0;
    int local = 0;
    int argument = 0;
    if (!isStatic) {
      argumentOfLocal[local++] = argument++;
    }
    for (Type type : Type.getArgumentTypes(method.desc)) {
      if (local < argumentOfLocal.length) {
        argumentOfLocal[local] = argument++;
      }
      local += type.getSize();
    }
  }

  @Override
  public Flow newValue(Type type) {
    if (type == Type.VOID_TYPE) {
      return null;
    }
    return Flow.of(type == null ? 1 : type.getSize());
  }

  @Override
  public Flow newParameterValue(boolean isInstanceMethod, int local, Type type) {
    String argument = Flow.ARG + argumentOfLocal[local];
    Set<String> alias = isInstanceMethod && local == 0 ? Set.of(Flow.SELF, argument) : Set.of(argument);
    return new Flow(type.getSize(), Set.of(argument), alias);
  }

  @Override
  public Flow newExceptionValue(TryCatchBlockNode block, Frame<Flow> frame, Type type) {
    return Flow.SINGLE;
  }

  @Override
  public Flow newOperation(AbstractInsnNode insn) {
    int opcode = insn.getOpcode();
    if (opcode == Opcodes.NEW) {
      String id = Flow.NEW + index(insn);
      return new Flow(1, Set.of(id), Set.of(id));
    }
    if (opcode == Opcodes.GETSTATIC) {
      FieldInsnNode field = (FieldInsnNode) insn;
      return new Flow(Type.getType(field.desc).getSize(), Set.of(), Set.of(staticField(field)));
    }
    if (opcode == Opcodes.LDC) {
      Object constant = ((LdcInsnNode) insn).cst;
      return Flow.of(constant instanceof Long || constant instanceof Double ? 2 : 1);
    }
    return Flow.of(DOUBLE_WORDS.contains(opcode) ? 2 : 1);
  }

  @Override
  public Flow copyOperation(AbstractInsnNode insn, Flow value) {
    return value;
  }

  @Override
  public Flow unaryOperation(AbstractInsnNode insn, Flow value) {
    int opcode = insn.getOpcode();
    if (opcode == Opcodes.GETFIELD) {
      FieldInsnNode field = (FieldInsnNode) insn;
      return new Flow(Type.getType(field.desc).getSize(), value.taint, fieldOf(value.alias, field.name));
    }
    if (opcode == Opcodes.PUTSTATIC) {
      FieldInsnNode field = (FieldInsnNode) insn;
      flow.store(index(insn), "=", Set.of(staticField(field)), value.taint);
      return null;
    }
    if (opcode == Opcodes.NEWARRAY || opcode == Opcodes.ANEWARRAY) {
      String id = Flow.NEW + index(insn);
      return new Flow(1, Set.of(id), Set.of(id));
    }
    if (opcode == Opcodes.CHECKCAST) {
      return value;
    }
    if (returnsNothing(opcode)) {
      return null;
    }
    return Flow.tainted(DOUBLE_WORDS.contains(opcode) ? 2 : 1, value.taint);
  }

  @Override
  public Flow binaryOperation(AbstractInsnNode insn, Flow first, Flow second) {
    int opcode = insn.getOpcode();
    if (opcode == Opcodes.PUTFIELD) {
      FieldInsnNode field = (FieldInsnNode) insn;
      flow.store(index(insn), "=", fieldOf(first.alias, field.name), second.taint);
      return null;
    }
    if (opcode >= Opcodes.IALOAD && opcode <= Opcodes.SALOAD) {
      return new Flow(DOUBLE_WORDS.contains(opcode) ? 2 : 1, first.taint, first.alias);
    }
    if (opcode >= Opcodes.IF_ICMPEQ && opcode <= Opcodes.IF_ACMPNE) {
      return null;
    }
    Set<String> taint = new TreeSet<>(first.taint);
    taint.addAll(second.taint);
    return Flow.tainted(DOUBLE_WORDS.contains(opcode) ? 2 : 1, taint);
  }

  @Override
  public Flow ternaryOperation(AbstractInsnNode insn, Flow array, Flow position, Flow value) {
    flow.store(index(insn), "[]", array.alias, value.taint);
    return null;
  }

  @Override
  public Flow naryOperation(AbstractInsnNode insn, List<? extends Flow> values) {
    if (insn.getOpcode() == Opcodes.MULTIANEWARRAY) {
      String id = Flow.NEW + index(insn);
      return new Flow(1, Set.of(id), Set.of(id));
    }
    if (insn instanceof InvokeDynamicInsnNode) {
      return dynamic((InvokeDynamicInsnNode) insn, values);
    }
    MethodInsnNode call = (MethodInsnNode) insn;
    Type returned = Type.getReturnType(call.desc);
    Set<String> taint = taintOf(values, 0);
    feedLambdas(insn, values, taint);
    Optional<String> source = library.source(call.owner, call.name);
    if (source.isPresent()) {
      flow.sources.add(Flow.SOURCE + source.get());
      return Flow.tainted(returned.getSize(), Set.of(Flow.SOURCE + source.get()));
    }
    boolean instance = insn.getOpcode() != Opcodes.INVOKESTATIC;
    if (call.name.equals("<init>")) {
      Set<String> created =
          values.get(0).alias.stream().filter(id -> id.startsWith(Flow.NEW)).collect(Collectors.toSet());
      flow.store(index(insn), "new", created, taintOf(values, 1));
      return null;
    }
    if (instance && library.isMutator(call.owner, call.name)) {
      flow.store(index(insn), call.name, values.get(0).alias, taintOf(values, 1));
    }
    if (flows.isProjectClass(call.owner)) {
      boolean dispatch = insn.getOpcode() == Opcodes.INVOKEVIRTUAL || insn.getOpcode() == Opcodes.INVOKEINTERFACE;
      flow.call(index(insn), new MethodFlow.Call(call.owner, call.name, call.desc, dispatch), values);
    }
    if (returned == Type.VOID_TYPE) {
      return null;
    }
    if (instance && library.isAccessor(call.owner, call.name)) {
      return new Flow(returned.getSize(), values.get(0).taint, values.get(0).alias);
    }
    if (flows.isProjectClass(call.owner)) {
      Set<String> held = held(flows.returnsOf(call.owner, call.name, call.desc), instance ? values.get(0).alias : Set.of());
      return held.isEmpty() ? Flow.tainted(returned.getSize(), taint) : new Flow(returned.getSize(), taint, held);
    }
    return Flow.tainted(returned.getSize(), taint);
  }

  @Override
  public void returnOperation(AbstractInsnNode insn, Flow value, Flow expected) {
    if (value != null) {
      value.alias.stream()
          .filter(id -> id.startsWith(Flow.STATIC) || id.startsWith(Flow.FIELD))
          .forEach(flow.returns::add);
    }
  }

  private static Set<String> held(Set<String> returns, Set<String> receiver) {
    Set<String> held = new TreeSet<>();
    for (String id : returns) {
      if (id.startsWith(Flow.STATIC)) {
        held.add(id);
      } else if (!receiver.isEmpty()) {
        held.addAll(fieldOf(receiver, id.substring(Flow.FIELD.length())));
      }
    }
    return held;
  }

  @Override
  public Flow merge(Flow first, Flow second) {
    return first.merge(second);
  }

  private Flow dynamic(InvokeDynamicInsnNode insn, List<? extends Flow> values) {
    Type returned = Type.getReturnType(insn.desc);
    Set<String> taint = taintOf(values, 0);
    feedLambdas(insn, values, taint);
    if (insn.bsm.getOwner().equals(LAMBDA_FACTORY) && insn.bsmArgs.length > 1 && insn.bsmArgs[1] instanceof Handle) {
      Handle target = (Handle) insn.bsmArgs[1];
      if (flows.isProjectClass(target.getOwner())) {
        String id = Flow.LAMBDA + index(insn);
        boolean dispatch = target.getTag() == Opcodes.H_INVOKEVIRTUAL || target.getTag() == Opcodes.H_INVOKEINTERFACE;
        flow.lambda(id, new MethodFlow.Call(target.getOwner(), target.getName(), target.getDesc(), dispatch), values);
        return new Flow(returned.getSize(), taint, Set.of(id));
      }
    }
    return Flow.tainted(returned.getSize(), taint);
  }

  private void feedLambdas(AbstractInsnNode insn, List<? extends Flow> values, Set<String> taint) {
    Set<String> lambdas = values.stream()
        .flatMap(value -> value.alias.stream())
        .filter(id -> id.startsWith(Flow.LAMBDA))
        .collect(Collectors.toSet());
    if (!lambdas.isEmpty()) {
      flow.feed(index(insn), lambdas, taint);
    }
  }

  private static Set<String> taintOf(List<? extends Flow> values, int from) {
    Set<String> taint = new TreeSet<>();
    for (int position = from; position < values.size(); position++) {
      taint.addAll(values.get(position).taint);
    }
    return taint;
  }

  private static Set<String> fieldOf(Set<String> alias, String name) {
    if (alias.contains(Flow.SELF)) {
      return Set.of(Flow.FIELD + name);
    }
    return alias;
  }

  private static String staticField(FieldInsnNode field) {
    return Flow.STATIC + field.owner.substring(field.owner.lastIndexOf('/') + 1) + "." + field.name;
  }

  private static boolean returnsNothing(int opcode) {
    return (opcode >= Opcodes.IFEQ && opcode <= Opcodes.IFLE)
        || (opcode >= Opcodes.TABLESWITCH && opcode <= Opcodes.ARETURN)
        || opcode == Opcodes.ATHROW
        || opcode == Opcodes.MONITORENTER
        || opcode == Opcodes.MONITOREXIT
        || opcode == Opcodes.IFNULL
        || opcode == Opcodes.IFNONNULL;
  }

  private int index(AbstractInsnNode insn) {
    return method.instructions.indexOf(insn);
  }
}
