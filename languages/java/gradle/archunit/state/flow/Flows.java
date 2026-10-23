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
  private final Library library = new Library();

  Flows(JavaClasses main) {
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
    if (found == null || !running.add(key)) {
      return Optional.empty();
    }
    Optional<MethodFlow> flow = analyze(found.type, found.method);
    running.remove(key);
    analyzed.put(key, flow);
    return flow;
  }

  Set<String> returnsOf(String owner, String name, String desc) {
    Optional<JavaClass> current = Optional.ofNullable(classes.get(owner));
    while (current.isPresent()) {
      String key = Summaries.internal(current.get()) + "." + name + desc;
      if (declared.containsKey(key)) {
        return of(key).map(flow -> flow.returns).orElse(Set.of());
      }
      current = current.get().getRawSuperclass().filter(type -> classes.containsKey(Summaries.internal(type)));
    }
    return Set.of();
  }

  private Optional<MethodFlow> analyze(JavaClass type, MethodNode method) {
    if ((method.access & (Opcodes.ACC_ABSTRACT | Opcodes.ACC_NATIVE)) != 0) {
      return Optional.empty();
    }
    boolean instance = (method.access & Opcodes.ACC_STATIC) == 0;
    MethodFlow flow = new MethodFlow(Summaries.internal(type), method.name, method.desc, instance, names(method));
    try {
      new Analyzer<>(new FlowInterpreter(method, flow, library, this)).analyze(flow.owner, method);
      return Optional.of(flow);
    } catch (AnalyzerException | RuntimeException unreadable) {
      return Optional.empty();
    }
  }

  boolean isProjectClass(String internalName) {
    return classes.containsKey(internalName);
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
