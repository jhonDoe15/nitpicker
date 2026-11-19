package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.ClassTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.fixes.SuggestedFixes;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.Tree;
import com.sun.tools.javac.parser.Tokens.TokenKind;
import java.util.List;
import javax.lang.model.element.ElementKind;

@BugPattern(
    summary = "Builds the ObjectMapper or Gson once, in a private static final constant, instead of on every call.",
    severity = WARNING)
public final class ReusableObjectPerCall extends BugChecker implements ClassTreeMatcher {

  @Override
  public Description matchClass(ClassTree tree, VisitorState state) {
    if (!(state.getPath().getParentPath().getLeaf() instanceof CompilationUnitTree)) {
      return Description.NO_MATCH;
    }
    var symbol = ASTHelpers.getSymbol(tree);
    if (symbol == null || symbol.getKind() != ElementKind.CLASS && symbol.getKind() != ElementKind.RECORD) {
      return Description.NO_MATCH;
    }
    List<ReusableObjects.Found> found = ReusableObjects.find(tree, state);
    int brace = openingBrace(tree, state);
    if (found.isEmpty() || brace < 0) {
      return Description.NO_MATCH;
    }
    SuggestedFix.Builder fix = SuggestedFix.builder();
    StringBuilder fields = new StringBuilder();
    String indent = Support.indentAt(Support.start(tree), state) + "  ";
    for (ReusableObjects.Found object : found) {
      String name = FreshNames.claim(object.baseName, "_", state);
      fields.append("\n").append(indent).append("private static final ")
          .append(SuggestedFixes.prettyType(state, fix, object.type)).append(' ').append(name)
          .append(" = ").append(object.creation).append(";");
      for (Tree use : object.uses) {
        fix.replace(use, name);
      }
      for (Tree statement : object.removed) {
        int[] range = Support.removalRange(statement, state);
        fix.replace(range[0], range[1], "");
      }
    }
    fix.replace(brace + 1, brace + 1, fields + "\n");
    return describeMatch(tree, fix.build());
  }

  private static int openingBrace(ClassTree tree, VisitorState state) {
    int parentheses = 0;
    boolean header = false;
    for (var token : state.getTokensForNode(tree)) {
      TokenKind kind = token.kind();
      if (kind == TokenKind.CLASS || kind == TokenKind.IDENTIFIER && token.name().contentEquals("record")) {
        header = true;
      } else if (kind == TokenKind.LPAREN) {
        parentheses++;
      } else if (kind == TokenKind.RPAREN) {
        parentheses--;
      } else if (kind == TokenKind.LBRACE && header && parentheses == 0) {
        return Support.start(tree) + token.pos();
      }
    }
    return -1;
  }
}
