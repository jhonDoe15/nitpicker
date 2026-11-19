package nitpicker.fix;

import com.google.errorprone.VisitorState;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.BlockTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.NewClassTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.VariableTree;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreePathScanner;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.lang.model.element.ElementKind;

/** The mappers and Gson instances a class builds on each call and only uses to read and write values. */
final class ReusableObjects {
  static final class Found {
    final Type type;
    final String creation;
    final String baseName;
    final List<Tree> uses = new ArrayList<>();
    final List<Tree> removed = new ArrayList<>();

    Found(Type type, String creation, String baseName) {
      this.type = type;
      this.creation = creation;
      this.baseName = baseName;
    }
  }

  private static final Map<String, String> NAMES =
      Map.of(
          "com.fasterxml.jackson.databind.ObjectMapper", "OBJECT_MAPPER",
          "com.fasterxml.jackson.databind.json.JsonMapper", "JSON_MAPPER",
          "com.google.gson.Gson", "GSON");
  private static final Set<String> JACKSON_CALLS =
      Set.of(
          "readValue", "readTree", "writeValueAsString", "writeValueAsBytes", "writeValue", "valueToTree",
          "convertValue", "treeToValue", "reader", "readerFor", "writer", "writerFor",
          "writerWithDefaultPrettyPrinter");
  private static final Set<String> GSON_CALLS = Set.of("toJson", "fromJson", "toJsonTree");
  private static final Set<String> SETUP_ANNOTATIONS =
      Set.of(
          "org.springframework.context.annotation.Bean",
          "jakarta.annotation.PostConstruct",
          "javax.annotation.PostConstruct",
          "jakarta.enterprise.inject.Produces",
          "javax.enterprise.inject.Produces");
  private static final Set<String> SETUP_METHODS = Set.of("main", "afterPropertiesSet", "start");

  private ReusableObjects() {}

  static List<Found> find(ClassTree top, VisitorState state) {
    List<Found> found = new ArrayList<>();
    new TreePathScanner<Void, Void>() {
      @Override
      public Void visitVariable(VariableTree node, Void unused) {
        Found local = local(getCurrentPath(), state);
        if (local != null) {
          add(found, local);
        }
        return super.visitVariable(node, unused);
      }

      @Override
      public Void visitNewClass(NewClassTree node, Void unused) {
        inline(getCurrentPath(), state, found);
        return super.visitNewClass(node, unused);
      }

      @Override
      public Void visitMethodInvocation(MethodInvocationTree node, Void unused) {
        inline(getCurrentPath(), state, found);
        return super.visitMethodInvocation(node, unused);
      }
    }.scan(state.getPath(), null);
    return found;
  }

  private static void add(List<Found> found, Found next) {
    for (Found known : found) {
      if (known.baseName.equals(next.baseName) && known.creation.equals(next.creation)) {
        known.uses.addAll(next.uses);
        known.removed.addAll(next.removed);
        return;
      }
    }
    found.add(next);
  }

  private static void inline(TreePath path, VisitorState state, List<Found> found) {
    Found created = created(path, state);
    if (created == null || !(path.getParentPath().getLeaf() instanceof MemberSelectTree select)) {
      return;
    }
    TreePath callPath = path.getParentPath().getParentPath();
    if (select.getExpression() == path.getLeaf()
        && callPath.getLeaf() instanceof MethodInvocationTree call
        && call.getMethodSelect() == select
        && allowedCall(select, created.baseName)
        && context(path)) {
      created.uses.add(path.getLeaf());
      add(found, created);
    }
  }

  private static Found created(TreePath path, VisitorState state) {
    Tree tree = path.getLeaf();
    ExpressionTree expression;
    if (tree instanceof NewClassTree creation) {
      if (!creation.getArguments().isEmpty() || creation.getClassBody() != null || creation.getEnclosingExpression() != null) {
        return null;
      }
      expression = creation;
    } else if (tree instanceof MethodInvocationTree build && isBuilderBuild(build)) {
      expression = build;
    } else {
      return null;
    }
    Type type = ASTHelpers.getType(expression);
    String name = type == null || type.tsym == null ? null : NAMES.get(type.tsym.getQualifiedName().toString());
    if (name == null || tree instanceof NewClassTree && !exact(type, ASTHelpers.getType(((NewClassTree) tree).getIdentifier()))) {
      return null;
    }
    return new Found(type, Support.source(expression, state), name);
  }

