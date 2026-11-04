package nitpicker.designfacts.facts;

import com.sun.source.tree.*;
import com.sun.source.util.TreeScanner;
import java.util.*;
import nitpicker.designfacts.*;
import nitpicker.designfacts.model.*;
import nitpicker.designfacts.resolve.*;

public final class Mutability {
  public static final Set<String> CREATED =
      Set.of(
          "ArrayList",
          "LinkedList",
          "HashMap",
          "LinkedHashMap",
          "TreeMap",
          "HashSet",
          "LinkedHashSet",
          "TreeSet",
          "ArrayDeque",
          "PriorityQueue",
          "Stack",
          "Vector",
          "Hashtable",
          "IdentityHashMap",
          "WeakHashMap",
          "EnumMap",
          "ConcurrentHashMap",
          "ConcurrentLinkedQueue",
          "ConcurrentLinkedDeque",
          "CopyOnWriteArrayList",
          "CopyOnWriteArraySet",
          "ConcurrentSkipListMap",
          "ConcurrentSkipListSet",
          "LinkedBlockingQueue",
          "ArrayBlockingQueue",
          "LinkedBlockingDeque",
          "StringBuilder",
          "StringBuffer",
          "BitSet",
          "Properties");
  public static final Set<String> RECEIVERS = new HashSet<>(CREATED);

  static {
    RECEIVERS.addAll(
        List.of(
            "List",
            "Map",
            "Set",
            "Collection",
            "Deque",
            "Queue",
            "SortedMap",
            "SortedSet",
            "NavigableMap",
            "NavigableSet",
            "BlockingQueue",
            "BlockingDeque",
            "ConcurrentMap"));
  }

  private final Typer typer;

  public Mutability(Typer typer) {
    this.typer = typer;
  }

  public boolean isMutable(TypeInfo type, FieldInfo field) {
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
    new Assignments(field, assigned).scan(top.tree, null);
    return !assigned.isEmpty() && assigned.stream().allMatch(value -> fresh(value, type));
  }

  private boolean fresh(Tree value, TypeInfo type) {
    Tree expression = Names.unparen(value);
    if (expression instanceof NewArrayTree) {
      return true;
    }
    if (expression instanceof NewClassTree creation && creation.getClassBody() == null) {
      String name = Names.typeText(creation.getIdentifier());
      Project.Site site = new Project.Site(type, type.unit, Set.of());
      TypeInfo project = typer.project.resolveTree(creation.getIdentifier(), site);
      String simple = name == null ? null : name.substring(name.lastIndexOf('.') + 1);
      return project == null && simple != null && CREATED.contains(simple);
    }
    return false;
  }

  private static final class Assignments extends TreeScanner<Void, Void> {
    private final String name;
    private final ClassTree owner;
    private final List<Tree> assigned;
    private final Deque<ClassTree> classes = new ArrayDeque<>();
    private final Deque<Boolean> shadowed = new ArrayDeque<>(List.of(false));

    private Assignments(FieldInfo field, List<Tree> assigned) {
      this.name = field.name;
      this.owner = field.owner.tree;
      this.assigned = assigned;
    }

    @Override
    public Void visitClass(ClassTree tree, Void unused) {
      boolean hides = tree != owner && declaresField(tree);
      classes.push(tree);
      shadowed.push(tree != owner && (hides || shadowed.peek()));
      super.visitClass(tree, unused);
      shadowed.pop();
      classes.pop();
      return null;
    }

    private boolean declaresField(ClassTree tree) {
      return tree.getMembers().stream()
          .anyMatch(member -> member instanceof VariableTree variable && declares(variable));
    }

    private boolean declares(VariableTree variable) {
      return variable.getName().contentEquals(name);
    }

    @Override
    public Void visitMethod(MethodTree tree, Void unused) {
      shadowed.push(shadowed.peek() || declaresLocal(tree));
      super.visitMethod(tree, unused);
      shadowed.pop();
      return null;
    }

    private boolean declaresLocal(Tree tree) {
      boolean[] found = {false};
      new TreeScanner<Void, Void>() {
        @Override
        public Void visitVariable(VariableTree variable, Void unused) {
          found[0] |= declares(variable);
          return super.visitVariable(variable, unused);
        }

        @Override
        public Void visitClass(ClassTree nested, Void unused) {
          return null;
        }
      }.scan(tree, null);
      return found[0];
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
      return switch (Names.unparen(variable)) {
        case IdentifierTree identifier ->
            identifier.getName().contentEquals(name) && !shadowed.peek();
        case MemberSelectTree select ->
            select.getIdentifier().contentEquals(name)
                && Names.isThis(Names.unparen(select.getExpression()))
                && classes.peek() == owner;
        default -> false;
      };
    }
  }
}
