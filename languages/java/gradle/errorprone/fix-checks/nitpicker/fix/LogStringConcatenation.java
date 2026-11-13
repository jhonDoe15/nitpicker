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
import com.sun.source.tree.LiteralTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.Tree;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@BugPattern(
    summary = "Passes values as {} placeholders of the log message, not built into it with + or String.format.",
    severity = WARNING)
public final class LogStringConcatenation extends BugChecker implements MethodInvocationTreeMatcher {
  private static final Set<String> LEVELS = Set.of("trace", "debug", "info", "warn", "error");
  private static final Set<String> LOGGERS =
      Set.of("org.slf4j.Logger", "org.apache.logging.log4j.Logger");

  @Override
  public Description matchMethodInvocation(MethodInvocationTree tree, VisitorState state) {
    if (!(tree.getMethodSelect() instanceof MemberSelectTree select)
        || !LEVELS.contains(select.getIdentifier().toString())
        || !isLogger(select.getExpression())
        || tree.getArguments().isEmpty()) {
      return Description.NO_MATCH;
    }
    List<? extends ExpressionTree> arguments = tree.getArguments();
    int index = isString(arguments.get(0), state) ? 0 : 1;
    if (index >= arguments.size() || !isString(arguments.get(index), state)) {
      return Description.NO_MATCH;
    }
    ExpressionTree message = Support.unparenthesized(arguments.get(index));
    if (ASTHelpers.constValue(message) != null) {
      return Description.NO_MATCH;
    }
    Split split = split(message, state);
    if (split == null || split.values.isEmpty()) {
      return Description.NO_MATCH;
    }
    String text = split.text.toString();
    String values = String.join(", ", split.values);
    return describeMatch(tree, SuggestedFix.replace(arguments.get(index), quote(text) + ", " + values));
  }

  private static boolean isLogger(ExpressionTree receiver) {
    Type type = ASTHelpers.getType(receiver);
    if (type == null) {
      return false;
    }
    for (String name : LOGGERS) {
      if (type.tsym != null && type.tsym.getQualifiedName().contentEquals(name)) {
        return true;
      }
    }
    return false;
  }

  private static boolean isString(ExpressionTree tree, VisitorState state) {
    return ASTHelpers.isSameType(ASTHelpers.getType(tree), state.getSymtab().stringType, state);
  }

  private static final class Split {
    final StringBuilder text = new StringBuilder();
    final List<String> values = new ArrayList<>();
  }

  private static Split split(ExpressionTree message, VisitorState state) {
    Split split = new Split();
    boolean ok =
        message instanceof BinaryTree
            ? concatenation((BinaryTree) message, split, state)
            : format(message, split, state);
    return ok ? split : null;
  }

  private static boolean concatenation(BinaryTree tree, Split split, VisitorState state) {
    if (tree.getKind() != Tree.Kind.PLUS || !isString(tree, state)) {
      return false;
    }
    ExpressionTree left = tree.getLeftOperand();
    boolean ok = left instanceof BinaryTree binary && binary.getKind() == Tree.Kind.PLUS && isString(left, state)
        ? concatenation(binary, split, state)
        : operand(left, split, state);
    return ok && operand(tree.getRightOperand(), split, state);
  }

  private static boolean operand(ExpressionTree tree, Split split, VisitorState state) {
    if (tree instanceof LiteralTree literal && literal.getValue() instanceof String text) {
      return appendText(split, text);
    }
    Type type = ASTHelpers.getType(tree);
    if (type == null || state.getTypes().isSubtype(type, state.getSymtab().throwableType)) {
      return false;
    }
    split.text.append("{}");
    split.values.add(Support.source(Support.unparenthesized(tree), state));
    return true;
  }

  private static boolean format(ExpressionTree tree, Split split, VisitorState state) {
    if (!(tree instanceof MethodInvocationTree call)
        || !(call.getMethodSelect() instanceof MemberSelectTree select)) {
      return false;
    }
    Symbol method = ASTHelpers.getSymbol(call);
    boolean formatted = method != null && select.getIdentifier().contentEquals("formatted") && !call.getArguments().isEmpty()
        && Support.unparenthesized(select.getExpression()) instanceof LiteralTree;
    boolean staticFormat = method != null && select.getIdentifier().contentEquals("format")
        && method.owner.getQualifiedName().contentEquals("java.lang.String") && method.isStatic()
        && !call.getArguments().isEmpty()
        && Support.unparenthesized(call.getArguments().get(0)) instanceof LiteralTree;
    if (!formatted && !staticFormat) {
      return false;
    }
    String pattern = (String) ((LiteralTree) (formatted
        ? Support.unparenthesized(select.getExpression())
        : Support.unparenthesized(call.getArguments().get(0)))).getValue();
    List<? extends ExpressionTree> values = formatted ? call.getArguments() : call.getArguments().subList(1, call.getArguments().size());
    return placeholders(pattern, values, split, state);
  }

  private static boolean placeholders(
      String pattern, List<? extends ExpressionTree> values, Split split, VisitorState state) {
    int used = 0;
    for (int index = 0; index < pattern.length(); index++) {
      char current = pattern.charAt(index);
      if (current != '%') {
        if (!appendText(split, String.valueOf(current))) {
          return false;
        }
        continue;
      }
      if (index + 1 >= pattern.length() || used >= values.size()) {
        return false;
      }
      char kind = pattern.charAt(++index);
      Type type = ASTHelpers.getType(values.get(used));
      boolean number = type != null && ASTHelpers.isSameType(ASTHelpers.getType(values.get(used)), state.getSymtab().intType, state);
      if (kind == '%') {
        split.text.append('%');
      } else if (kind == 's' && type != null && !state.getTypes().isSubtype(type, state.getSymtab().throwableType)) {
        split.text.append("{}");
        split.values.add(Support.source(values.get(used++), state));
      } else if (kind == 'd' && number) {
        split.text.append("{}");
        split.values.add(Support.source(values.get(used++), state));
      } else {
        return false;
      }
    }
    return used == values.size();
  }

  private static boolean appendText(Split split, String literal) {
    if (literal.chars().anyMatch(c -> c == '{' || c == '}' || (c < 0x20 && c != '\n' && c != '\r' && c != '\t'))) {
      return false;
    }
    split.text.append(literal);
    return true;
  }

  private static String quote(String text) {
    StringBuilder out = new StringBuilder("\"");
    for (char c : text.toCharArray()) {
      switch (c) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        case '\n' -> out.append("\\n");
        case '\r' -> out.append("\\r");
        case '\t' -> out.append("\\t");
        default -> out.append(c);
      }
    }
    return out.append('"').toString();
  }
}
