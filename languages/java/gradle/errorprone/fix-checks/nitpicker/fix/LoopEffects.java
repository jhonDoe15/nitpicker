package nitpicker.fix;

import com.google.errorprone.VisitorState;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.BreakTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.ContinueTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.LambdaExpressionTree;
import com.sun.source.tree.MemberReferenceTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.NewClassTree;
import com.sun.source.tree.ReturnTree;
import com.sun.source.tree.ThrowTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.VariableTree;
import com.sun.source.util.TreeScanner;
import com.sun.tools.javac.code.Flags;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Symbol.MethodSymbol;
import com.sun.tools.javac.code.Type;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;
import java.util.regex.Pattern;

final class LoopEffects {
  private static final List<String> DATA = List.of(
      LoopWrite.REPOSITORY, "jakarta.persistence.EntityManager", "javax.persistence.EntityManager",
      "org.hibernate.Session", "org.springframework.jdbc.core.JdbcOperations",
      "org.springframework.jdbc.core.namedparam.NamedParameterJdbcOperations",
      "org.springframework.jdbc.core.simple.JdbcClient", "java.sql.Connection", "java.sql.Statement",
      "javax.sql.DataSource");
  private static final List<String> BEANS = List.of(
      "org.springframework.stereotype.Service", "org.springframework.stereotype.Component",
      "org.springframework.stereotype.Repository", "org.springframework.stereotype.Controller",
      "org.springframework.transaction.annotation.Transactional", "jakarta.transaction.Transactional");
  private static final Pattern BEAN_NAME =
      Pattern.compile(".*(Service|Repository|Dao|DAO|Gateway|Client|Wrapper|Manager|Template|Helper)$");
  private static final Set<String> STREAM_STEPS =
      Set.of("filter", "map", "flatMap", "peek", "sorted", "distinct", "limit", "skip", "sequential");
  private static final Set<String> STREAM_SOURCES = Set.of("java.util.Arrays.stream", "java.util.stream.Stream.of");

  private static final Map<Tree, Set<String>> NAMES = new WeakHashMap<>();
  private static final Map<Tree, Set<String>> CHOSEN = new WeakHashMap<>();

  private LoopEffects() {}

  static boolean effectivelyFinal(Symbol symbol) {
    return (symbol.flags() & (Flags.FINAL | Flags.EFFECTIVELY_FINAL)) != 0;
  }

  static boolean callsAnything(Tree tree) {
    boolean[] found = {false};
    if (tree != null) {
      new TreeScanner<Void, Void>() {
        @Override
        public Void visitMethodInvocation(MethodInvocationTree node, Void unused) {
          found[0] = true;
          return null;
        }

        @Override
        public Void visitNewClass(NewClassTree node, Void unused) {
          found[0] = true;
          return null;
        }
      }.scan(tree, null);
    }
    return found[0];
  }

  static boolean iterates(ExpressionTree receiver, VisitorState state) {
    if (isA(ASTHelpers.getType(receiver), "java.lang.Iterable", state)) {
      return true;
    }
    ExpressionTree current = receiver;
    while (current instanceof MethodInvocationTree call && call.getMethodSelect() instanceof MemberSelectTree select
        && STREAM_STEPS.contains(select.getIdentifier().toString())) {
      current = select.getExpression();
    }
    if (!(current instanceof MethodInvocationTree source)) {
      return false;
    }
    MethodSymbol method = ASTHelpers.getSymbol(source);
    String name = method == null ? "" : method.owner.getQualifiedName() + "." + method.getSimpleName();
    boolean collection = source.getMethodSelect() instanceof MemberSelectTree select
        && select.getIdentifier().contentEquals("stream") && source.getArguments().isEmpty()
        && isA(ASTHelpers.getType(select.getExpression()), "java.util.Collection", state);
    return collection || STREAM_SOURCES.contains(name);
  }

  static List<Tree> perElement(ExpressionTree iterated) {
    List<Tree> trees = new java.util.ArrayList<>();
    ExpressionTree current = iterated;
    while (current instanceof MethodInvocationTree call && call.getMethodSelect() instanceof MemberSelectTree select
        && STREAM_STEPS.contains(select.getIdentifier().toString())) {
      trees.addAll(call.getArguments());
      current = select.getExpression();
    }
    return trees;
  }

