package nitpicker.kotlinpsi.facts.updates;

import static nitpicker.kotlinpsi.common.Psi.m;
import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.*;
import java.util.function.IntUnaryOperator;
import nitpicker.kotlinpsi.common.Frame;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.psi.*;

public final class Updates {
  private static final Set<String> LOCKS = Set.of("withLock", "withPermit");

  private final IntUnaryOperator lineOf;

  public Updates(IntUnaryOperator lineOf) {
    this.lineOf = lineOf;
  }

  public Map<String, Object> assignment(KtBinaryExpression assignment, Frame frame) {
    if (!ValueScan.ASSIGNMENTS.contains(assignment.getOperationToken()) || assignment.getRight() == null) {
      return null;
    }
    KtExpression left = assignment.getLeft();
    boolean viaThis = false;
    String target = nameOf(left);
    if (left instanceof KtDotQualifiedExpression
        && ((KtDotQualifiedExpression) left).getReceiverExpression() instanceof KtThisExpression) {
      target = nameOf(((KtDotQualifiedExpression) left).getSelectorExpression());
      viaThis = true;
    }
    if (target == null) {
      return null;
    }
    ValueScan scan = new ValueScan();
    scan.walk(assignment.getRight());
    PsiElement scope = PsiTreeUtil.getParentOfType(
        assignment, KtNamedFunction.class, KtPropertyAccessor.class, KtClassInitializer.class,
        KtSecondaryConstructor.class);
    List<Object> properties = localProperties(scope);
    boolean readsLocal = scan.items.stream()
        .anyMatch(item -> "read".equals(((Map<?, ?>) item).get("k"))
            && properties.contains(((Map<?, ?>) item).get("name")));
    boolean calls = scan.items.stream().anyMatch(item -> "call".equals(((Map<?, ?>) item).get("k")));
    if (!calls && !readsLocal) {
      return null;
    }
    Map<String, Object> update = m(
        "line", lineOf.applyAsInt(assignment.getTextOffset()), "operator", assignment.getOperationReference().getText(),
        "target", target, "viaThis", viaThis, "value", scan.items, "branching", scan.branching,
        "locals", locals(scope), "properties", properties, "scopes", frame == null ? List.of() : frame.chain());
    if (readsLocal && !properties.contains(target)) {
      update.put("steps", steps(assignment));
    }
    return update;
  }

  private static List<Object> localProperties(PsiElement scope) {
    Set<String> names = new TreeSet<>(Comparator.nullsFirst(Comparator.naturalOrder()));
    if (scope != null) {
      for (KtProperty property : PsiTreeUtil.findChildrenOfType(scope, KtProperty.class)) {
        if (property.isLocal() && property.getName() != null) {
          names.add(property.getName());
        }
      }
    }
    return new ArrayList<>(names);
  }

  public static List<Object> locals(PsiElement scope) {
    Set<String> names = new TreeSet<>(Comparator.nullsFirst(Comparator.naturalOrder()));
    if (scope != null) {
      for (KtParameter parameter : PsiTreeUtil.findChildrenOfType(scope, KtParameter.class)) {
        names.add(parameter.getName());
      }
      for (KtDestructuringDeclarationEntry entry :
          PsiTreeUtil.findChildrenOfType(scope, KtDestructuringDeclarationEntry.class)) {
        names.add(entry.getName());
      }
      for (Object name : localProperties(scope)) {
        names.add((String) name);
      }
    }
    names.remove(null);
    return new ArrayList<>(names);
  }

  private static List<Object> steps(KtBinaryExpression assignment) {
    LinkedList<Object> steps = new LinkedList<>();
    PsiElement element = assignment;
    for (PsiElement parent = element.getParent(); parent != null; parent = element.getParent()) {
      if (parent instanceof KtBlockExpression) {
        List<KtExpression> statements = ((KtBlockExpression) parent).getStatements();
        List<Object> level = new ArrayList<>();
        for (KtExpression statement : statements.subList(0, Math.max(0, statements.indexOf(element)))) {
          level.add(step(statement));
        }
        steps.addAll(0, level);
        if (!(parent.getParent() instanceof KtFunctionLiteral)) {
          element = parent;
          continue;
        }
        KtCallExpression host = host((KtFunctionLiteral) parent.getParent());
        if (host == null || !LOCKS.contains(nameOf(host.getCalleeExpression()))) {
          return steps;
        }
        steps.addFirst(m("lock", nameOf(host.getCalleeExpression())));
        element = host;
      } else if (parent instanceof KtDeclaration || parent instanceof KtFile) {
        return steps;
      } else {
        KtExpression header = header(parent, element);
        if (header != null) {
          steps.addFirst(step(header));
        }
        element = parent;
      }
    }
    return steps;
  }

  private static KtExpression header(PsiElement parent, PsiElement element) {
    KtExpression header = null;
    if (parent instanceof KtIfExpression) {
      header = ((KtIfExpression) parent).getCondition();
    } else if (parent instanceof KtWhileExpression) {
      header = ((KtWhileExpression) parent).getCondition();
    } else if (parent instanceof KtForExpression) {
      header = ((KtForExpression) parent).getLoopRange();
    } else if (parent instanceof KtWhenExpression) {
      header = ((KtWhenExpression) parent).getSubjectExpression();
    }
    return header == element ? null : header;
  }

  private static KtCallExpression host(KtFunctionLiteral literal) {
    PsiElement parent = literal.getParent().getParent();
    while (parent instanceof KtLabeledExpression || parent instanceof KtAnnotatedExpression
        || parent instanceof KtParenthesizedExpression) {
      parent = parent.getParent();
    }
    PsiElement call = parent instanceof KtLambdaArgument ? parent.getParent()
        : parent instanceof KtValueArgument ? parent.getParent().getParent() : null;
    return call instanceof KtCallExpression ? (KtCallExpression) call : null;
  }

  private static Map<String, Object> step(KtExpression statement) {
    ValueScan scan = new ValueScan();
    Map<String, Object> step = m();
    KtBinaryExpression own = null;
    if (statement instanceof KtProperty && ((KtProperty) statement).isLocal()) {
      step.put("local", ((KtProperty) statement).getName());
      if (((KtProperty) statement).getInitializer() != null) {
        scan.walk(((KtProperty) statement).getInitializer());
      }
    } else if (statement instanceof KtBinaryExpression
        && ValueScan.assignedName((KtBinaryExpression) statement) != null
        && ((KtBinaryExpression) statement).getRight() != null) {
      own = (KtBinaryExpression) statement;
      step.put("assign", ValueScan.assignedName(own));
      step.put("operator", own.getOperationReference().getText());
      scan.walk(own.getRight());
    } else {
      scan.walk(statement);
    }
    step.put("value", scan.items);
    step.put("writes", ValueScan.writes(statement, own));
    return step;
  }
}
