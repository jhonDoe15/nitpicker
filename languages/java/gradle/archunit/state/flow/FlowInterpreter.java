import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
import org.objectweb.asm.tree.TypeInsnNode;
import org.objectweb.asm.tree.analysis.Frame;
import org.objectweb.asm.tree.analysis.Interpreter;

final class FlowInterpreter extends Interpreter<Flow> {
  private static final String LAMBDA_FACTORY = "java/lang/invoke/LambdaMetafactory";
  private final MethodNode method;
  private final MethodFlow flow;
  private final Library library;
  private final Flows flows;
  private final Map<String, Set<String>> spilled;
  private boolean spilledGrew;
  private final Map<String, String> newTypes = new HashMap<>();
  private final Map<String, Set<String>> boundReceivers = new HashMap<>();
  private final Map<String, String> boundNames = new HashMap<>();
  private final int[] argumentOfLocal;

  FlowInterpreter(
      MethodNode method, MethodFlow flow, Library library, Flows flows, Map<String, Set<String>> spilled) {
    super(Opcodes.ASM9);
    this.method = method;
    this.flow = flow;
    this.library = library;
    this.flows = flows;
    this.spilled = spilled;
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
      newTypes.put(id, ((TypeInsnNode) insn).desc);
      return new Flow(1, Set.of(id), Set.of(id));
    }
    if (opcode == Opcodes.GETSTATIC) {
      FieldInsnNode field = (FieldInsnNode) insn;
      return new Flow(Type.getType(field.desc).getSize(), Set.of(), Set.of(Aliases.staticField(field)));
    }
    if (opcode == Opcodes.LDC) {
      Object constant = ((LdcInsnNode) insn).cst;
      return Flow.of(constant instanceof Long || constant instanceof Double ? 2 : 1);
    }
    return Flow.of(Instructions.sizeOf(opcode));
  }

  @Override
  public Flow copyOperation(AbstractInsnNode insn, Flow value) {
    return value;
  }

  @Override
  public Flow unaryOperation(AbstractInsnNode insn, Flow value) {
    int opcode = insn.getOpcode();
    if (opcode == Opcodes.GETFIELD && flows.isContinuation(((FieldInsnNode) insn).owner)) {
      FieldInsnNode field = (FieldInsnNode) insn;
      return Flow.tainted(Type.getType(field.desc).getSize(), spilled.getOrDefault(field.name, Set.of()));
    }
    if (opcode == Opcodes.GETFIELD && isOuter((FieldInsnNode) insn, value)) {
      return new Flow(1, value.taint, Set.of(Flow.OUTER + Type.getType(((FieldInsnNode) insn).desc).getInternalName()));
    }
    if (opcode == Opcodes.GETFIELD) {
      FieldInsnNode field = (FieldInsnNode) insn;
      return new Flow(Type.getType(field.desc).getSize(), value.taint,
          Aliases.fieldOf(value.alias, field.owner, field.name, flows::isStateful));
    }
    if (opcode == Opcodes.PUTSTATIC) {
      FieldInsnNode field = (FieldInsnNode) insn;
      if (Instructions.holdsData(field.desc, flows::isEnum)) {
        flow.store(index(insn), "=", Set.of(Aliases.staticField(field)), value.taint);
      }
      return null;
    }
    if (opcode == Opcodes.NEWARRAY || opcode == Opcodes.ANEWARRAY) {
      String id = Flow.NEW + index(insn);
      return new Flow(1, Set.of(id), Set.of(id));
    }
    if (opcode == Opcodes.CHECKCAST) {
      return value;
    }
    if (Instructions.returnsNothing(opcode)) {
      return null;
    }
    return Flow.tainted(Instructions.sizeOf(opcode), value.taint);
  }

  @Override
  public Flow binaryOperation(AbstractInsnNode insn, Flow first, Flow second) {
    int opcode = insn.getOpcode();
    if (opcode == Opcodes.PUTFIELD) {
      FieldInsnNode field = (FieldInsnNode) insn;
      if (flows.isContinuation(field.owner)) {
        Set<String> held = spilled.computeIfAbsent(field.name, ignored -> new TreeSet<>());
        spilledGrew |= held.addAll(second.taint);
      } else if (Instructions.holdsData(field.desc, flows::isEnum)) {
        flow.store(index(insn), "=", Aliases.fieldOf(first.alias, field.owner, field.name, flows::isStateful),
            second.taint);
      }
      return null;
    }
    if (opcode >= Opcodes.IALOAD && opcode <= Opcodes.SALOAD) {
      return new Flow(Instructions.sizeOf(opcode), first.taint, first.alias);
    }
    if (opcode >= Opcodes.IF_ICMPEQ && opcode <= Opcodes.IF_ACMPNE) {
      return null;
    }
    Set<String> taint = new TreeSet<>(first.taint);
    taint.addAll(second.taint);
    return Flow.tainted(Instructions.sizeOf(opcode), taint);
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
    Set<String> taint =
        Instructions.PREDICATES.contains(call.name) ? Aliases.dataOf(values) : Aliases.taintOf(values, 0);
    feedLambdas(insn, values, Aliases.dataOf(values));
    Optional<String> source = library.source(call.owner, call.name);
    if (source.isPresent()) {
      flow.sources.add(Flow.SOURCE + source.get());
      return Flow.tainted(returned.getSize(), Set.of(Flow.SOURCE + source.get()));
    }
    boolean instance = insn.getOpcode() != Opcodes.INVOKESTATIC;
    if (call.name.equals("<init>")) {
      Set<String> created =
          values.get(0).alias.stream().filter(id -> id.startsWith(Flow.NEW)).collect(Collectors.toSet());
      flow.store(index(insn), "new", created, Aliases.taintOf(values, 1));
      return null;
    }
    if (instance && library.isMutator(call.owner, call.name)) {
      flow.store(index(insn), call.name, values.get(0).alias, Aliases.taintOf(values, 1));
    }
    library.staticTarget(call.owner, call.name).filter(target -> target < values.size()).ifPresent(target ->
        flow.store(index(insn), call.name, values.get(target).alias, Aliases.taintOf(values, 0)));
    Set<String> held = new TreeSet<>();
    if (flows.isProjectClass(call.owner)) {
      boolean dispatch = insn.getOpcode() == Opcodes.INVOKEVIRTUAL || insn.getOpcode() == Opcodes.INVOKEINTERFACE;
      flow.call(index(insn), new MethodFlow.Call(call.owner, call.name, call.desc, dispatch), values);
      for (Flows.Target target : flows.targets(call.owner, call.name, call.desc, dispatch)) {
        held.addAll(Aliases.held(target.flow.returns, values, instance, target.owner, flows::isStateful));
        taint.addAll(target.flow.returnSources);
        flow.sources.addAll(target.flow.returnSources);
      }
    } else {
      Set<String> created = Aliases.created(values);
      if (!created.isEmpty()) {
        flow.store(index(insn) + ":into", call.name, created, Aliases.dataOf(values));
      }
      createdReceiver(call, instance, values).ifPresent(type -> flow.call(index(insn),
          new MethodFlow.Call(type, call.name, call.desc, false), values));
    }
    if (returned == Type.VOID_TYPE) {
      return null;
    }
    if ((instance && library.isAccessor(call.owner, call.name)) || library.isIdentity(call.owner, call.name)) {
      return new Flow(returned.getSize(), values.get(0).taint, values.get(0).alias);
    }
    return held.isEmpty() ? Flow.tainted(returned.getSize(), taint) : new Flow(returned.getSize(), taint, held);
  }

  private Optional<String> createdReceiver(MethodInsnNode call, boolean instance, List<? extends Flow> values) {
    if (!instance) {
      return Optional.empty();
    }
    return values.get(0).alias.stream()
        .map(newTypes::get)
        .filter(type -> type != null && flows.isProjectClass(type))
        .findFirst();
  }

  @Override
  public void returnOperation(AbstractInsnNode insn, Flow value, Flow expected) {
    if (value != null) {
      value.alias.stream().filter(Aliases::returnable).forEach(flow.returns::add);
      value.taint.stream().filter(id -> id.startsWith(Flow.SOURCE)).forEach(flow.returnSources::add);
    }
  }

  @Override
  public Flow merge(Flow first, Flow second) {
    return first.merge(second);
  }

  private Flow dynamic(InvokeDynamicInsnNode insn, List<? extends Flow> values) {
    Type returned = Type.getReturnType(insn.desc);
    Set<String> taint = Aliases.taintOf(values, 0);
    feedLambdas(insn, values, Aliases.dataOf(values));
    if (insn.bsm.getOwner().equals(LAMBDA_FACTORY) && insn.bsmArgs.length > 1 && insn.bsmArgs[1] instanceof Handle) {
      Handle target = (Handle) insn.bsmArgs[1];
      if (flows.isProjectClass(target.getOwner())) {
        String id = Flow.LAMBDA + index(insn);
        boolean dispatch = target.getTag() == Opcodes.H_INVOKEVIRTUAL || target.getTag() == Opcodes.H_INVOKEINTERFACE;
        flow.lambda(id, new MethodFlow.Call(target.getOwner(), target.getName(), target.getDesc(), dispatch), values);
        return new Flow(returned.getSize(), taint, Set.of(id));
      }
      boolean bound = target.getTag() == Opcodes.H_INVOKEVIRTUAL || target.getTag() == Opcodes.H_INVOKEINTERFACE;
      if (bound && !values.isEmpty() && library.isMutator(target.getOwner(), target.getName())) {
        String id = Flow.LAMBDA + index(insn);
        boundReceivers.put(id, values.get(0).alias);
        boundNames.put(id, target.getName());
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
    for (String id : lambdas) {
      if (boundReceivers.containsKey(id)) {
        flow.store(index(insn) + ":" + id, boundNames.get(id), boundReceivers.get(id), taint);
      }
    }
  }

  boolean spilledGrew() {
    return spilledGrew;
  }

  private static boolean isOuter(FieldInsnNode field, Flow value) {
    return field.name.startsWith("this$") && value.alias.contains(Flow.SELF);
  }

  private int index(AbstractInsnNode insn) {
    return method.instructions.indexOf(insn);
  }
}
