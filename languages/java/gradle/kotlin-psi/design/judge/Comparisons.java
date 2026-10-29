package nitpicker.kotlinpsi.design.judge;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.model.Kinds;
import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.model.Prop;
import nitpicker.kotlinpsi.design.model.Ty;
import nitpicker.kotlinpsi.design.resolve.Binding;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.KtNodeTypes;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

public final class Comparisons {
  private static final Set<String> COLLECTIONS =
      Set.of("setOf", "listOf", "arrayOf", "hashSetOf", "linkedSetOf", "mutableSetOf", "mutableListOf");

  public static final class Subject {
    public final String id;
    public final Owner enumOwner;

    public Subject(String id, Owner enumOwner) {
      this.id = id;
      this.enumOwner = enumOwner;
    }
  }

  public static final class Equality {
    public final KtExpression subject;
    public final List<String> constants;

    public Equality(KtExpression subject, List<String> constants) {
      this.subject = subject;
      this.constants = constants;
    }
  }

  private final Ctx ctx;

  public Comparisons(Ctx ctx) {
    this.ctx = ctx;
  }

  public Equality equality(KtExpression condition) {
    KtExpression e = Ps.parens(condition);
    if (e instanceof KtBinaryExpression) {
      return binary((KtBinaryExpression) e);
    }
    if (e instanceof KtDotQualifiedExpression) {
      return equalsCall((KtDotQualifiedExpression) e);
    }
    return null;
  }

  private Equality binary(KtBinaryExpression binary) {
    Object token = binary.getOperationToken();
    if (token == KtTokens.OROR) {
      return merged(equality(binary.getLeft()), equality(binary.getRight()));
    }
    if (token == KtTokens.EQEQ || token == KtTokens.EQEQEQ) {
      return compare(binary.getLeft(), binary.getRight());
    }
    if (token != KtTokens.IN_KEYWORD) {
      return null;
    }
    List<String> constants = collection(binary.getRight(), null);
    return constants == null ? null : new Equality(binary.getLeft(), constants);
  }

  private Equality equalsCall(KtDotQualifiedExpression dot) {
    if (!(dot.getSelectorExpression() instanceof KtCallExpression)) {
      return null;
    }
    KtCallExpression call = (KtCallExpression) dot.getSelectorExpression();
    if (!"equals".equals(Ps.name(call)) || call.getValueArguments().size() != 1) {
      return null;
    }
    return compare(dot.getReceiverExpression(), call.getValueArguments().get(0).getArgumentExpression());
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

  public List<String> collection(KtExpression expression, Subject subject) {
    KtExpression e = Ps.parens(expression);
    if (!(e instanceof KtCallExpression) || !COLLECTIONS.contains(Ps.name((KtCallExpression) e))) {
      return null;
    }
    List<String> constants = new ArrayList<>();
    for (ValueArgument argument : ((KtCallExpression) e).getValueArguments()) {
      KtExpression value = argument.getArgumentExpression();
      String constant = value == null ? null : constant(value, subject);
      if (constant == null) {
        return null;
      }
      constants.add(constant);
    }
    return constants.isEmpty() ? null : constants;
  }

  public String normalized(KtExpression expression) {
    return expression == null ? "" : Ps.strip(expression).getText().replaceAll("\\s+", "");
  }

  public Subject subject(KtExpression expression) {
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

  public String constant(KtExpression expression, Subject subject) {
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
      KtExpression selector = ((KtDotQualifiedExpression) e).getSelectorExpression();
      String name = ((KtNameReferenceExpression) selector).getReferencedName();
      boolean fits = owner != null && owner.cases.contains(name)
          && (subject == null || subject.enumOwner == null || subject.enumOwner == owner);
      return fits ? name : null;
    }
    return null;
  }
}
