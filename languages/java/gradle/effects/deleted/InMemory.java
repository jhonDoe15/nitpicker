package nitpicker.effects.deleted;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.effects.Report;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.flow.Lambdas;
import nitpicker.effects.flow.Loop;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Program;
import nitpicker.effects.flow.Walker;
import nitpicker.effects.jpa.Entities;
import nitpicker.effects.kinds.Summaries;
import nitpicker.effects.races.Repositories;
import org.objectweb.asm.Handle;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FieldInsnNode;
import org.objectweb.asm.tree.FieldNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.TypeInsnNode;

public final class InMemory {
  public static final String RULE = "DeletedItemInMemory";
  public static final int MIN_UNITS = 5;
  public static final int SHARE = 80;
  private static final List<String> FILTERS = List.of("Lorg/hibernate/annotations/SQLRestriction;",
      "Lorg/hibernate/annotations/Where;", "Lorg/hibernate/annotations/Filter;");

  private record Unit(MethodFlow flow, String entity, int source, boolean guarded) {}

  private final Program program;
  private final SoftDelete soft;
  private final Entities entities;
  private final Report report;
  private final Walker walker;
  private final Repositories repositories;
  private final Set<String> filteredReads = new HashSet<>();

  private final Set<String> alreadyReported;

  public InMemory(Program program, SoftDelete soft, Entities entities, Set<String> alreadyReported, Report report) {
    this.alreadyReported = alreadyReported;
    this.program = program;
    this.soft = soft;
    this.entities = entities;
    this.report = report;
    this.walker = new Walker(program, false);
    this.repositories = new Repositories(program);
  }

  public void run() {
    QueryReads reads = new QueryReads(program, soft);
    for (QueryReads.Read read : reads.declared()) {
      if (soft.of(read.entity()).stream().anyMatch(flag -> flag.mentionedIn(read.text()))) {
        filteredReads.add(Program.key(read.declaring(), read.name(), read.desc()));
      }
    }
    Map<String, List<Unit>> units = new HashMap<>();
    for (MethodFlow flow : program.all()) {
      if (flow.analyzed() && !flow.external && !program.index.isExternal(flow.owner.name)) {
        for (Unit unit : units(flow)) {
          units.computeIfAbsent(unit.entity(), key -> new ArrayList<>()).add(unit);
        }
      }
    }
    for (Map.Entry<String, List<Unit>> entry : units.entrySet()) {
      List<Unit> all = entry.getValue();
      long guarded = all.stream().filter(Unit::guarded).count();
      if (all.size() < MIN_UNITS || guarded * 100 < all.size() * (long) SHARE) {
        continue;
      }
      for (Unit unit : all) {
        if (!unit.guarded()) {
          add(unit, (int) guarded, all.size());
        }
      }
    }
  }

  private List<Unit> units(MethodFlow flow) {
    Map<String, Boolean> elements = new LinkedHashMap<>();
    for (int index = 0; index < flow.insns.length; index++) {
      if (flow.insns[index] instanceof TypeInsnNode cast && cast.getOpcode() == Opcodes.CHECKCAST
          && soft.flags().containsKey(cast.desc)
          && program.loops(flow).stream().anyMatch(loop -> loop.contains(flow.index(cast)))) {
        elements.putIfAbsent(cast.desc, true);
      }
    }
    List<MethodFlow> bodies = new ArrayList<>();
    for (Lambdas.Use use : program.lambdas(flow)) {
      bodies.addAll(use.bodies());
      boolean iterating = use.consumer() >= 0 && walker.iterating((MethodInsnNode) flow.insns[use.consumer()]);
      Handle reference = use.reference();
      if (iterating && reference != null && reference.getTag() != Opcodes.H_INVOKESTATIC && use.captured() == 0
          && soft.flags().containsKey(reference.getOwner())) {
        elements.putIfAbsent(reference.getOwner(), true);
      }
      for (MethodFlow body : use.bodies()) {
        Type[] parameters = Type.getArgumentTypes(body.method.desc);
        String last = parameters.length == 0 ? null : parameters[parameters.length - 1].getInternalName();
        if (iterating && last != null && soft.flags().containsKey(last)) {
          elements.putIfAbsent(last, true);
        }
      }
    }
    List<Unit> units = new ArrayList<>();
    for (String entity : elements.keySet()) {
      int source = -1;
      boolean filteredSource = false;
      for (int index = 0; index < flow.insns.length && source == -1; index++) {
        if (flow.insns[index] instanceof MethodInsnNode call) {
          Entities.Relation relation = call.getOpcode() == Opcodes.INVOKESTATIC ? null
              : entities.relation(call.owner, call.name, call.desc);
          if (relation != null && relation.collection() && entity.equals(relation.target())) {
            source = restricted(call) ? -2 : index;
          } else if (call.getOpcode() != Opcodes.INVOKESTATIC && program.kinds.isRepository(call.owner)
              && entity.equals(repositories.entity(call.owner))
              && !alreadyReported.contains(
                  Program.key(flow.owner.name, flow.method.name, flow.method.desc) + "#" + index)) {
            source = index;
            filteredSource = filteredReads.contains(Program.key(call.owner, call.name, call.desc));
          }
        }
      }
      if (source >= 0) {
        units.add(new Unit(flow, entity, source, filteredSource || checks(flow, bodies, entity)));
      }
    }
    return units;
  }