  static boolean blocked(List<? extends Tree> trees, Tree write, boolean lambdaLoop, VisitorState state) {
    boolean[] blocked = {false};
    TreeScanner<Void, Integer> scanner = new TreeScanner<>() {
      @Override
      public Void visitClass(ClassTree node, Integer depth) {
        return null;
      }

      @Override
      public Void visitLambdaExpression(LambdaExpressionTree node, Integer depth) {
        return super.visitLambdaExpression(node, depth + 1);
      }

      @Override
      public Void visitMethodInvocation(MethodInvocationTree node, Integer depth) {
        blocked[0] |= node != write && effectful(node, state);
        return super.visitMethodInvocation(node, depth);
      }

      @Override
      public Void visitMemberReference(MemberReferenceTree node, Integer depth) {
        blocked[0] |= node != write && effectfulReceiver(node.getQualifierExpression(), state);
        return super.visitMemberReference(node, depth);
      }

      @Override
      public Void visitReturn(ReturnTree node, Integer depth) {
        blocked[0] |= depth == 0 && !lambdaLoop;
        return super.visitReturn(node, depth);
      }

      @Override
      public Void visitThrow(ThrowTree node, Integer depth) {
        blocked[0] |= depth == 0;
        return super.visitThrow(node, depth);
      }

      @Override
      public Void visitBreak(BreakTree node, Integer depth) {
        blocked[0] |= node.getLabel() != null;
        return null;
      }

      @Override
      public Void visitContinue(ContinueTree node, Integer depth) {
        blocked[0] |= node.getLabel() != null;
        return null;
      }
    };
    for (Tree tree : trees) {
      scanner.scan(tree, 0);
    }
    return blocked[0];
  }

  static synchronized String freshName(String base, VisitorState state) {
    Set<String> written = NAMES.computeIfAbsent(state.getPath().getCompilationUnit(), unit -> namesIn(unit));
    Tree method = ASTHelpers.findEnclosingNode(state.getPath(), com.sun.source.tree.MethodTree.class);
    Set<String> chosen = CHOSEN.computeIfAbsent(method == null ? state.getPath().getCompilationUnit() : method,
        scope -> new HashSet<>());
    String name = base;
    for (int index = 2; written.contains(name) || chosen.contains(name); index++) {
      name = base + index;
    }
    chosen.add(name);
    return name;
  }

  private static Set<String> namesIn(Tree unit) {
    Set<String> names = new HashSet<>();
    new TreeScanner<Void, Void>() {
      @Override
      public Void visitVariable(VariableTree node, Void unused) {
        names.add(node.getName().toString());
        return super.visitVariable(node, unused);
      }

      @Override
      public Void visitIdentifier(IdentifierTree node, Void unused) {
        names.add(node.getName().toString());
        return null;
      }
    }.scan(unit, null);
    return names;
  }

  private static boolean effectful(MethodInvocationTree call, VisitorState state) {
    MethodSymbol method = ASTHelpers.getSymbol(call);
    if (method == null) {
      return true;
    }
    if (!(call.getMethodSelect() instanceof MemberSelectTree select)) {
      return !method.isStatic();
    }
    ExpressionTree receiver = select.getExpression();
    boolean self = receiver instanceof IdentifierTree name
        && (name.getName().contentEquals("this") || name.getName().contentEquals("super"));
    return self || !method.isStatic() && effectfulReceiver(receiver, state);
  }

  private static boolean effectfulReceiver(ExpressionTree receiver, VisitorState state) {
    Type type = ASTHelpers.getType(receiver);
    if (type == null || type.tsym == null) {
      return false;
    }
    for (String data : DATA) {
      if (isA(type, data, state)) {
        return true;
      }
    }
    for (String bean : BEANS) {
      if (ASTHelpers.hasAnnotation(type.tsym, bean, state)) {
        return true;
      }
    }
    Symbol symbol = ASTHelpers.getSymbol(receiver);
    boolean field = symbol != null && symbol.getKind() == javax.lang.model.element.ElementKind.FIELD;
    return field && BEAN_NAME.matcher(type.tsym.getSimpleName().toString()).matches();
  }

  private static boolean isA(Type type, String name, VisitorState state) {
    Type wanted = state.getTypeFromString(name);
    return type != null && wanted != null
        && ASTHelpers.isSubtype(state.getTypes().erasure(type), state.getTypes().erasure(wanted), state);
  }
}
