package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.ClassTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.AnnotationTree;
import com.sun.source.tree.AssignmentTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompoundAssignmentTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.UnaryTree;
import com.sun.source.tree.VariableTree;
import com.sun.source.util.TreeScanner;
import com.sun.tools.javac.code.Symbol;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import javax.lang.model.element.Modifier;

@BugPattern(
    summary = "Injects through the constructor into final fields, not through annotated fields.",
    severity = WARNING)
public final class SpringConstructorInjection extends BugChecker implements ClassTreeMatcher {
  private static final String[] INJECT = {
    "org.springframework.beans.factory.annotation.Autowired", "jakarta.inject.Inject", "javax.inject.Inject"
  };
  private static final String VALUE = "org.springframework.beans.factory.annotation.Value";
  private static final String[] MOVED = {
    "org.springframework.beans.factory.annotation.Qualifier", "jakarta.inject.Named", "javax.inject.Named", VALUE
  };
  private static final Set<String> LOMBOK =
      Set.of("RequiredArgsConstructor", "AllArgsConstructor", "NoArgsConstructor", "Data", "Value");

  @Override
  public Description matchClass(ClassTree tree, VisitorState state) {
    if (tree.getKind() != Tree.Kind.CLASS || hasLombokConstructor(tree)) {
      return Description.NO_MATCH;
    }
    List<MethodTree> constructors = constructors(tree);
    if (constructors.size() == 1) {
      return soleConstructor(constructors.get(0), state);
    }
    return constructors.isEmpty() ? fieldInjection(tree, state) : Description.NO_MATCH;
  }

  private Description soleConstructor(MethodTree constructor, VisitorState state) {
    for (AnnotationTree annotation : constructor.getModifiers().getAnnotations()) {
      if (Support.isAnnotation(annotation, INJECT) && annotation.getArguments().isEmpty()) {
        int[] range = Support.removalRange(annotation, state);
        SuggestedFix.Builder fix = SuggestedFix.builder().replace(range[0], range[1], "");
        Support.dropImportIfUnused(fix, state, Support.simpleName(annotation), unitRemovals(state));
        return describeMatch(annotation, fix.build());
      }
    }
    return Description.NO_MATCH;
  }

  private Description fieldInjection(ClassTree tree, VisitorState state) {
    Set<Symbol> assigned = assignedFields(tree);
    List<VariableTree> fields = new ArrayList<>();
    VariableTree lastField = null;
    for (Tree member : tree.getMembers()) {
      if (member instanceof VariableTree field) {
        lastField = field;
        if (injectable(field, assigned, state)) {
          fields.add(field);
        }
      }
    }
    if (fields.isEmpty() || hasSharedDeclaration(tree, fields, state)) {
      return Description.NO_MATCH;
    }
    SuggestedFix.Builder fix = SuggestedFix.builder();
    List<int[]> removed = unitRemovals(state);
    Set<String> dropped = new HashSet<>();
    StringBuilder parameters = new StringBuilder();
    StringBuilder body = new StringBuilder();
    String indent = Support.indentAt(Support.start(fields.get(0)), state);
    for (VariableTree field : fields) {
      StringBuilder moved = new StringBuilder();
      for (AnnotationTree annotation : field.getModifiers().getAnnotations()) {
        int[] range = Support.removalRange(annotation, state);
        fix.replace(range[0], range[1], "");
        if (Support.isAnnotation(annotation, MOVED)) {
          moved.append(Support.source(annotation, state)).append(' ');
        } else {
          dropped.add(Support.simpleName(annotation));
        }
      }
      fix.prefixWith(field.getType(), "final ");
      String name = field.getName().toString();
      parameters.append(parameters.length() == 0 ? "" : ", ")
          .append(moved).append(Support.source(field.getType(), state)).append(' ').append(name);
      body.append('\n').append(indent).append(indent).append("this.").append(name).append(" = ").append(name).append(';');
    }
    for (String name : dropped) {
      Support.dropImportIfUnused(fix, state, name, removed);
    }
    String access = tree.getModifiers().getFlags().contains(Modifier.PUBLIC) ? "public " : "";
    fix.postfixWith(lastField, "\n\n" + indent + access + tree.getSimpleName() + "(" + parameters + ") {" + body
        + "\n" + indent + "}");
    return describeMatch(fields.get(0), fix.build());
  }

