package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.CatchTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.CatchTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.LambdaExpressionTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.NewClassTree;
import com.sun.source.tree.ThrowTree;
import com.sun.source.tree.Tree;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreeScanner;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Symbol.ClassSymbol;
import com.sun.tools.javac.code.Symbol.MethodSymbol;
import com.sun.tools.javac.code.Type;
import java.util.ArrayList;
import java.util.List;

@BugPattern(
    summary = "Passes the caught exception as the cause of the exception thrown from the catch block.",
    severity = WARNING)
public final class PreserveStackTrace extends BugChecker implements CatchTreeMatcher {
  @Override
  public Description matchCatch(CatchTree tree, VisitorState state) {
    Symbol caught = ASTHelpers.getSymbol(tree.getParameter());
    List<NewClassTree> thrown = new ArrayList<>();
    new TreeScanner<Void, Void>() {
      @Override
      public Void visitThrow(ThrowTree node, Void unused) {
        if (Support.unparenthesized(node.getExpression()) instanceof NewClassTree created
            && created.getClassBody() == null) {
          thrown.add(created);
        }
        return super.visitThrow(node, unused);
      }

      @Override
      public Void visitClass(ClassTree node, Void unused) {
        return null;
      }

      @Override
      public Void visitLambdaExpression(LambdaExpressionTree node, Void unused) {
        return null;
      }
    }.scan(tree.getBlock(), null);
    for (NewClassTree created : thrown) {
      if (!passesCaught(created, caught) && hasCauseConstructor(created, caught, state)) {
        state.reportMatch(describeMatch(created, causeFix(created, caught, state)));
      }
    }
    return Description.NO_MATCH;
  }

  private static SuggestedFix causeFix(NewClassTree created, Symbol caught, VisitorState state) {
    SuggestedFix.Builder fix = SuggestedFix.builder();
    List<? extends ExpressionTree> arguments = created.getArguments();
    if (arguments.isEmpty()) {
      fix.replace(Support.end(created, state) - 1, Support.end(created, state) - 1, caught.getSimpleName().toString());
    } else {
      ExpressionTree last = arguments.get(arguments.size() - 1);
      fix.postfixWith(last, ", " + caught.getSimpleName());
    }
    return fix.build();
  }

  private static boolean passesCaught(NewClassTree created, Symbol caught) {
    boolean[] passed = {false};
    new TreeScanner<Void, Boolean>() {
      @Override
      public Void visitMemberSelect(MemberSelectTree node, Boolean receiver) {
        return scan(node.getExpression(), true);
      }

      @Override
      public Void visitIdentifier(IdentifierTree node, Boolean receiver) {
        if (ASTHelpers.getSymbol(node) == caught && !Boolean.TRUE.equals(receiver)) {
          passed[0] = true;
        }
        return null;
      }
    }.scan(created.getArguments(), false);
    return passed[0];
  }

  private static boolean hasCauseConstructor(NewClassTree created, Symbol caught, VisitorState state) {
    Type type = ASTHelpers.getType(created);
    if (type == null || !(type.tsym instanceof ClassSymbol owner)) {
      return false;
    }
    int count = created.getArguments().size();
    int matches = 0;
    for (MethodSymbol constructor : ASTHelpers.getConstructors(owner)) {
      List<Symbol.VarSymbol> parameters = constructor.getParameters();
      if (constructor.isPrivate() || constructor.isVarArgs() || parameters.size() != count + 1) {
        continue;
      }
      boolean fits = state.getTypes().isAssignable(caught.type, parameters.get(count).type);
      for (int index = 0; fits && index < count; index++) {
        Type argument = ASTHelpers.getType(created.getArguments().get(index));
        fits = argument != null && state.getTypes().isAssignable(argument, parameters.get(index).type);
      }
      if (fits && isThrowable(parameters.get(count).type, state)) {
        matches++;
      }
    }
    return matches == 1;
  }

  private static boolean isThrowable(Type type, VisitorState state) {
    return state.getTypes().isSubtype(type, state.getSymtab().throwableType);
  }
}
