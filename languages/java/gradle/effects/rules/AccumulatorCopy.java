package nitpicker.effects.rules;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import nitpicker.effects.Report;
import nitpicker.effects.flow.Lambdas;
import nitpicker.effects.flow.Loop;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.JumpInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.TypeInsnNode;
import org.objectweb.asm.tree.VarInsnNode;
import org.objectweb.asm.tree.analysis.Frame;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class AccumulatorCopy {
  public static final String RULE = "AccumulatorCopyInLoop";
  private record Copy(int index, Set<Integer> slots) {}

  private static final Copy NONE = new Copy(-1, Set.of());
  private static final Map<String, Set<String>> COPIES = Map.ofEntries(
      Map.entry("java/util/List", Set.of("copyOf")),
      Map.entry("java/util/Set", Set.of("copyOf")),
      Map.entry("java/util/Map", Set.of("copyOf")),
      Map.entry("java/util/Arrays", Set.of("copyOf")),
      Map.entry("java/util/stream/Stream", Set.of("concat")),
      Map.entry("com/google/common/collect/Lists", Set.of("newArrayList", "newLinkedList")),
      Map.entry("com/google/common/collect/Sets", Set.of("newHashSet", "newLinkedHashSet", "newTreeSet")),
      Map.entry("com/google/common/collect/Maps", Set.of("newHashMap", "newLinkedHashMap", "newTreeMap")),
      Map.entry("kotlin/collections/CollectionsKt", Set.of("plus", "plusElement", "minus", "minusElement",
          "toMutableList", "toList", "union", "toSet", "toMutableSet")),
      Map.entry("kotlin/collections/SetsKt", Set.of("plus", "minus", "plusElement", "minusElement")),
      Map.entry("kotlin/collections/MapsKt", Set.of("plus", "minus", "toMutableMap", "toMap")),
      Map.entry("kotlin/collections/ArraysKt", Set.of("plus", "plusElement", "copyOf")));
  private final Program program;
  private final Report report;

  public AccumulatorCopy(Program program, Report report) {
    this.program = program;
    this.report = report;
  }

  public void run() {
    for (MethodFlow flow : program.all()) {
      if (!flow.analyzed()) {
        continue;
      }
      for (Loop loop : program.loops(flow)) {
        Set<Integer> reported = new HashSet<>();
        for (int index = loop.start(); index <= loop.end(); index++) {
          if (flow.insns[index].getOpcode() == Opcodes.ASTORE && !guarded(flow, loop, index)) {
            int slot = ((VarInsnNode) flow.insns[index]).var;
            Copy copy = copied(flow, top(flow, index), identity -> identity.slots().contains(slot));
            if (copy.slots().stream().noneMatch(reported::contains)) {
              reported.addAll(copy.slots());
              report(flow, index, copy.slots(), "loop");
            }
          }
        }
      }
      for (Lambdas.Use use : program.lambdas(flow)) {
        reduceLambda(flow, use);
      }
    }
  }

  private static boolean guarded(MethodFlow flow, Loop loop, int store) {
    for (int index = loop.start(); index < store; index++) {
      if (flow.insns[index] instanceof JumpInsnNode jump && jump.getOpcode() != Opcodes.GOTO) {
        int target = flow.index(jump.label);
        if (target > store && target <= loop.end()) {
          return true;
        }
      }
    }
    return false;
  }

  private void reduceLambda(MethodFlow flow, Lambdas.Use use) {
    if (use.consumer() < 0 || use.bodies().size() != 1) {
      return;
    }
    MethodInsnNode call = (MethodInsnNode) flow.insns[use.consumer()];
    int arguments = Type.getArgumentTypes(call.desc).length;
    boolean accumulator = use.argument() == (arguments == 3 ? 1 : arguments - 1);
    if (!call.name.equals("reduce") || !accumulator
        || !program.index.isSubtype(call.owner, "java/util/stream/Stream")) {
      return;
    }
    MethodFlow body = use.bodies().get(0);
    if (!body.analyzed()) {
      return;
    }
    int slot = body.parameterSlot(use.captured());
    for (int index = 0; index < body.insns.length; index++) {
      if (body.insns[index].getOpcode() == Opcodes.ARETURN) {
        Copy copy = copied(body, top(body, index), identity -> identity.parameters().contains(slot));
        report(body, copy.index(), copy.slots(), "reduce");
      }
    }
  }

  private void report(MethodFlow flow, int index, Set<Integer> slots, String form) {
    if (slots.isEmpty()) {
      return;
    }
    String name = null;
    for (int slot : slots) {
      String candidate = flow.localName(slot, index);
      if (candidate != null && (name == null || (name.contains("$") && !candidate.contains("$")))) {
        name = candidate;
      }
    }
    name = name == null ? "accumulator" : name.replaceAll("\\$.*", "");
    Map<String, Object> extra = new LinkedHashMap<>();
    extra.put("variable", name);
    extra.put("form", form);
    report.add(RULE, flow, index, Report.methodName(flow) + "|" + name, extra);
  }

  private static SourceValue top(MethodFlow flow, int index) {
    Frame<SourceValue> frame = flow.frame(index);
    return frame == null || frame.getStackSize() == 0 ? null : frame.getStack(frame.getStackSize() - 1);
  }

  private Copy copied(MethodFlow flow, SourceValue value, Predicate<Origins.Identity> accumulator) {
    Origins origins = new Origins(flow);
    Deque<Integer> queue = new ArrayDeque<>(origins.identity(value).terminals());
    Set<Integer> seen = new HashSet<>();
    while (!queue.isEmpty() && seen.size() < 40) {
      int index = queue.poll();
      if (!seen.add(index)) {
        continue;
      }
      int copy = copyCall(flow, index);
      if (copy >= 0) {
        for (SourceValue source : sources(flow, copy)) {
          Origins.Identity identity = followReceivers(flow, origins, source);
          if (accumulator.test(identity)) {
            return new Copy(copy, identity.slots().isEmpty() ? identity.parameters() : identity.slots());
          }
        }
      }
      if (flow.insns[index] instanceof MethodInsnNode call && call.getOpcode() != Opcodes.INVOKESTATIC) {
        queue.addAll(origins.identity(flow.receiver(index)).terminals());
      }
    }
    return NONE;
  }

  private List<SourceValue> sources(MethodFlow flow, int copy) {
    List<SourceValue> operands = flow.operands(copy);
    MethodInsnNode call = (MethodInsnNode) flow.insns[copy];
    int offset = call.getOpcode() == Opcodes.INVOKESTATIC ? 0 : 1;
    return operands.subList(Math.min(offset, operands.size()), operands.size());
  }

  private Origins.Identity followReceivers(MethodFlow flow, Origins origins, SourceValue source) {
    Origins.Identity identity = origins.identity(source);
    Deque<Integer> queue = new ArrayDeque<>(identity.terminals());
    Set<Integer> seen = new HashSet<>();
    while (!queue.isEmpty() && seen.size() < 20) {
      int index = queue.poll();
      if (seen.add(index) && flow.insns[index] instanceof MethodInsnNode call
          && call.getOpcode() != Opcodes.INVOKESTATIC) {
        Origins.Identity receiver = origins.identity(flow.receiver(index));
        identity.slots().addAll(receiver.slots());
        identity.parameters().addAll(receiver.parameters());
        queue.addAll(receiver.terminals());
      }
    }
    return identity;
  }

  private int copyCall(MethodFlow flow, int index) {
    AbstractInsnNode insn = flow.insns[index];
    if (insn.getOpcode() == Opcodes.NEW) {
      return constructor(flow, index, ((TypeInsnNode) insn).desc);
    }
    if (!(insn instanceof MethodInsnNode call)) {
      return -1;
    }
    boolean builder = call.owner.startsWith("com/google/common/collect/Immutable") && call.owner.contains("$Builder")
        && (call.name.equals("addAll") || call.name.equals("putAll"));
    boolean immutable = call.owner.startsWith("com/google/common/collect/Immutable") && call.name.equals("copyOf");
    Set<String> names = COPIES.get(call.owner);
    return builder || immutable || (names != null && names.contains(call.name)) ? index : -1;
  }

  private int constructor(MethodFlow flow, int created, String type) {
    if (!type.startsWith("java/util/")) {
      return -1;
    }
    for (int index = created + 1; index < flow.insns.length; index++) {
      if (flow.insns[index] instanceof MethodInsnNode call && call.getOpcode() == Opcodes.INVOKESPECIAL
          && call.name.equals("<init>") && call.owner.equals(type)) {
        Type[] arguments = Type.getArgumentTypes(call.desc);
        boolean copying = arguments.length == 1 && arguments[0].getSort() == Type.OBJECT
            && arguments[0].getInternalName().startsWith("java/util/");
        Origins.Identity receiver = new Origins(flow).identity(flow.receiver(index));
        if (receiver.terminals().contains(created) || receiver.terminals().contains(created + 1)) {
          return copying ? index : -1;
        }
      }
    }
    return -1;
  }
}