  private static List<int[]> unitRemovals(VisitorState state) {
    List<int[]> removed = new ArrayList<>();
    for (ClassTree tree : Support.classes(state)) {
      if (tree.getKind() != Tree.Kind.CLASS || hasLombokConstructor(tree)) {
        continue;
      }
      List<MethodTree> constructors = constructors(tree);
      if (constructors.size() == 1) {
        for (AnnotationTree annotation : constructors.get(0).getModifiers().getAnnotations()) {
          if (Support.isAnnotation(annotation, INJECT) && annotation.getArguments().isEmpty()) {
            removed.add(Support.removalRange(annotation, state));
          }
        }
      } else if (constructors.isEmpty()) {
        Set<Symbol> assigned = assignedFields(tree);
        for (Tree member : tree.getMembers()) {
          if (member instanceof VariableTree field && injectable(field, assigned, state)) {
            for (AnnotationTree annotation : field.getModifiers().getAnnotations()) {
              removed.add(Support.removalRange(annotation, state));
            }
          }
        }
      }
    }
    return removed;
  }

  private static List<MethodTree> constructors(ClassTree tree) {
    List<MethodTree> constructors = new ArrayList<>();
    for (Tree member : tree.getMembers()) {
      if (member instanceof MethodTree method && ASTHelpers.getSymbol(method).isConstructor()
          && !ASTHelpers.isGeneratedConstructor(method)) {
        constructors.add(method);
      }
    }
    return constructors;
  }

  private static boolean hasLombokConstructor(ClassTree tree) {
    for (AnnotationTree annotation : tree.getModifiers().getAnnotations()) {
      if (LOMBOK.contains(Support.simpleName(annotation))) {
        return true;
      }
    }
    return false;
  }

  private static boolean injectable(VariableTree field, Set<Symbol> assigned, VisitorState state) {
    Set<Modifier> flags = field.getModifiers().getFlags();
    if (flags.contains(Modifier.STATIC) || flags.contains(Modifier.FINAL) || field.getInitializer() != null
        || assigned.contains(ASTHelpers.getSymbol(field))) {
      return false;
    }
    boolean marked = false;
    for (AnnotationTree annotation : field.getModifiers().getAnnotations()) {
      if (Support.isAnnotation(annotation, INJECT) && annotation.getArguments().isEmpty()) {
        marked = true;
      } else if (Support.isAnnotation(annotation, VALUE)) {
        marked = true;
      } else if (!Support.isAnnotation(annotation, MOVED)) {
        return false;
      }
    }
    return marked;
  }

  private static boolean hasSharedDeclaration(ClassTree tree, List<VariableTree> fields, VisitorState state) {
    for (VariableTree field : fields) {
      for (Tree member : tree.getMembers()) {
        if (member instanceof VariableTree other && other != field
            && Support.start(other) == Support.start(field)) {
          return true;
        }
      }
    }
    return false;
  }

  private static Set<Symbol> assignedFields(ClassTree tree) {
    Set<Symbol> assigned = new HashSet<>();
    new TreeScanner<Void, Void>() {
      @Override
      public Void visitAssignment(AssignmentTree node, Void unused) {
        assigned.add(ASTHelpers.getSymbol(node.getVariable()));
        return super.visitAssignment(node, unused);
      }

      @Override
      public Void visitCompoundAssignment(CompoundAssignmentTree node, Void unused) {
        assigned.add(ASTHelpers.getSymbol(node.getVariable()));
        return super.visitCompoundAssignment(node, unused);
      }

      @Override
      public Void visitUnary(UnaryTree node, Void unused) {
        assigned.add(ASTHelpers.getSymbol(node.getExpression()));
        return super.visitUnary(node, unused);
      }
    }.scan(tree, null);
    return assigned;
  }
}
