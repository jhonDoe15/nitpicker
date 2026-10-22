package nitpicker.effects.kinds;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Program;
import nitpicker.effects.flow.Walker;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;

public final class Summaries {
  private record Site(String owner, String name, String desc) {}

  private static final int ROUNDS = 40;
  private static final int LONGEST = 6;
  private final Program program;
  private final Map<String, Map<String, List<String>>> sums = new HashMap<>();
  private final Map<String, List<Site>> sites = new LinkedHashMap<>();

  public Summaries(Program program) {
    this.program = program;
  }

  public void compute() {
    Walker walker = new Walker(program, false);
    for (MethodFlow flow : program.all()) {
      List<Site> found = new ArrayList<>();
      walker.walk(flow, Walker.Ctx.NONE, new Walker.Visitor() {
        @Override
        public void visit(MethodFlow at, int index, MethodInsnNode call, Walker.Ctx ctx) {
          found.add(new Site(call.owner, call.name, call.desc));
        }

        @Override
        public void reference(MethodFlow at, int index, String owner, String name, String desc, Walker.Ctx ctx) {
          found.add(new Site(owner, name, desc));
        }
      });
      sites.put(Program.key(flow.owner.name, flow.method.name, flow.method.desc), found);
    }
    boolean changed = true;
    for (int round = 0; changed && round < ROUNDS; round++) {
      changed = false;
      for (Map.Entry<String, List<Site>> entry : sites.entrySet()) {
        for (Site site : entry.getValue()) {
          changed |= propagate(entry.getKey(), site);
        }
      }
    }
  }

  private boolean propagate(String key, Site site) {
    String direct = program.kinds.direct(site.owner(), site.name(), site.desc());
    if (direct != null) {
      return put(key, direct, List.of(label(site.owner(), site.name(), site.desc())));
    }
    boolean changed = false;
    for (Map.Entry<String, List<String>> callee : of(site.owner(), site.name(), site.desc()).entrySet()) {
      List<String> path = new ArrayList<>();
      path.add(label(site.owner(), site.name(), site.desc()));
      path.addAll(callee.getValue());
      changed |= put(key, callee.getKey(), path);
    }
    return changed;
  }

  private boolean put(String key, String kind, List<String> path) {
    Map<String, List<String>> sum = sums.computeIfAbsent(key, ignored -> new LinkedHashMap<>());
    if (sum.containsKey(kind) || path.size() > LONGEST) {
      return false;
    }
    sum.put(kind, path);
    return true;
  }

  public Map<String, List<String>> of(String owner, String name, String desc) {
    String declaration = program.declaration(owner, name, desc);
    if (declaration == null) {
      return Map.of();
    }
    MethodNode method = program.method(declaration);
    if (method != null && !Program.isAbstract(method)) {
      return sums.getOrDefault(declaration, Map.of());
    }
    String declaringType = declaration.substring(0, declaration.indexOf('.'));
    List<ClassNode> implementations = program.index.implementations(declaringType);
    Map<String, List<String>> common = null;
    for (ClassNode implementation : implementations) {
      String concrete = program.declaration(implementation.name, name, desc);
      MethodNode body = concrete == null ? null : program.method(concrete);
      Map<String, List<String>> sum = body == null || Program.isAbstract(body)
          ? Map.of() : sums.getOrDefault(concrete, Map.of());
      if (common == null) {
        common = new LinkedHashMap<>(sum);
      } else {
        common.keySet().retainAll(sum.keySet());
      }
    }
    return common == null ? Map.of() : common;
  }

  public String kind(String owner, String name, String desc) {
    String direct = program.kinds.direct(owner, name, desc);
    if (direct != null) {
      return direct;
    }
    Map<String, List<String>> sum = of(owner, name, desc);
    return sum.isEmpty() ? null : sum.keySet().iterator().next();
  }

  public static String label(String owner, String name, String desc) {
    Type[] arguments = Type.getArgumentTypes(desc);
    boolean extension = owner.endsWith("ExtensionsKt") && arguments.length > 0
        && arguments[0].getSort() == Type.OBJECT;
    String type = extension ? arguments[0].getInternalName() : owner;
    String simple = type.substring(type.lastIndexOf('/') + 1).replace('$', '.');
    String method = name.endsWith("$default") ? name.substring(0, name.length() - "$default".length()) : name;
    return simple + "." + method + "()";
  }
}