  private boolean checks(MethodFlow flow, List<MethodFlow> bodies, String entity) {
    List<MethodFlow> all = new ArrayList<>(bodies);
    all.add(flow);
    for (MethodFlow body : all) {
      for (int index = 0; index < body.insns.length; index++) {
        if (reads(body, index, entity)) {
          return true;
        }
      }
    }
    for (Lambdas.Use use : program.lambdas(flow)) {
      Handle handle = use.reference();
      if (handle != null && named(entity, handle.getOwner(), handle.getName())) {
        return true;
      }
    }
    return passesThroughHelper(flow, entity);
  }

  private boolean passesThroughHelper(MethodFlow flow, String entity) {
    for (AbstractInsnNode insn : flow.insns) {
      if (!(insn instanceof MethodInsnNode call) || !program.index.isProject(call.owner)) {
        continue;
      }
      String declaration = program.declaration(call.owner, call.name, call.desc);
      MethodFlow target = declaration == null ? null : program.flow(declaration);
      if (target == null || target == flow || !target.analyzed()) {
        continue;
      }
      List<MethodFlow> bodies = new ArrayList<>(List.of(target));
      program.lambdas(target).forEach(use -> bodies.addAll(use.bodies()));
      for (MethodFlow body : bodies) {
        for (int index = 0; index < body.insns.length; index++) {
          if (reads(body, index, entity)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private boolean restricted(MethodInsnNode getter) {
    List<String> types = new ArrayList<>(List.of(getter.owner));
    types.addAll(program.index.ancestors(getter.owner));
    String property = getter.name.replaceFirst("^(get|is)(?=[A-Z])", "");
    property = Character.toLowerCase(property.charAt(0)) + property.substring(1);
    for (String type : types) {
      ClassNode node = program.index.node(type);
      if (node == null) {
        continue;
      }
      for (FieldNode field : node.fields) {
        if (field.name.equals(property) && Annotations.findAny(FILTERS, field.visibleAnnotations,
            field.invisibleAnnotations) != null) {
          return true;
        }
      }
      for (MethodNode method : node.methods) {
        if (method.name.equals(getter.name) && Annotations.findAny(FILTERS, method.visibleAnnotations,
            method.invisibleAnnotations) != null) {
          return true;
        }
      }
    }
    return false;
  }

  private boolean reads(MethodFlow flow, int index, String entity) {
    if (flow.insns[index] instanceof MethodInsnNode call) {
      return named(entity, call.owner, call.name);
    }
    return flow.insns[index] instanceof FieldInsnNode field && field.getOpcode() == Opcodes.GETFIELD
        && program.index.isSubtype(entity, field.owner)
        && soft.of(entity).stream().anyMatch(flag -> flag.property().equals(field.name));
  }

  private boolean named(String entity, String owner, String name) {
    if (!program.index.isSubtype(entity, owner)) {
      return false;
    }
    for (SoftDelete.Flag flag : soft.of(entity)) {
      String capital = Character.toUpperCase(flag.property().charAt(0)) + flag.property().substring(1);
      if (name.equals(flag.property()) || name.equals("get" + capital) || name.equals("is" + capital)) {
        return true;
      }
    }
    return false;
  }

  private void add(Unit unit, int guarded, int total) {
    SoftDelete.Flag flag = soft.of(unit.entity()).get(0);
    String entity = SoftDelete.simple(unit.entity());
    Map<String, Object> extra = new LinkedHashMap<>();
    extra.put("entity", entity);
    extra.put("flag", flag.property());
    extra.put("source", sourceLabel(unit));
    extra.put("guarded", guarded);
    extra.put("units", total);
    report.add(RULE, unit.flow(), unit.source(), Report.methodName(unit.flow()) + "|" + entity, extra);
  }

  private String sourceLabel(Unit unit) {
    MethodInsnNode call = (MethodInsnNode) unit.flow().insns[unit.source()];
    return Summaries.label(call.owner, call.name, call.desc);
  }
}
