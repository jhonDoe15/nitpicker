package nitpicker.effects.classes;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.objectweb.asm.AnnotationVisitor;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.AnnotationNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodNode;

public final class ClassIndex {
  public record Header(String name, String superName, List<String> interfaces, int access, Set<String> annotations) {
    public boolean isInterface() {
      return (access & Opcodes.ACC_INTERFACE) != 0;
    }
  }

  private static final Header MISSING = new Header("", null, List.of(), 0, Set.of());
  private final Map<String, ClassNode> project = new TreeMap<>();
  private final Map<String, Header> headers = new HashMap<>();
  private final Map<String, Set<String>> ancestors = new HashMap<>();
  private final ClassPath classPath;

  public ClassIndex(ClassPath classPath) {
    this.classPath = classPath;
  }

  public void addProject(ClassNode node) {
    project.put(node.name, node);
    headers.put(node.name, headerOf(node));
  }

  public Collection<ClassNode> projectClasses() {
    return project.values();
  }

  public ClassNode node(String name) {
    return name == null ? null : project.get(name);
  }

  public boolean isProject(String name) {
    return project.containsKey(name);
  }

  public Header header(String name) {
    if (name == null) {
      return MISSING;
    }
    return headers.computeIfAbsent(name, this::readHeader);
  }

  public boolean isSubtype(String type, String target) {
    return type != null && (type.equals(target) || ancestors(type).contains(target));
  }

  public boolean isSubtypeOfAny(String type, Collection<String> targets) {
    for (String target : targets) {
      if (isSubtype(type, target)) {
        return true;
      }
    }
    return false;
  }

  public Set<String> ancestors(String type) {
    Set<String> known = ancestors.get(type);
    if (known != null) {
      return known;
    }
    Set<String> found = new LinkedHashSet<>();
    Deque<String> queue = new ArrayDeque<>(List.of(type));
    while (!queue.isEmpty() && found.size() < 400) {
      Header header = header(queue.poll());
      for (String parent : parents(header)) {
        if (found.add(parent)) {
          queue.add(parent);
        }
      }
    }
    ancestors.put(type, found);
    return found;
  }

  public boolean annotated(String type, String annotation) {
    return header(type).annotations().contains(annotation);
  }

  public List<ClassNode> implementations(String type) {
    List<ClassNode> found = new ArrayList<>();
    for (ClassNode node : project.values()) {
      boolean concrete = (node.access & (Opcodes.ACC_INTERFACE | Opcodes.ACC_ABSTRACT)) == 0;
      if (concrete && !node.name.equals(type) && isSubtype(node.name, type)) {
        found.add(node);
      }
    }
    return found;
  }

  public MethodNode declared(String owner, String name, String desc) {
    ClassNode node = project.get(owner);
    if (node == null) {
      return null;
    }
    for (MethodNode method : node.methods) {
      if (method.name.equals(name) && method.desc.equals(desc)) {
        return method;
      }
    }
    return null;
  }

  private static List<String> parents(Header header) {
    List<String> parents = new ArrayList<>(header.interfaces());
    if (header.superName() != null) {
      parents.add(0, header.superName());
    }
    return parents;
  }

  private static Header headerOf(ClassNode node) {
    Set<String> annotations = new LinkedHashSet<>();
    for (List<AnnotationNode> list : Annotations.lists(node.visibleAnnotations, node.invisibleAnnotations)) {
      for (AnnotationNode annotation : list) {
        annotations.add(annotation.desc);
      }
    }
    return new Header(node.name, node.superName, List.copyOf(node.interfaces), node.access, annotations);
  }

  private Header readHeader(String name) {
    byte[] bytes = classPath.read(name);
    if (bytes == null) {
      return MISSING;
    }
    try {
      HeaderReader reader = new HeaderReader();
      new ClassReader(bytes).accept(reader, ClassReader.SKIP_CODE | ClassReader.SKIP_DEBUG | ClassReader.SKIP_FRAMES);
      return reader.header;
    } catch (RuntimeException unreadable) {
      return MISSING;
    }
  }

  private static final class HeaderReader extends ClassVisitor {
    private Header header = MISSING;
    private final Set<String> annotations = new LinkedHashSet<>();

    HeaderReader() {
      super(Opcodes.ASM9);
    }

    @Override
    public void visit(int version, int access, String name, String signature, String superName, String[] interfaces) {
      header = new Header(name, superName, interfaces == null ? List.of() : List.of(interfaces), access, annotations);
    }

    @Override
    public AnnotationVisitor visitAnnotation(String descriptor, boolean visible) {
      annotations.add(descriptor);
      return null;
    }
  }
}
