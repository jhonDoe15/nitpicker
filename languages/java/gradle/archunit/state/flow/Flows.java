import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.Source;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.LocalVariableNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.analysis.Analyzer;
import org.objectweb.asm.tree.analysis.AnalyzerException;

final class Flows {
  private static final int PASSES = 4;
  private static final int DEPTH = 128;
  private static final String CONTINUATION = "kotlin.coroutines.jvm.internal.ContinuationImpl";
  static final class Target {
    final String owner;
    final MethodFlow flow;

    Target(String owner, MethodFlow flow) {
      this.owner = owner;
      this.flow = flow;
    }
  }

  static final class Declared {
    final JavaClass type;
    final MethodNode method;

    Declared(JavaClass type, MethodNode method) {
      this.type = type;
      this.method = method;
    }
  }

  private final Map<String, JavaClass> classes = new LinkedHashMap<>();
  private final Map<String, Declared> declared = new LinkedHashMap<>();
  private final Map<String, Optional<MethodFlow>> analyzed = new HashMap<>();
  private final Set<String> running = new HashSet<>();
  private final Map<String, Map<String, String>> resolved = new HashMap<>();
  private final Library library = new Library();
  private final Set<String> stateful;

  Flows(JavaClasses main, Set<String> stateful) {
    this.stateful = stateful;
    main.forEach(type -> classes.put(Summaries.internal(type), type));
    for (JavaClass type : main) {
      for (MethodNode method : methodsOf(type)) {
        declared.put(Summaries.internal(type) + "." + method.name + method.desc, new Declared(type, method));
      }
    }
  }

  Map<String, JavaClass> classes() {
    return classes;
  }

  Map<String, Declared> declared() {
    return declared;
  }

  Library library() {
    return library;
  }

  Optional<MethodFlow> of(String key) {
    Optional<MethodFlow> done = analyzed.get(key);
    if (done != null) {
      return done;
    }
    Declared found = declared.get(key);
    if (found == null || running.size() >= DEPTH || !running.add(key)) {
      return Optional.empty();
    }
    Optional<MethodFlow> flow = analyze(found.type, found.method);
    running.remove(key);
    analyzed.put(key, flow);
    return flow;
  }

  List<Target> targets(String owner, String name, String desc, boolean dispatch) {
    List<Target> found = new ArrayList<>();
    for (Map.Entry<String, String> declaring : declarations(owner, name, desc, dispatch).entrySet()) {
      of(declaring.getKey()).ifPresent(flow -> found.add(new Target(declaring.getValue(), flow)));
    }
    return found;
  }

  private Map<String, String> declarations(String owner, String name, String desc, boolean dispatch) {
    return resolved.computeIfAbsent(owner + "." + name + desc + dispatch, ignored -> {
      Map<String, String> found = new LinkedHashMap<>();
      Optional<JavaClass> start = Optional.ofNullable(classes.get(owner));
      Optional<JavaClass> current = start;
      while (current.isPresent()) {
        String type = Summaries.internal(current.get());
        if (declared.containsKey(type + "." + name + desc)) {
          found.put(type + "." + name + desc, type);
          break;
        }
        current = current.get().getRawSuperclass().filter(parent -> classes.containsKey(Summaries.internal(parent)));
      }
      if (dispatch && start.isPresent()) {
        for (JavaClass subclass : start.get().getAllSubclasses()) {
          String type = Summaries.internal(subclass);
          if (declared.containsKey(type + "." + name + desc)) {
            found.put(type + "." + name + desc, type);
          }
        }
      }
      return found;
    });
  }

  boolean isStateful(String internalName) {
    return stateful.contains(internalName);
  }

  private Optional<MethodFlow> analyze(JavaClass type, MethodNode method) {
    if ((method.access & (Opcodes.ACC_ABSTRACT | Opcodes.ACC_NATIVE)) != 0) {
      return Optional.empty();
    }
    boolean instance = (method.access & Opcodes.ACC_STATIC) == 0;
    Map<String, Set<String>> spilled = new HashMap<>();
    try {
      for (int pass = 0; pass < PASSES; pass++) {
        MethodFlow flow = new MethodFlow(Summaries.internal(type), method.name, method.desc, instance, names(method));
        FlowInterpreter interpreter = new FlowInterpreter(method, flow, library, this, spilled);
        new Analyzer<>(interpreter).analyze(flow.owner, method);
        if (!interpreter.spilledGrew() || pass == PASSES - 1) {
          return Optional.of(flow);
        }
      }
      return Optional.empty();
    } catch (AnalyzerException | RuntimeException unreadable) {
      return Optional.empty();
    }
  }

  boolean isProjectClass(String internalName) {
    return classes.containsKey(internalName);
  }

  boolean isEnum(String internalName) {
    JavaClass type = classes.get(internalName);
    return type != null && type.isEnum();
  }

  boolean isContinuation(String internalName) {
    JavaClass type = classes.get(internalName);
    return type != null && type.isAssignableTo(CONTINUATION);
  }

  private static List<String> names(MethodNode method) {
    List<String> names = new ArrayList<>();
    boolean instance = (method.access & Opcodes.ACC_STATIC) == 0;
    int slot = 0;
    if (instance) {
      names.add("this");
      slot++;
    }
    for (Type type : Type.getArgumentTypes(method.desc)) {
      names.add(nameAt(method, slot).orElse("argument " + names.size()));
      slot += type.getSize();
    }
    return names;
  }

  private static Optional<String> nameAt(MethodNode method, int slot) {
    if (method.localVariables == null) {
      return Optional.empty();
    }
    return method.localVariables.stream()
        .filter(variable -> variable.index == slot)
        .map((LocalVariableNode variable) -> variable.name)
        .findFirst();
  }

  private static List<MethodNode> methodsOf(JavaClass type) {
    Optional<Source> source = type.getSource();
    if (source.isEmpty() || !"file".equals(source.get().getUri().getScheme())) {
      return List.of();
    }
    try {
      ClassNode node = new ClassNode();
      new ClassReader(Files.readAllBytes(Paths.get(source.get().getUri()))).accept(node, ClassReader.SKIP_FRAMES);
      return node.methods;
    } catch (IOException | RuntimeException unreadable) {
      return List.of();
    }
  }
}
