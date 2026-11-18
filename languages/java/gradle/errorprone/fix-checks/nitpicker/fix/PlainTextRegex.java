package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.MethodInvocationTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.tools.javac.code.Symbol;
import java.util.regex.Pattern;

@BugPattern(
    summary = "Calls replaceAll with a pattern that is plain text; replace does the same without a regex.",
    severity = WARNING)
public final class PlainTextRegex extends BugChecker implements MethodInvocationTreeMatcher {
  private static final Pattern METACHARACTER = Pattern.compile("[\\\\^$.|?*+()\\[\\]{}]");
  private static final String NAME = "replaceAll";

  @Override
  public Description matchMethodInvocation(MethodInvocationTree tree, VisitorState state) {
    if (tree.getArguments().size() != 2
        || !(tree.getMethodSelect() instanceof MemberSelectTree select)
        || !select.getIdentifier().contentEquals(NAME)
        || !isStringMethod(tree)) {
      return Description.NO_MATCH;
    }
    String pattern = ASTHelpers.constValue(tree.getArguments().get(0), String.class);
    if (pattern == null || METACHARACTER.matcher(pattern).find()) {
      return Description.NO_MATCH;
    }
    ExpressionTree replacement = tree.getArguments().get(1);
    SuggestedFix.Builder fix = SuggestedFix.builder();
    String constant = ASTHelpers.constValue(replacement, String.class);
    ExpressionTree quoted = quotedValue(replacement);
    if (quoted != null) {
      fix.replace(replacement, Support.source(quoted, state));
      Support.dropImportIfUnused(fix, state, "Matcher", quotedCall(replacement, state), path ->
          path.getLeaf() instanceof MethodInvocationTree other
              && matchMethodInvocation(other, state.withPath(path)) != Description.NO_MATCH
              && quotedValue(other.getArguments().get(1)) != null
              ? quotedCall(other.getArguments().get(1), state) : null);
    } else if (constant != null) {
      String literal = unescapedReplacement(constant);
      if (literal == null) {
        return Description.NO_MATCH;
      }
      if (!literal.equals(constant)) {
        fix.replace(replacement, stringLiteral(literal));
      }
    } else {
      return Description.NO_MATCH;
    }
    int end = Support.end(select, state);
    fix.replace(end - NAME.length(), end, "replace");
    return describeMatch(tree, fix.build());
  }

  private static int[] quotedCall(ExpressionTree replacement, VisitorState state) {
    ExpressionTree quoted = quotedValue(replacement);
    return new int[] {Support.start(replacement), Support.start(quoted)};
  }

  private static ExpressionTree quotedValue(ExpressionTree replacement) {
    if (!(Support.unparenthesized(replacement) instanceof MethodInvocationTree call)
        || call.getArguments().size() != 1) {
      return null;
    }
    Symbol method = ASTHelpers.getSymbol(call);
    boolean quote = method != null
        && method.name.contentEquals("quoteReplacement")
        && method.owner.getQualifiedName().contentEquals("java.util.regex.Matcher");
    return quote ? call.getArguments().get(0) : null;
  }

  private static boolean isStringMethod(MethodInvocationTree tree) {
    Symbol method = ASTHelpers.getSymbol(tree);
    return method != null && method.owner.getQualifiedName().contentEquals("java.lang.String");
  }

  private static String unescapedReplacement(String replacement) {
    StringBuilder text = new StringBuilder();
    for (int index = 0; index < replacement.length(); index++) {
      char next = replacement.charAt(index);
      if (next == '$') {
        return null;
      }
      if (next == '\\') {
        index++;
        if (index == replacement.length()) {
          return null;
        }
        next = replacement.charAt(index);
      }
      text.append(next);
    }
    return text.toString();
  }

  private static String stringLiteral(String text) {
    StringBuilder literal = new StringBuilder("\"");
    for (char next : text.toCharArray()) {
      switch (next) {
        case '"' -> literal.append("\\\"");
        case '\\' -> literal.append("\\\\");
        case '\n' -> literal.append("\\n");
        case '\r' -> literal.append("\\r");
        case '\t' -> literal.append("\\t");
        case '\b' -> literal.append("\\b");
        case '\f' -> literal.append("\\f");
        default -> literal.append(plain(next));
      }
    }
    return literal.append('"').toString();
  }

  private static String plain(char next) {
    return next >= ' ' && next < 127 ? String.valueOf(next) : String.format("\\u%04x", (int) next);
  }
}
