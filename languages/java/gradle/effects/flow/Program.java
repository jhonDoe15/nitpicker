package nitpicker.effects.flow;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BiPredicate;
import nitpicker.effects.classes.ClassIndex;
import nitpicker.effects.classes.Lines;
import nitpicker.effects.kinds.Kinds;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.InnerClassNode;
import org.objectweb.asm.tree.MethodNode;

public final class Program {
  public final ClassIndex index;
  public final Kinds kinds;
  private final Map<String, Lines> lines = new HashMap<>();
  private final Map<String, MethodFlow> flows = new HashMap<>();
  private final Map<MethodFlow, List<Lambdas.Use>> uses = new HashMap<>();
  private BiPredicate<MethodFlow, Integer> io = (flow, index) -> false;

  public Program(ClassIndex index) {
    this.index = index;
    this.kinds = new Kinds(index);
  }

  public void io(BiPredicate<MethodFlow, Integer> test) {
    io = test;
  }

  public static String key(String owner, String name, String desc) {
    return owner + '.' + name + desc;
  }

  public MethodFlow flow(ClassNode owner, MethodNode method) {
    return flows.computeIfAbsent(key(owner.name, method.name, method.desc),
        key -> new MethodFlow(owner, method, lines.computeIfAbsent(owner.name, name -> Lines.of(owner))));
  }

  public MethodFlow flow(String key) {
    return flows.get(key);
  }

  public List<MethodFlow> entries() {
    List<MethodFlow> found = new ArrayList<>();
    for (ClassNode node : index.projectClasses()) {
      if (anonymous(node.name)) {
        continue;
      }
      for (MethodNode method : node.methods) {
        boolean generated = (method.access & (Opcodes.ACC_SYNTHETIC | Opcodes.ACC_BRIDGE)) != 0;
        if (method.instructions.size() > 0 && !generated && !method.name.contains("lambda$")) {
          found.add(flow(node, method));
        }
      }
    }
    return found;
  }

  public List<MethodFlow> all() {
    List<MethodFlow> found = new ArrayList<>();
    for (ClassNode node : index.projectClasses()) {
      for (MethodNode method : node.methods) {
        if (method.instructions.size() > 0) {
          found.add(flow(node, method));
        }
      }
    }
    return found;
  }

  public boolean anonymous(String type) {
    ClassNode node = index.node(type);
    if (node == null || node.innerClasses == null) {
      return false;
    }
    for (InnerClassNode inner : node.innerClasses) {
      if (inner.name.equals(type)) {
        return inner.innerName == null;
      }
    }
    return false;
  }

  public List<MethodFlow> bodies(ClassNode node) {
    List<MethodFlow> found = new ArrayList<>();
    for (MethodNode method : node.methods) {
      boolean special = method.name.startsWith("<") || (method.access & Opcodes.ACC_BRIDGE) != 0;
      if (!special && method.instructions.size() > 0) {
        found.add(flow(node, method));
      }
    }
    return found;
  }

  public List<Lambdas.Use> lambdas(MethodFlow flow) {
    return uses.computeIfAbsent(flow, key -> Lambdas.of(this, key));
  }

  public List<Loop> loops(MethodFlow flow) {
    if (flow.loops() == null) {
      flow.setLoops(Loop.find(flow, index -> io.test(flow, index)));
    }
    return flow.loops();
  }

  public String declaration(String owner, String name, String desc) {
    Set<String> seen = new HashSet<>();
    Deque<String> queue = new ArrayDeque<>(List.of(owner));
    while (!queue.isEmpty()) {
      String type = queue.poll();
      ClassNode node = index.node(type);
      if (node == null || !seen.add(type)) {
        continue;
      }
      if (index.declared(type, name, desc) != null) {
        return key(type, name, desc);
      }
      if (node.superName != null) {
        queue.add(node.superName);
      }
      queue.addAll(node.interfaces);
    }
    return null;
  }

  public MethodNode method(String key) {
    int dot = key.indexOf('.');
    int paren = key.indexOf('(');
    return index.declared(key.substring(0, dot), key.substring(dot + 1, paren), key.substring(paren));
  }

  public static boolean isAbstract(MethodNode method) {
    return (method.access & Opcodes.ACC_ABSTRACT) != 0 || method.instructions.size() == 0;
  }
}
