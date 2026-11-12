package nitpicker.kotlinpsi.mutation;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.KtBinaryExpression;
import org.jetbrains.kotlin.psi.KtBinaryExpressionWithTypeRHS;
import org.jetbrains.kotlin.psi.KtCallExpression;
import org.jetbrains.kotlin.psi.KtDeclarationWithBody;
import org.jetbrains.kotlin.psi.KtExpression;
import org.jetbrains.kotlin.psi.KtForExpression;
import org.jetbrains.kotlin.psi.KtIfExpression;
import org.jetbrains.kotlin.psi.KtIsExpression;
import org.jetbrains.kotlin.psi.KtLoopExpression;
import org.jetbrains.kotlin.psi.KtPostfixExpression;
import org.jetbrains.kotlin.psi.KtPrefixExpression;
import org.jetbrains.kotlin.psi.KtProperty;
import org.jetbrains.kotlin.psi.KtReturnExpression;
import org.jetbrains.kotlin.psi.KtSafeQualifiedExpression;
import org.jetbrains.kotlin.psi.KtValueArgument;
import org.jetbrains.kotlin.psi.KtWhenCondition;
import org.jetbrains.kotlin.psi.KtWhenEntry;
import org.jetbrains.kotlin.psi.KtWhenExpression;
import org.jetbrains.kotlin.psi.KtWhileExpressionBase;

final class Branching {
  private static final Set<String> INLINE_BRANCHING =
      Set.of(
          "map", "mapNotNull", "mapIndexed", "mapIndexedNotNull", "filter", "filterNot", "filterIndexed",
          "filterNotNull", "filterIsInstance", "forEach", "forEachIndexed", "onEach", "onEachIndexed", "any", "all",
          "none", "count", "find", "findLast", "first", "firstOrNull", "last", "lastOrNull", "single",
          "singleOrNull", "indexOfFirst", "indexOfLast", "sumOf", "sumBy", "fold", "foldIndexed", "reduce",
          "reduceOrNull", "flatMap", "flatMapIndexed", "associate", "associateBy", "associateWith", "groupBy",
          "partition", "takeWhile", "dropWhile", "repeat", "use", "require", "requireNotNull", "check",
          "checkNotNull", "assert", "getOrElse", "getOrPut", "takeIf", "takeUnless", "ifEmpty", "ifBlank",
          "coerceAtLeast", "coerceAtMost", "coerceIn", "maxOf", "minOf", "maxOfOrNull", "minOfOrNull", "maxByOrNull",
          "minByOrNull", "mapCatching", "recover", "getOrNull", "getOrDefault", "isNullOrBlank", "isNullOrEmpty",
          "isEmpty", "isNotEmpty", "isBlank", "isNotBlank", "orEmpty");
  private static final Set<Object> COMPARISONS =
      Set.of(KtTokens.LT, KtTokens.GT, KtTokens.LTEQ, KtTokens.GTEQ, KtTokens.EQEQ, KtTokens.EXCLEQ,
          KtTokens.EQEQEQ, KtTokens.EXCLEQEQEQ, KtTokens.ANDAND, KtTokens.OROR, KtTokens.ELVIS,
          KtTokens.IN_KEYWORD, KtTokens.NOT_IN);

  private final Spans spans;
  private final Set<String> projectInline;
  private final Set<Integer> branching = new TreeSet<>();
  private final Set<Integer> casts = new TreeSet<>();
  private final Set<Integer> otherBranching = new TreeSet<>();
  private final Set<Integer> lastEntries = new TreeSet<>();

  Branching(Spans spans, Set<String> projectInline) {
    this.spans = spans;
    this.projectInline = projectInline;
  }

  List<Integer> branchingLines() {
    return new ArrayList<>(branching);
  }

  List<Integer> castLines() {
    return new ArrayList<>(casts);
  }

  List<Integer> exhaustiveLastEntryLines() {
    Set<Integer> lines = new TreeSet<>(lastEntries);
    lines.removeAll(otherBranching);
    return new ArrayList<>(lines);
  }

