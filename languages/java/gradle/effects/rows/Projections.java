package nitpicker.effects.rows;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.IntPredicate;
import nitpicker.effects.Report;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.flow.Lambdas;
import nitpicker.effects.flow.Loop;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import nitpicker.effects.kinds.Summaries;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FieldNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.VarInsnNode;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class Projections {
  public static final String COLUMN = "EntityLoadedForOneColumn";
  public static final String EXISTENCE = "EntityLoadedForExistence";
  private static final List<String> NOT_COLUMNS = List.of("ManyToOne", "OneToOne", "OneToMany", "ManyToMany",
      "ElementCollection", "Transient", "Embedded");
  private final Program program;
  private final Rows rows;
  private final Report report;

  public Projections(Program program, Report report) {
    this.program = program;
    this.rows = new Rows(program);
    this.report = report;
  }

  public void run() {
    for (MethodFlow flow : program.entries()) {
      if (!flow.analyzed()) {
        continue;
      }
      Uses uses = null;
      for (int index = 0; index < flow.insns.length; index++) {
        if (!(flow.insns[index] instanceof MethodInsnNode call)) {
          continue;
        }
        boolean count = program.kinds.isRepository(call.owner) && call.name.matches("count([A-Z]\\w*)?")
            && Type.getReturnType(call.desc).getSort() == Type.LONG;
        boolean loaded = rows.finder(call) && (rows.single(call) || rows.collection(call));
        if (count || loaded) {
          uses = uses == null ? new Uses(flow) : uses;
          if (count) {
            counted(flow, uses, index, call);
          } else if (rows.single(call)) {
            present(flow, uses, index, call);
          } else {
            column(flow, uses, index, call);
          }
        }
      }
    }
  }

  private void counted(MethodFlow flow, Uses uses, int index, MethodInsnNode call) {
    List<Integer> users = uses.of(index);
    if (users.size() != 1 || flow.insns[users.get(0)].getOpcode() != Opcodes.LCMP) {
      return;
    }
    List<Integer> jumps = uses.of(users.get(0));
    List<SourceValue> operands = flow.operands(users.get(0));
    if (jumps.size() != 1 || operands.size() != 2) {
      return;
    }
    for (int position = 0; position < 2; position++) {
      SourceValue operand = operands.get(position);
      int constant = operand.insns.size() == 1 ? operand.insns.iterator().next().getOpcode() : -1;
      boolean zero = constant == Opcodes.LCONST_0;
      boolean one = constant == Opcodes.LCONST_1;
      if ((zero || one) && separates(flow.insns[jumps.get(0)].getOpcode(), position == 1, zero)) {
        existence(flow, index, call, "count");
      }
    }
  }

  private static boolean separates(int jump, boolean countFirst, boolean zero) {
    if (countFirst) {
      return zero ? Set.of(Opcodes.IFEQ, Opcodes.IFNE, Opcodes.IFLE, Opcodes.IFGT).contains(jump)
          : Set.of(Opcodes.IFLT, Opcodes.IFGE).contains(jump);
    }
    return zero ? Set.of(Opcodes.IFEQ, Opcodes.IFNE, Opcodes.IFLT, Opcodes.IFGE).contains(jump)
        : Set.of(Opcodes.IFGT, Opcodes.IFLE).contains(jump);
  }

  private void present(MethodFlow flow, Uses uses, int index, MethodInsnNode call) {
    List<Integer> users = uses.of(index);
    if (users.size() != 1 || rows.entityOf(call) == null) {
      return;
    }
    AbstractInsnNode user = flow.insns[users.get(0)];
    boolean tested = user.getOpcode() == Opcodes.IFNULL || user.getOpcode() == Opcodes.IFNONNULL
        || (user instanceof MethodInsnNode test && (test.name.equals("isPresent") || test.name.equals("isEmpty"))
            && test.owner.equals("java/util/Optional"));
    if (tested) {
      existence(flow, index, call, "loaded");
    }
  }

  private void existence(MethodFlow flow, int index, MethodInsnNode call, String form) {
    Map<String, Object> extra = new LinkedHashMap<>();
    extra.put("form", form);
    extra.put("origin", Summaries.label(call.owner, call.name, call.desc));
    report.add(EXISTENCE, flow, index, Report.methodName(flow) + "|" + extra.get("origin"), extra);
  }

  private void column(MethodFlow flow, Uses uses, int index, MethodInsnNode call) {
    ClassNode entity = rows.entityOf(call);
    String getter = entity == null ? null : getter(flow, uses, index);
    if (getter != null && isColumn(entity, getter)) {
      Map<String, Object> extra = new LinkedHashMap<>();
      extra.put("entity", entity.name.substring(entity.name.lastIndexOf('/') + 1));
      extra.put("property", getter);
      extra.put("origin", Summaries.label(call.owner, call.name, call.desc));
      report.add(COLUMN, flow, index, Report.methodName(flow) + "|" + extra.get("origin") + "|" + getter, extra);
    }
  }

  private String getter(MethodFlow flow, Uses uses, int index) {
    List<Integer> users = uses.of(index);
    if (users.size() == 1 && flow.insns[users.get(0)] instanceof MethodInsnNode stream
        && stream.name.equals("stream")) {
      List<Integer> next = uses.of(users.get(0));
      return next.size() == 1 ? mapped(flow, next.get(0)) : null;
    }
    int iterator = -1;
    for (int user : users) {
      if (flow.insns[user] instanceof MethodInsnNode call && call.name.equals("iterator")) {
        iterator = user;
      } else if (!(flow.insns[user] instanceof MethodInsnNode size && size.name.equals("collectionSizeOrDefault"))) {
        return null;
      }
    }
    return iterator < 0 ? null : looped(flow, uses, iterator);
  }

  private String mapped(MethodFlow flow, int map) {
    if (!(flow.insns[map] instanceof MethodInsnNode call) || !call.name.equals("map")) {
      return null;
    }
    for (Lambdas.Use use : program.lambdas(flow)) {
      if (use.consumer() != map) {
        continue;
      }
      if (use.reference() != null) {
        return use.reference().getDesc().startsWith("()") ? use.reference().getName() : null;
      }
      if (use.bodies().size() == 1) {
        MethodFlow body = use.bodies().get(0);
        int slot = body.parameterSlot(Type.getArgumentTypes(body.method.desc).length - 1);
        return only(body, 0, body.insns.length - 1, at -> body.insns[at] instanceof VarInsnNode load
            && load.var == slot && load.getOpcode() == Opcodes.ALOAD, false);
      }
    }
    return null;
  }

  private String looped(MethodFlow flow, Uses uses, int iterator) {
    for (int next : uses.of(iterator)) {
      if (flow.insns[next] instanceof MethodInsnNode call && call.name.equals("next")) {
        for (Loop loop : program.loops(flow)) {
          if (loop.contains(next)) {
            return only(flow, loop.start(), loop.end(), at -> at == next, true);
          }
        }
      }
    }
    return null;
  }

  private String only(MethodFlow flow, int from, int to, IntPredicate element, boolean adds) {
    Origins origins = new Origins(flow);
    String getter = null;
    int read = -1;
    for (int index = from; index <= to && index < flow.insns.length; index++) {
      if (!(flow.insns[index] instanceof MethodInsnNode call)) {
        continue;
      }
      final int column = read;
      boolean added = adds && call.name.equals("add") && column >= 0 && Type.getArgumentTypes(call.desc).length == 1
          && origins.dependsOn(flow.argument(index, 0), at -> at == column);
      boolean plain = call.owner.startsWith("kotlin/jvm/internal/") || call.name.equals("hasNext")
          || call.name.equals("next") || added;
      boolean reads = call.name.matches("(get|is)\\p{Lu}\\w*") && Type.getArgumentTypes(call.desc).length == 0
          && flow.receiver(index) != null && origins.dependsOn(flow.receiver(index), element);
      if (reads && getter == null) {
        getter = call.name;
        read = index;
      } else if (!plain) {
        return null;
      }
    }
    return getter;
  }

  private boolean isColumn(ClassNode entity, String getter) {
    String rest = getter.replaceFirst("^(get|is)", "");
    String property = Character.toLowerCase(rest.charAt(0)) + rest.substring(1);
    for (String type : lineage(entity)) {
      ClassNode node = program.index.library(type);
      for (FieldNode field : node == null ? List.<FieldNode>of() : node.fields) {
        if ((field.name.equals(property) || field.name.equals(getter)) && storedColumn(field)) {
          return true;
        }
      }
    }
    return false;
  }

  private List<String> lineage(ClassNode entity) {
    List<String> types = new java.util.ArrayList<>(List.of(entity.name));
    types.addAll(program.index.ancestors(entity.name));
    return types;
  }

  private static boolean storedColumn(FieldNode field) {
    if ((field.access & (Opcodes.ACC_STATIC | Opcodes.ACC_TRANSIENT)) != 0) {
      return false;
    }
    for (String name : NOT_COLUMNS) {
      for (String namespace : List.of("Ljakarta/persistence/", "Ljavax/persistence/")) {
        if (Annotations.find(namespace + name + ";", field.visibleAnnotations, field.invisibleAnnotations) != null) {
          return false;
        }
      }
    }
    return true;
  }
}
