package nitpicker.designfacts;

import com.sun.source.tree.*;
import com.sun.source.util.TreeScanner;
import java.util.*;

final class Mutability {
  static final Set<String> CREATED =
      Set.of(
          "ArrayList", "LinkedList", "HashMap", "LinkedHashMap", "TreeMap", "HashSet",
          "LinkedHashSet", "TreeSet", "ArrayDeque", "PriorityQueue", "Stack", "Vector",
          "Hashtable", "IdentityHashMap", "WeakHashMap", "EnumMap", "ConcurrentHashMap",
          "ConcurrentLinkedQueue", "ConcurrentLinkedDeque", "CopyOnWriteArrayList",
          "CopyOnWriteArraySet", "ConcurrentSkipListMap", "ConcurrentSkipListSet",
          "LinkedBlockingQueue", "ArrayBlockingQueue", "LinkedBlockingDeque", "StringBuilder",
          "StringBuffer", "BitSet", "Properties");
  static final Set<String> RECEIVERS = new HashSet<>(CREATED);

  static {
    RECEIVERS.addAll(
        List.of(
            "List", "Map", "Set", "Collection", "Deque", "Queue", "SortedMap", "SortedSet",
            "NavigableMap", "NavigableSet", "BlockingQueue", "BlockingDeque", "ConcurrentMap"));
  }

  private final Typer typer;

  Mutability(Typer typer) {
    this.typer = typer;
  }

  boolean isMutable(TypeInfo type, FieldInfo field) {
    boolean settable =
        type.lombokReplaceable
            || Names.hasAnnotation(field.tree.getModifiers(), "Setter")
            || Names.hasAnnotation(field.tree.getModifiers(), "With");
    if (!(field.isPrivate() || field.isFinal()) || (!field.isFinal() && settable)) {
      return false;
    }
    List<Tree> assigned = new ArrayList<>();
    if (field.tree.getInitializer() != null) {
      assigned.add(field.tree.getInitializer());
    }
    TypeInfo top = type;
    while (top.outer != null) {
      top = top.outer;
    }
    new Assignments(field.name, assigned).scan(top.tree, null);
    return !assigned.isEmpty() && assigned.stream().allMatch(value -> fresh(value, type));
  }

  private boolean fresh(Tree value, TypeInfo type) {
    Tree expression = Names.unparen(value);
    if (expression instanceof NewArrayTree) {
      return true;
    }
    if (expression instanceof NewClassTree creation && creation.getClassBody() == null) {
      String name = Names.typeText(creation.getIdentifier());
      TypeInfo project = typer.project.resolveTree(creation.getIdentifier(), type, type.unit, Set.of());
      return project == null && name != null && CREATED.contains(name.substring(name.lastIndexOf('.') + 1));
    }
    return false;
  }

  private static final class Assignments extends TreeScanner<Void, Void> {
    private final String name;
    private final List<Tree> assigned;

    Assignments(String name, List<Tree> assigned) {
      this.name = name;
      this.assigned = assigned;
    }

    @Override
    public Void visitAssignment(AssignmentTree tree, Void unused) {
      if (names(tree.getVariable())) {
        assigned.add(tree.getExpression());
      }
      return super.visitAssignment(tree, unused);
    }

    @Override
    public Void visitCompoundAssignment(CompoundAssignmentTree tree, Void unused) {
      if (names(tree.getVariable())) {
        assigned.add(tree);
      }
      return super.visitCompoundAssignment(tree, unused);
    }

    private boolean names(Tree variable) {
      return switch (variable) {
        case IdentifierTree identifier -> identifier.getName().contentEquals(name);
        case MemberSelectTree select ->
            select.getIdentifier().contentEquals(name)
                && select.getExpression() instanceof IdentifierTree base
                && base.getName().contentEquals("this");
        default -> false;
      };
    }
  }
}