  void visit(PsiElement element) {
    if (element instanceof KtIfExpression) {
      ifExpression((KtIfExpression) element);
    } else if (element instanceof KtWhenExpression) {
      whenExpression((KtWhenExpression) element);
    } else if (element instanceof KtLoopExpression) {
      loop((KtLoopExpression) element);
    } else if (element instanceof KtBinaryExpression) {
      binary((KtBinaryExpression) element);
    } else if (element instanceof KtIsExpression) {
      mark(((KtIsExpression) element).getOperationReference());
    } else if (element instanceof KtBinaryExpressionWithTypeRHS) {
      cast((KtBinaryExpressionWithTypeRHS) element);
    } else if (element instanceof KtPrefixExpression) {
      prefix((KtPrefixExpression) element);
    } else if (element instanceof KtPostfixExpression) {
      postfix((KtPostfixExpression) element);
    } else if (element instanceof KtSafeQualifiedExpression) {
      mark(((KtSafeQualifiedExpression) element).getOperationTokenNode().getPsi());
    } else if (element instanceof KtCallExpression) {
      call((KtCallExpression) element);
    }
  }

  private void ifExpression(KtIfExpression expression) {
    mark(expression.getIfKeyword());
    markEnds(expression.getCondition());
  }

  private void whenExpression(KtWhenExpression expression) {
    mark(expression.getWhenKeyword());
    markEnds(expression.getSubjectExpression());
    List<KtWhenEntry> entries = expression.getEntries();
    KtWhenEntry exhaustiveLast = exhaustiveLastEntry(expression, entries);
    for (KtWhenEntry entry : entries) {
      KtWhenCondition[] conditions = entry.getConditions();
      for (int index = 0; index < conditions.length; index++) {
        if (entry == exhaustiveLast && index == conditions.length - 1) {
          markLastEntry(conditions[index]);
        } else {
          markEnds(conditions[index]);
        }
      }
      if (entry.isElse()) {
        mark(entry.getElseKeyword());
      }
    }
  }

  private static KtWhenEntry exhaustiveLastEntry(KtWhenExpression expression, List<KtWhenEntry> entries) {
    if (expression.getSubjectExpression() == null || entries.isEmpty() || expression.getElseExpression() != null
        || !usedAsValue(expression)) {
      return null;
    }
    return entries.get(entries.size() - 1);
  }

  private static boolean usedAsValue(KtWhenExpression expression) {
    PsiElement parent = expression.getParent();
    if (parent instanceof KtDeclarationWithBody) {
      return ((KtDeclarationWithBody) parent).getBodyExpression() == expression;
    }
    if (parent instanceof KtProperty) {
      return ((KtProperty) parent).getInitializer() == expression;
    }
    return parent instanceof KtReturnExpression || parent instanceof KtValueArgument;
  }

  private void loop(KtLoopExpression loop) {
    mark(loop.getFirstChild());
    if (loop instanceof KtForExpression) {
      markEnds(((KtForExpression) loop).getLoopRange());
      markEnds(((KtForExpression) loop).getLoopParameter());
    } else if (loop instanceof KtWhileExpressionBase) {
      markEnds(((KtWhileExpressionBase) loop).getCondition());
    }
  }

  private void binary(KtBinaryExpression expression) {
    if (COMPARISONS.contains(expression.getOperationToken())) {
      mark(expression.getOperationReference());
      markEnds(expression);
    }
  }

  private void prefix(KtPrefixExpression expression) {
    if (expression.getOperationToken() == KtTokens.EXCL) {
      mark(expression.getOperationReference());
    }
  }

  private void postfix(KtPostfixExpression expression) {
    if (expression.getOperationToken() == KtTokens.EXCLEXCL) {
      mark(expression.getOperationReference());
    }
  }

  private void cast(KtBinaryExpressionWithTypeRHS expression) {
    mark(expression.getOperationReference());
    if (expression.getOperationReference().getReferencedNameElementType() == KtTokens.AS_KEYWORD) {
      casts.add(spans.startLine(expression));
      casts.add(spans.endLine(expression));
    }
  }

  private void call(KtCallExpression call) {
    KtExpression callee = call.getCalleeExpression();
    String name = callee == null ? null : callee.getText();
    if (name != null && (INLINE_BRANCHING.contains(name) || projectInline.contains(name))) {
      mark(callee);
    }
  }

  private void mark(PsiElement element) {
    if (element != null) {
      branching.add(spans.startLine(element));
      otherBranching.add(spans.startLine(element));
    }
  }

  private void markEnds(PsiElement element) {
    if (element != null) {
      mark(element);
      branching.add(spans.endLineNotBeforeStart(element));
      otherBranching.add(spans.endLineNotBeforeStart(element));
    }
  }

  private void markLastEntry(PsiElement element) {
    for (int line = spans.startLine(element); line <= spans.endLineNotBeforeStart(element); line++) {
      lastEntries.add(line);
    }
    branching.add(spans.startLine(element));
    branching.add(spans.endLineNotBeforeStart(element));
  }
}
