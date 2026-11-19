package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.DoWhileLoopTreeMatcher;
import com.google.errorprone.bugpatterns.BugChecker.EnhancedForLoopTreeMatcher;
import com.google.errorprone.bugpatterns.BugChecker.ForLoopTreeMatcher;
import com.google.errorprone.bugpatterns.BugChecker.WhileLoopTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.fixes.SuggestedFixes;
import com.google.errorprone.matchers.Description;
import com.sun.source.tree.BlockTree;
import com.sun.source.tree.DoWhileLoopTree;
import com.sun.source.tree.EnhancedForLoopTree;
import com.sun.source.tree.ForLoopTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.StatementTree;
import com.sun.source.tree.WhileLoopTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.LambdaExpressionTree;
import com.sun.source.util.TreeScanner;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@BugPattern(
    summary =
        "Builds a Map or Set of the keys once before the loop instead of scanning the collection on every pass.",
    severity = WARNING)
public final class LinearLookupInLoop extends BugChecker
    implements ForLoopTreeMatcher,
        EnhancedForLoopTreeMatcher,
        WhileLoopTreeMatcher,
        DoWhileLoopTreeMatcher {

  @Override
  public Description matchForLoop(ForLoopTree tree, VisitorState state) {
    return check(tree, tree.getStatement(), state);
  }

  @Override
  public Description matchEnhancedForLoop(EnhancedForLoopTree tree, VisitorState state) {
    return check(tree, tree.getStatement(), state);
  }

  @Override
  public Description matchWhileLoop(WhileLoopTree tree, VisitorState state) {
    return check(tree, tree.getStatement(), state);
  }

  @Override
  public Description matchDoWhileLoop(DoWhileLoopTree tree, VisitorState state) {
    return check(tree, tree.getStatement(), state);
  }

  private Description check(StatementTree loop, StatementTree body, VisitorState state) {
    if (!(state.getPath().getParentPath().getLeaf() instanceof BlockTree)
        || !Support.startsLine(Support.start(loop), state)) {
      return Description.NO_MATCH;
    }
    List<LookupShape> found = new ArrayList<>();
    new TreeScanner<Void, Void>() {
      @Override
      public Void visitLambdaExpression(LambdaExpressionTree node, Void unused) {
        return null;
      }

      @Override
      public Void visitClass(ClassTree node, Void unused) {
        return null;
      }

      @Override
      public Void visitForLoop(ForLoopTree node, Void unused) {
        return null;
      }

      @Override
      public Void visitEnhancedForLoop(EnhancedForLoopTree node, Void unused) {
        return null;
      }

      @Override
      public Void visitWhileLoop(WhileLoopTree node, Void unused) {
        return null;
      }

      @Override
      public Void visitDoWhileLoop(DoWhileLoopTree node, Void unused) {
        return null;
      }

      @Override
      public Void visitMethodInvocation(MethodInvocationTree node, Void unused) {
        LookupShape shape = LookupShape.of(node, state);
        if (shape == null) {
          return super.visitMethodInvocation(node, unused);
        }
        if (ImmutableSource.proven(shape.collectionSymbol, Support.start(loop), state)) {
          found.add(shape);
        }
        return null;
      }
    }.scan(body, null);
    if (found.isEmpty()) {
      return Description.NO_MATCH;
    }
    return describeMatch(loop, rewrite(loop, found, state));
  }

  private static SuggestedFix rewrite(StatementTree loop, List<LookupShape> found, VisitorState state) {
    SuggestedFix.Builder fix = SuggestedFix.builder();
    String optional = SuggestedFixes.qualifyType(state, fix, "java.util.Optional");
    String collectors = SuggestedFixes.qualifyType(state, fix, "java.util.stream.Collectors");
    Map<List<Object>, String> declared = new LinkedHashMap<>();
    StringBuilder declarations = new StringBuilder();
    String indent = Support.indentAt(Support.start(loop), state);
    for (LookupShape shape : found) {
      boolean map = shape.form == LookupShape.Form.FIND;
      List<Object> group = List.of(shape.collectionSymbol, shape.keyName, map);
      String name = declared.get(group);
      if (name == null) {
        name = FreshNames.claim(stem(shape.collectionSymbol.getSimpleName().toString()) + (map ? "By" : "") + shape.keyName + (map ? "" : "Set"), state);
        declared.put(group, name);
        declarations.append(declaration(shape, name, map, fix, collectors, state)).append('\n').append(indent);
      }
      String probe = Support.source(shape.probe, state);
      fix.replace(shape.call, switch (shape.form) {
        case FIND -> optional + ".ofNullable(" + name + ".get(" + probe + "))";
        case ANY -> name + ".contains(" + probe + ")";
        case NONE -> "!" + name + ".contains(" + probe + ")";
      });
    }
    return fix.prefixWith(loop, declarations.toString()).build();
  }

  private static String declaration(
      LookupShape shape,
      String name,
      boolean map,
      SuggestedFix.Builder fix,
      String collectors,
      VisitorState state) {
    String key = SuggestedFixes.prettyType(state, fix, shape.keyType);
    String parameter = shape.parameter.getName().toString();
    String extractor = parameter + " -> " + Support.source(shape.key, state);
    String source = Support.source(shape.collection, state) + ".stream()";
    if (!map) {
      return SuggestedFixes.qualifyType(state, fix, "java.util.Set")
          + "<" + key + "> " + name + " = " + source + ".map(" + extractor + ").collect(" + collectors + ".toSet());";
    }
    String element = SuggestedFixes.prettyType(state, fix, shape.elementType);
    String first = FreshNames.claim("first", state);
    String second = FreshNames.claim("second", state);
    String identity = SuggestedFixes.qualifyType(state, fix, "java.util.function.Function");
    return SuggestedFixes.qualifyType(state, fix, "java.util.Map")
        + "<" + key + ", " + element + "> " + name + " = " + source + ".collect(" + collectors + ".toMap("
        + extractor + ", " + identity + ".identity(), (" + first + ", " + second + ") -> " + first + "));";
  }

  private static String stem(String name) {
    if (!name.equals(name.toUpperCase())) {
      return name;
    }
    StringBuilder out = new StringBuilder();
    boolean upper = false;
    for (char c : name.toLowerCase().toCharArray()) {
      if (c == '_') {
        upper = out.length() > 0;
      } else {
        out.append(upper ? Character.toUpperCase(c) : c);
        upper = false;
      }
    }
    return out.toString();
  }
}
