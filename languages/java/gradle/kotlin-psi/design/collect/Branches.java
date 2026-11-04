package nitpicker.kotlinpsi.design.collect;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.function.Consumer;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

public final class Branches {
  private final Deque<String> active = new ArrayDeque<>();
  private int conditionals;

  public static boolean conditional(PsiElement element) {
    return element instanceof KtIfExpression || element instanceof KtWhenExpression;
  }

  public List<String> active() {
    return active.isEmpty() ? null : new ArrayList<>(active);
  }

  public void visit(PsiElement element, Consumer<PsiElement> visitor) {
    int id = conditionals++;
    if (element instanceof KtIfExpression) {
      KtIfExpression branch = (KtIfExpression) element;
      visitor.accept(branch.getCondition());
      arm(id + ":then", branch.getThen(), visitor);
      arm(id + ":else", branch.getElse(), visitor);
    } else {
      KtWhenExpression when = (KtWhenExpression) element;
      visitor.accept(when.getSubjectVariable());
      visitor.accept(when.getSubjectExpression());
      int index = 0;
      for (KtWhenEntry entry : when.getEntries()) {
        entry(id + ":" + index++, entry, visitor);
      }
    }
  }

  private void entry(String marker, KtWhenEntry entry, Consumer<PsiElement> visitor) {
    for (KtWhenCondition condition : entry.getConditions()) {
      visitor.accept(condition);
    }
    arm(marker, entry.getExpression(), visitor);
  }

  private void arm(String marker, PsiElement body, Consumer<PsiElement> visitor) {
    active.push(marker);
    visitor.accept(body);
    active.pop();
  }
}
