package nitpicker.kotlinpsi.design;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.jetbrains.kotlin.KtNodeTypes;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

final class Decisions {
  private static final Set<String> COLLECTIONS =
      Set.of("setOf", "listOf", "arrayOf", "hashSetOf", "linkedSetOf", "mutableSetOf", "mutableListOf");

  private static final class Subject {
    final String id;
    final Owner enumOwner;

    Subject(String id, Owner enumOwner) {
      this.id = id;
      this.enumOwner = enumOwner;
    }
  }

  private static final class Equality {
    final KtExpression subject;
    final List<String> constants;

    Equality(KtExpression subject, List<String> constants) {
      this.subject = subject;
      this.constants = constants;
    }
  }

  private final Ctx ctx;
  private final Fun function;
  private final Source source;
  private final List<Object> facts = new ArrayList<>();
  private final Set<KtIfExpression> consumed = new HashSet<>();

  Decisions(Ctx ctx, Fun function) {
    this.ctx = ctx;
    this.function = function;
    this.source = function.owner.source;
  }

  List<Object> run() {
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

  private void emit(PsiElement node, Subject subject, List<List<String>> groups, boolean otherwise) {
    boolean wide = groups.stream().anyMatch(group -> group.size() > 1);
    if (groups.isEmpty() || !(otherwise || groups.size() > 1 || wide)) {
      return;
    }
    List<Object> listed = new ArrayList<>();
    for (List<String> group : groups) {
      listed.add(new ArrayList<Object>(group));
    }
    facts.add(m("subject", subject.id, "groups", listed, "line", source.line(node), "otherwise", otherwise ? Boolean.TRUE : null));
  }

  private void when(KtWhenExpression when) {
    KtExpression subjectExpression = when.getSubjectExpression();
    Subject fixed = subjectExpression == null ? null : subject(subjectExpression);
    if (subjectExpression != null && fixed == null) {
      return;
    }
    List<List<String>> groups = new ArrayList<>();
    boolean otherwise = false;
    String text = null;
    Subject subject = fixed;
    for (KtWhenEntry entry : when.getEntries()) {
      if (entry.isElse()) {
        otherwise = true;
        continue;
      }
      List<String> constants = new ArrayList<>();
      for (KtWhenCondition condition : entry.getConditions()) {
        Equality found = fixed == null ? subjectLess(condition) : forSubject(condition, fixed);
        if (found == null) {
          return;
        }
        if (fixed == null) {
          String current = normalized(found.subject);
          if (text != null && !text.equals(current)) {
            return;
          }
          text = current;
          subject = subject != null ? subject : subject(found.subject);
          if (subject == null) {
            return;
          }
        }
        constants.addAll(found.constants);
      }
      groups.add(constants);
    }
    if (subject != null) {
      emit(when, subject, groups, otherwise);
    }
  }

  private Equality subjectLess(KtWhenCondition condition) {
    return condition instanceof KtWhenConditionWithExpression
        ? equality(((KtWhenConditionWithExpression) condition).getExpression())
        : null;
  }

  private Equality forSubject(KtWhenCondition condition, Subject subject) {
    if (condition instanceof KtWhenConditionWithExpression) {
      String constant = constant(((KtWhenConditionWithExpression) condition).getExpression(), subject);
      return constant == null ? null : new Equality(null, List.of(constant));
    }
    if (condition instanceof KtWhenConditionInRange && !((KtWhenConditionInRange) condition).isNegated()) {
      List<String> constants = collection(((KtWhenConditionInRange) condition).getRangeExpression(), subject);
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
    List<List<String>> groups = new ArrayList<>();
    boolean otherwise = false;
    String text = null;
    Subject subject = null;
    KtIfExpression current = head;
    while (current != null) {
      Equality found = equality(current.getCondition());
      String currentText = found == null ? null : normalized(found.subject);
      if (found == null || text != null && !text.equals(currentText)) {
        if (current == head) {
          return;
        }
        otherwise = true;
        break;
      }
      consumed.add(current);
      if (subject == null) {
        subject = subject(found.subject);
        if (subject == null) {
          consumed.remove(current);
          return;
        }
        text = currentText;
      }
      groups.add(found.constants);
      KtExpression next = Ps.parens(current.getElse());
      if (next == null) {
        break;
      }
      if (next instanceof KtIfExpression) {
        current = (KtIfExpression) next;
      } else {
        otherwise = true;
        break;
      }
    }
    emit(head, subject, groups, otherwise);
  }

  private Equality equality(KtExpression condition) {
    KtExpression e = Ps.parens(condition);
    if (e instanceof KtBinaryExpression) {
      KtBinaryExpression binary = (KtBinaryExpression) e;
      Object token = binary.getOperationToken();
      if (token == KtTokens.OROR) {
        return merged(equality(binary.getLeft()), equality(binary.getRight()));
      }
      if (token == KtTokens.EQEQ || token == KtTokens.EQEQEQ) {
        return compare(binary.getLeft(), binary.getRight());
      }
      if (token == KtTokens.IN_KEYWORD) {
        List<String> constants = collection(binary.getRight(), null);
        return constants == null ? null : new Equality(binary.getLeft(), constants);
      }
    }
    if (e instanceof KtDotQualifiedExpression
        && ((KtDotQualifiedExpression) e).getSelectorExpression() instanceof KtCallExpression) {
      KtCallExpression call = (KtCallExpression) ((KtDotQualifiedExpression) e).getSelectorExpression();
      if ("equals".equals(Ps.name(call)) && call.getValueArguments().size() == 1) {
        return compare(((KtDotQualifiedExpression) e).getReceiverExpression(),
            call.getValueArguments().get(0).getArgumentExpression());
      }
    }
    return null;
  }

  private Equality merged(Equality left, Equality right) {
    if (left == null || right == null || !normalized(left.subject).equals(normalized(right.subject))) {
      return null;
    }
    List<String> constants = new ArrayList<>(left.constants);
    constants.addAll(right.constants);
    return new Equality(left.subject, constants);
  }

  private Equality compare(KtExpression left, KtExpression right) {
    String onRight = constant(right, null);
    if (onRight != null) {
      return constant(left, null) != null ? null : new Equality(left, List.of(onRight));
    }
    String onLeft = constant(left, null);
    return onLeft == null ? null : new Equality(right, List.of(onLeft));
  }

  private List<String> collection(KtExpression expression, Subject subject) {
    KtExpression e = Ps.parens(expression);
    if (!(e instanceof KtCallExpression) || !COLLECTIONS.contains(Ps.name((KtCallExpression) e))) {
      return null;
    }
    List<String> constants = new ArrayList<>();
    for (ValueArgument argument : ((KtCallExpression) e).getValueArguments()) {
      String constant = argument.getArgumentExpression() == null ? null : constant(argument.getArgumentExpression(), subject);
      if (constant == null) {
        return null;
      }
      constants.add(constant);
    }
    return constants.isEmpty() ? null : constants;
  }

  private String normalized(KtExpression expression) {
    return expression == null ? "" : Ps.strip(expression).getText().replaceAll("\\s+", "");
  }

  private Subject subject(KtExpression expression) {
    KtExpression e = Ps.strip(expression);
    Ty type = ctx.typer.typeOf(e);
    if (type.project() && type.owner.listed && Kinds.of(type.owner).equals("enum")) {
      return new Subject(type.owner.id, type.owner);
    }
    Prop prop = fieldOf(e);
    if (prop != null && prop.owner.listed && prop.field) {
      return new Subject(prop.owner.id + "." + prop.name, null);
    }
    return null;
  }

  private Prop fieldOf(KtExpression e) {
    if (e instanceof KtNameReferenceExpression) {
      Binding binding = ctx.bindings.bind((KtNameReferenceExpression) e);
      return binding.kind == Binding.Kind.FIELD && !binding.receiver ? binding.prop : null;
    }
    if (e instanceof KtDotQualifiedExpression
        && ((KtDotQualifiedExpression) e).getSelectorExpression() instanceof KtNameReferenceExpression) {
      KtDotQualifiedExpression q = (KtDotQualifiedExpression) e;
      Ty receiver = ctx.typer.typeOf(q.getReceiverExpression());
      String name = ((KtNameReferenceExpression) q.getSelectorExpression()).getReferencedName();
      return receiver.project() ? ctx.members.prop(receiver.owner, name) : null;
    }
    return null;
  }

  private String constant(KtExpression expression, Subject subject) {
    KtExpression e = Ps.parens(expression);
    if (e instanceof KtConstantExpression) {
      return literal((KtConstantExpression) e);
    }
    if (e instanceof KtPrefixExpression && ((KtPrefixExpression) e).getOperationToken() == KtTokens.MINUS
        && Ps.parens(((KtPrefixExpression) e).getBaseExpression()) instanceof KtConstantExpression) {
      String inner = literal((KtConstantExpression) Ps.parens(((KtPrefixExpression) e).getBaseExpression()));
      return inner == null ? null : "-" + inner;
    }
    if (e instanceof KtStringTemplateExpression) {
      return string((KtStringTemplateExpression) e);
    }
    return entry(e, subject);
  }

  private String literal(KtConstantExpression e) {
    Object type = e.getNode().getElementType();
    if (type == KtNodeTypes.NULL) {
      return null;
    }
    String text = e.getText().replace("_", "");
    if (type == KtNodeTypes.CHARACTER_CONSTANT) {
      return text.length() >= 2 ? text.substring(1, text.length() - 1) : text;
    }
    return text;
  }

  private String string(KtStringTemplateExpression e) {
    StringBuilder out = new StringBuilder();
    for (KtStringTemplateEntry entry : e.getEntries()) {
      if (entry instanceof KtLiteralStringTemplateEntry) {
        out.append(entry.getText());
      } else if (entry instanceof KtEscapeStringTemplateEntry) {
        out.append(((KtEscapeStringTemplateEntry) entry).getUnescapedValue());
      } else {
        return null;
      }
    }
    return out.toString();
  }

  private String entry(KtExpression e, Subject subject) {
    if (e instanceof KtNameReferenceExpression) {
      String name = ((KtNameReferenceExpression) e).getReferencedName();
      if (subject != null && subject.enumOwner != null && subject.enumOwner.cases.contains(name)) {
        return name;
      }
      Binding binding = ctx.bindings.bind((KtNameReferenceExpression) e);
      boolean object = binding.kind == Binding.Kind.TYPE && binding.owner.caseOf != null;
      return object && (subject == null || subject.enumOwner == binding.owner.caseOf) ? name : null;
    }
    if (e instanceof KtDotQualifiedExpression
        && ((KtDotQualifiedExpression) e).getSelectorExpression() instanceof KtNameReferenceExpression) {
      Owner owner = ctx.typer.staticOwner(((KtDotQualifiedExpression) e).getReceiverExpression());
      String name = ((KtNameReferenceExpression) ((KtDotQualifiedExpression) e).getSelectorExpression()).getReferencedName();
      boolean fits = owner != null && owner.cases.contains(name)
          && (subject == null || subject.enumOwner == null || subject.enumOwner == owner);
      return fits ? name : null;
    }
    return null;
  }
}
