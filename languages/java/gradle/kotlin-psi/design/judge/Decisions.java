package nitpicker.kotlinpsi.design.judge;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.judge.Comparisons.Equality;
import nitpicker.kotlinpsi.design.judge.Comparisons.Subject;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Source;
import nitpicker.kotlinpsi.design.model.Ty;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.psi.*;

public final class Decisions {
  private static final class Tally {
    public final List<List<String>> groups = new ArrayList<>();
    public final Comparisons comparisons;
    public Subject subject;
    public String text;
    public boolean otherwise;

    public Tally(Comparisons comparisons, Subject subject) {
      this.comparisons = comparisons;
      this.subject = subject;
    }

    public boolean accept(Equality found) {
      String current = comparisons.normalized(found.subject);
      if (text != null && !text.equals(current)) {
        return false;
      }
      text = current;
      subject = subject != null ? subject : comparisons.subject(found.subject);
      return subject != null;
    }
  }

  private final Ctx ctx;
  private final Fun function;
  private final Source source;
  private final Comparisons comparisons;
  private final List<Object> facts = new ArrayList<>();
  private final Set<KtIfExpression> consumed = new HashSet<>();

  public Decisions(Ctx ctx, Fun function) {
    this.ctx = ctx;
    this.function = function;
    this.source = function.owner.source;
    this.comparisons = new Comparisons(ctx);
  }

  public List<Object> run() {
    for (PsiElement root : function.roots) {
      if (root instanceof KtWhenExpression || root instanceof KtIfExpression) {
        decide(root);
      }
      for (PsiElement node : PsiTreeUtil.findChildrenOfAnyType(root, KtWhenExpression.class, KtIfExpression.class)) {
        decide(node);
      }
    }
    return facts;
  }

  private void decide(PsiElement node) {
    if (node instanceof KtWhenExpression) {
      when((KtWhenExpression) node);
    } else {
      chain((KtIfExpression) node);
    }
  }

  private void emit(PsiElement node, Tally tally) {
    boolean wide = tally.groups.stream().anyMatch(group -> group.size() > 1);
    if (tally.groups.isEmpty() || !(tally.otherwise || tally.groups.size() > 1 || wide)) {
      return;
    }
    List<Object> listed = new ArrayList<>();
    for (List<String> group : tally.groups) {
      listed.add(new ArrayList<Object>(group));
    }
    facts.add(
        m(
            "subject", tally.subject.id, "groups", listed, "line", source.line(node),
            "otherwise", tally.otherwise ? Boolean.TRUE : null));
  }

  private void when(KtWhenExpression when) {
    KtExpression subjectExpression = when.getSubjectExpression();
    Subject fixed = subjectExpression == null ? null : comparisons.subject(subjectExpression);
    if (subjectExpression != null && fixed == null) {
      return;
    }
    Tally tally = new Tally(comparisons, fixed);
    for (KtWhenEntry entry : when.getEntries()) {
      if (entry.isElse()) {
        tally.otherwise = true;
      } else if (!arm(entry, fixed, tally)) {
        return;
      }
    }
    if (tally.subject != null) {
      emit(when, tally);
    }
  }

  private boolean arm(KtWhenEntry entry, Subject fixed, Tally tally) {
    List<String> constants = new ArrayList<>();
    for (KtWhenCondition condition : entry.getConditions()) {
      Equality found = fixed == null ? subjectLess(condition) : forSubject(condition, fixed);
      if (found == null || fixed == null && !tally.accept(found)) {
        return false;
      }
      constants.addAll(found.constants);
    }
    tally.groups.add(constants);
    return true;
  }

  private Equality subjectLess(KtWhenCondition condition) {
    return condition instanceof KtWhenConditionWithExpression
        ? comparisons.equality(((KtWhenConditionWithExpression) condition).getExpression())
        : null;
  }

  private Equality forSubject(KtWhenCondition condition, Subject subject) {
    if (condition instanceof KtWhenConditionWithExpression) {
      String constant = comparisons.constant(((KtWhenConditionWithExpression) condition).getExpression(), subject);
      return constant == null ? null : new Equality(null, List.of(constant));
    }
    if (condition instanceof KtWhenConditionInRange && !((KtWhenConditionInRange) condition).isNegated()) {
      KtExpression range = ((KtWhenConditionInRange) condition).getRangeExpression();
      List<String> constants = comparisons.collection(range, subject);
      return constants == null ? null : new Equality(null, constants);
    }
    if (condition instanceof KtWhenConditionIsPattern && !((KtWhenConditionIsPattern) condition).isNegated()) {
      Ty type = ctx.names.resolve(((KtWhenConditionIsPattern) condition).getTypeReference(), source);
      boolean fits = type.project() && type.owner.caseOf != null && type.owner.caseOf == subject.enumOwner;
      return fits ? new Equality(null, List.of(type.owner.name)) : null;
    }
    return null;
  }

  private void chain(KtIfExpression head) {
    if (consumed.contains(head)) {
      return;
    }
    Tally tally = new Tally(comparisons, null);
    if (collect(head, tally) && tally.subject != null) {
      emit(head, tally);
    }
  }

  private boolean collect(KtIfExpression head, Tally tally) {
    KtIfExpression current = head;
    while (current != null) {
      Equality found = comparisons.equality(current.getCondition());
      String currentText = found == null ? null : comparisons.normalized(found.subject);
      if (found == null || tally.text != null && !tally.text.equals(currentText)) {
        tally.otherwise = current != head;
        break;
      }
      consumed.add(current);
      if (!tally.accept(found)) {
        consumed.remove(current);
        return false;
      }
      tally.groups.add(found.constants);
      current = next(current, tally);
    }
    return true;
  }

  private KtIfExpression next(KtIfExpression current, Tally tally) {
    KtExpression next = Ps.parens(current.getElse());
    if (next instanceof KtIfExpression) {
      return (KtIfExpression) next;
    }
    tally.otherwise |= next != null;
    return null;
  }
}
