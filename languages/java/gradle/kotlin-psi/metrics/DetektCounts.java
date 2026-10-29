package nitpicker.kotlinpsi.metrics;

import java.util.*;
import nitpicker.kotlinpsi.common.Json;
import nitpicker.kotlinpsi.common.Lines;
import org.jetbrains.kotlin.com.intellij.lang.ASTNode;
import org.jetbrains.kotlin.com.intellij.psi.PsiComment;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.PsiWhiteSpace;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

/**
 * The counts of the detekt rules whose message leaves the count out, measured the way detekt 1.23 measures them
 * and placed where detekt reports them, so a legacy finding can be held at its base count.
 */
public final class DetektCounts {
  private static final Set<String> NESTING_CALLS = Set.of("run", "let", "apply", "with", "use", "forEach");

  private final String text;
  private final String relative;
  private final List<String> entries;
  private final Lines lines;

  private DetektCounts(String text, String relative, List<String> entries) {
    this.text = text;
    this.relative = relative;
    this.entries = entries;
    this.lines = new Lines(text);
  }

  public static void collect(KtFile file, String text, String relative, List<String> entries) {
    DetektCounts counts = new DetektCounts(text, relative, entries);
    for (KtNamedFunction function : PsiTreeUtil.findChildrenOfType(file, KtNamedFunction.class)) {
      counts.function(function);
    }
    for (KtFunction function : PsiTreeUtil.findChildrenOfType(file, KtFunction.class)) {
      KtParameterList parameters = function.getValueParameterList();
      if (parameters != null && !parameters.getParameters().isEmpty()) {
        counts.add("LongParameterList", parameters, parameters.getParameters().size());
      }
    }
    for (KtLoopExpression loop : PsiTreeUtil.findChildrenOfType(file, KtLoopExpression.class)) {
      int jumps = jumps(loop.getBody());
      if (jumps > 0) {
        counts.add("LoopWithTooManyJumpStatements", keyword(loop), jumps);
      }
    }
    for (KtClassOrObject klass : PsiTreeUtil.findChildrenOfType(file, KtClassOrObject.class)) {
      counts.add("LargeClass", named(klass), counts.ownLines(klass));
    }
  }

  private void function(KtNamedFunction function) {
    int throwsCount = function.hasModifier(KtTokens.OVERRIDE_KEYWORD) ? 0 : throwsOf(function);
    if (throwsCount > 0) {
      add("ThrowsCount", named(function), throwsCount);
    }
    Depth depth = new Depth();
    function.accept(depth);
    if (depth.max > 0) {
      add("NestedBlockDepth", named(function), depth.max);
    }
  }

  private static int throwsOf(KtNamedFunction function) {
    KtBlockExpression body = function.getBodyBlockExpression();
    if (body == null) {
      return 0;
    }
    int count = 0;
    for (KtExpression statement : body.getStatements()) {
      List<KtThrowExpression> found =
          new ArrayList<>(PsiTreeUtil.findChildrenOfType(statement, KtThrowExpression.class));
      if (statement instanceof KtThrowExpression) {
        found.add((KtThrowExpression) statement);
      }
      for (KtThrowExpression thrown : found) {
        count += PsiTreeUtil.getParentOfType(thrown, KtNamedFunction.class, true) == function ? 1 : 0;
      }
    }
    return count;
  }

  private static int jumps(PsiElement element) {
    if (element == null || element instanceof KtLoopExpression) {
      return 0;
    }
    int count = element instanceof KtBreakExpression || element instanceof KtContinueExpression ? 1 : 0;
    for (PsiElement child : element.getChildren()) {
      count += jumps(child);
    }
    return count;
  }

  private static PsiElement keyword(KtLoopExpression loop) {
    ASTNode keyword = null;
    if (loop instanceof KtForExpression) {
      keyword = loop.getNode().findChildByType(KtTokens.FOR_KEYWORD);
    } else if (loop instanceof KtWhileExpression) {
      keyword = loop.getNode().findChildByType(KtTokens.WHILE_KEYWORD);
    } else if (loop instanceof KtDoWhileExpression) {
      keyword = loop.getNode().findChildByType(KtTokens.DO_KEYWORD);
    }
    return keyword == null ? loop : keyword.getPsi();
  }

  private static PsiElement named(KtNamedDeclaration declaration) {
    return declaration.getNameIdentifier() == null ? declaration : declaration.getNameIdentifier();
  }

  private int ownLines(KtClassOrObject klass) {
    int own = linesOf(klass);
    for (KtClassOrObject nested : PsiTreeUtil.findChildrenOfType(klass, KtClassOrObject.class)) {
      own -= PsiTreeUtil.getParentOfType(nested, KtClassOrObject.class, true) == klass ? linesOf(nested) : 0;
    }
    return own;
  }

  private int linesOf(PsiElement element) {
    Set<Integer> code = new HashSet<>();
    collectLines(element.getNode(), code);
    return code.size();
  }

  private void collectLines(ASTNode node, Set<Integer> code) {
    PsiElement psi = node.getPsi();
    if (psi instanceof PsiWhiteSpace || psi instanceof PsiComment) {
      return;
    }
    if (node.getFirstChildNode() == null) {
      code.add(lines.index(node.getStartOffset()));
    }
    for (ASTNode child = node.getFirstChildNode(); child != null; child = child.getTreeNext()) {
      collectLines(child, code);
    }
  }

  private void add(String rule, PsiElement at, int value) {
    int offset = at.getTextRange().getStartOffset();
    int line = lines.index(offset);
    int column = offset - text.lastIndexOf('\n', offset - 1);
    entries.add("{\"file\":" + Json.quote(relative) + ",\"rule\":" + Json.quote(rule)
        + ",\"line\":" + (line + 1) + ",\"column\":" + column + ",\"value\":" + value + "}");
  }

  private static final class Depth extends KtTreeVisitorVoid {
    private int depth = 0;
    private int max = 0;

    private void enter() {
      depth += 1;
      max = Math.max(max, depth);
    }

    @Override
    public void visitIfExpression(KtIfExpression expression) {
      if (expression.getParent() instanceof KtContainerNodeForControlStructureBody) {
        super.visitIfExpression(expression);
        return;
      }
      enter();
      super.visitIfExpression(expression);
      depth -= 1;
    }

    @Override
    public void visitLoopExpression(KtLoopExpression expression) {
      enter();
      super.visitLoopExpression(expression);
      depth -= 1;
    }

    @Override
    public void visitWhenExpression(KtWhenExpression expression) {
      enter();
      super.visitWhenExpression(expression);
      depth -= 1;
    }

    @Override
    public void visitTryExpression(KtTryExpression expression) {
      enter();
      super.visitTryExpression(expression);
      depth -= 1;
    }

    @Override
    public void visitCallExpression(KtCallExpression expression) {
      KtExpression callee = expression.getCalleeExpression();
      if (!(callee instanceof KtSimpleNameExpression) || !NESTING_CALLS.contains(callee.getText())) {
        return;
      }
      List<KtLambdaArgument> lambdas = expression.getLambdaArguments();
      boolean nests = !lambdas.isEmpty()
          && lambdas.get(0).getLambdaExpression() != null
          && lambdas.get(0).getLambdaExpression().getBodyExpression() != null;
      if (nests) {
        enter();
      }
      super.visitCallExpression(expression);
      if (nests) {
        depth -= 1;
      }
    }
  }
}