  private static boolean exact(Type created, Type written) {
    return written != null && created.tsym == written.tsym;
  }

  private static boolean isBuilderBuild(MethodInvocationTree build) {
    if (!build.getArguments().isEmpty()
        || !(build.getMethodSelect() instanceof MemberSelectTree select)
        || !select.getIdentifier().contentEquals("build")
        || !(select.getExpression() instanceof MethodInvocationTree builder)
        || !builder.getArguments().isEmpty()
        || !(builder.getMethodSelect() instanceof MemberSelectTree builderSelect)
        || !builderSelect.getIdentifier().contentEquals("builder")) {
      return false;
    }
    Symbol method = ASTHelpers.getSymbol(builder);
    return method != null
        && method.isStatic()
        && method.owner.getQualifiedName().contentEquals("com.fasterxml.jackson.databind.json.JsonMapper");
  }

  private static boolean allowedCall(MemberSelectTree select, String baseName) {
    String method = select.getIdentifier().toString();
    return baseName.equals("GSON") ? GSON_CALLS.contains(method) : JACKSON_CALLS.contains(method);
  }

  private static Found local(TreePath path, VisitorState state) {
    VariableTree variable = (VariableTree) path.getLeaf();
    if (variable.getInitializer() == null || !(path.getParentPath().getLeaf() instanceof BlockTree block)) {
      return null;
    }
    Symbol symbol = ASTHelpers.getSymbol(variable);
    TreePath initializer = new TreePath(path, variable.getInitializer());
    Found created = created(initializer, state);
    if (symbol == null
        || created == null
        || !context(path)
        || symbol.type.tsym != created.type.tsym
        || variable.getModifiers().getAnnotations().size() > 0
        || sharesDeclaration(variable, block)) {
      return null;
    }
    List<Tree> uses = new ArrayList<>();
    boolean[] ok = {true};
    new TreePathScanner<Void, Void>() {
      @Override
      public Void visitIdentifier(IdentifierTree node, Void unused) {
        if (ASTHelpers.getSymbol(node) == symbol) {
          TreePath parent = getCurrentPath().getParentPath();
          boolean call = parent.getLeaf() instanceof MemberSelectTree select
              && select.getExpression() == node
              && parent.getParentPath().getLeaf() instanceof MethodInvocationTree invocation
              && invocation.getMethodSelect() == select
              && allowedCall(select, created.baseName);
          ok[0] &= call;
          uses.add(node);
        }
        return null;
      }
    }.scan(new TreePath(path.getParentPath(), block), null);
    if (!ok[0] || uses.isEmpty()) {
      return null;
    }
    created.uses.addAll(uses);
    created.removed.add(variable);
    return created;
  }

  private static boolean sharesDeclaration(VariableTree variable, BlockTree block) {
    return block.getStatements().stream().anyMatch(other -> other != variable
        && other instanceof VariableTree sibling
        && Support.start(sibling) == Support.start(variable));
  }

  private static boolean context(TreePath path) {
    MethodTree method = null;
    for (TreePath current = path; current != null; current = current.getParentPath()) {
      Tree leaf = current.getLeaf();
      if (leaf instanceof MethodTree found && method == null) {
        method = found;
        if (found.getReturnType() == null || isSetup(found)) {
          return false;
        }
      }
      if (leaf instanceof ClassTree) {
        Symbol symbol = ASTHelpers.getSymbol((ClassTree) leaf);
        Tree parent = current.getParentPath().getLeaf();
        boolean member = parent instanceof ClassTree || parent instanceof CompilationUnitTree;
        boolean plain = symbol != null && (symbol.getKind() == ElementKind.CLASS || symbol.getKind() == ElementKind.RECORD);
        if (!member || !plain || method == null) {
          return false;
        }
      }
    }
    return method != null;
  }

  private static boolean isSetup(MethodTree method) {
    if (SETUP_METHODS.contains(method.getName().toString())) {
      return true;
    }
    return method.getModifiers().getAnnotations().stream()
        .anyMatch(annotation -> Support.isAnnotation(annotation, SETUP_ANNOTATIONS.toArray(new String[0])));
  }
}
