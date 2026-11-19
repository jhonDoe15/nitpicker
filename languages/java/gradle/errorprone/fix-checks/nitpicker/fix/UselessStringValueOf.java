package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.MethodInvocationTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.BinaryTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.Tree;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Type;
import javax.lang.model.type.TypeKind;

@BugPattern(
    summary = "Concatenates the value itself instead of wrapping it in String.valueOf.",
    severity = WARNING)
public final class UselessStringValueOf extends BugChecker implements MethodInvocationTreeMatcher {
  @Override
  public Description matchMethodInvocation(MethodInvocationTree tree, VisitorState state) {
    if (!isStringValueOf(tree)
        || !(state.getPath().getParentPath().getLeaf() instanceof BinaryTree binary)
        || binary.getKind() != Tree.Kind.PLUS
        || !isString(ASTHelpers.getType(binary), state)) {
      return Description.NO_MATCH;
    }
    ExpressionTree argument = tree.getArguments().get(0);
    if (hasComment(tree, argument, state)) {
      return Description.NO_MATCH;
    }
    Type type = ASTHelpers.getType(argument);
    boolean replaceable = type != null && type.getKind() != TypeKind.NULL
        && (isString(type, state) || isSafe(tree, binary, type, state));
    if (!replaceable) {
      return Description.NO_MATCH;
    }
    boolean left = binary.getLeftOperand() == tree;
    int minimum = left ? Precedence.of(binary) : Precedence.of(binary) + 1;
    return describeMatch(tree, SuggestedFix.replace(tree, Precedence.wrap(argument, minimum, state)));
  }

  private static boolean hasComment(MethodInvocationTree tree, ExpressionTree argument, VisitorState state) {
    CharSequence text = state.getSourceCode();
    int open = Support.end(tree.getMethodSelect(), state);
    String before = text.subSequence(open, Support.start(argument)).toString();
    String after = text.subSequence(Support.end(argument, state), Support.end(tree, state)).toString();
    return before.contains("/") || after.contains("/");
  }

  private static boolean isSafe(MethodInvocationTree tree, BinaryTree binary, Type type, VisitorState state) {
    boolean left = binary.getLeftOperand() == tree;
    ExpressionTree other = left ? binary.getRightOperand() : binary.getLeftOperand();
    boolean otherIsCall = other instanceof MethodInvocationTree call && isStringValueOf(call);
    return isString(ASTHelpers.getType(other), state)
        && state.getTypes().erasure(type).getKind() != TypeKind.ARRAY
        && !(left && otherIsCall);
  }

  private static boolean isString(Type type, VisitorState state) {
    return type != null && ASTHelpers.isSameType(type, state.getSymtab().stringType, state);
  }

  private static boolean isStringValueOf(MethodInvocationTree tree) {
    Symbol symbol = ASTHelpers.getSymbol(tree);
    return tree.getArguments().size() == 1
        && tree.getMethodSelect() instanceof MemberSelectTree
        && symbol != null
        && symbol.getSimpleName().contentEquals("valueOf")
        && symbol.owner.getQualifiedName().contentEquals("java.lang.String");
  }
}
