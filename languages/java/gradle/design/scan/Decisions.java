package nitpicker.designfacts.scan;

import com.sun.source.tree.*;
import java.util.*;
import nitpicker.designfacts.*;
import nitpicker.designfacts.model.*;
import nitpicker.designfacts.resolve.*;
import nitpicker.designfacts.scope.*;

public final class Decisions {
  public record Subject(String id, String text, TypeInfo enumType) {
    public boolean sameValue(Subject other) {
      return id.equals(other.id) && text.equals(other.text);
    }
  }

  public record Test(Subject subject, List<String> constants) {}

  public record Arms(List<List<String>> groups, boolean otherwise) {}

  private final Typer typer;
  private final Ctx ctx;
  private final Unit unit;

  public Decisions(Typer typer, Ctx ctx) {
    this.typer = typer;
    this.ctx = ctx;
    this.unit = ctx.unit;
  }

  public Subject subject(Tree expression) {
    Tree e = Names.unparen(expression);
    if (e instanceof LiteralTree) {
      return null;
    }
    Ty ty = typer.typeOf(e, ctx);
    if (ty.type() != null && ty.type().isEnum()) {
      return new Subject(ty.type().id, Names.compact(e), ty.type());
    }
    FieldInfo field = typer.fieldRef(e, ctx);
    return field == null
        ? null
        : new Subject(field.owner.id + "." + field.name, Names.compact(e), null);
  }

  private String constant(Tree expression, Subject subject, boolean bareNames) {
    Tree e = Names.unparen(expression);
    if (subject.enumType() != null) {
      return enumConstant(e, subject.enumType(), bareNames);
    }
    if (e instanceof UnaryTree unary
        && unary.getKind() == Tree.Kind.UNARY_MINUS
        && unary.getExpression() instanceof LiteralTree literal
        && literal.getValue() instanceof Number) {
      return "-" + literal.getValue();
    }
    if (e instanceof LiteralTree literal
        && literal.getValue() != null
        && !(literal.getValue() instanceof Boolean)) {
      return String.valueOf(literal.getValue());
    }
    return null;
  }

  private String enumConstant(Tree e, TypeInfo type, boolean bareNames) {
    if (e instanceof IdentifierTree identifier && bareNames) {
      String name = identifier.getName().toString();
      return type.cases.contains(name) && ctx.lookup(name) == null ? name : null;
    }
    if (e instanceof MemberSelectTree select
        && type.cases.contains(select.getIdentifier().toString())
        && typer.typeNameOf(select.getExpression(), ctx) == type) {
      return select.getIdentifier().toString();
    }
    return null;
  }

  private Test pair(Tree subjectSide, Tree constantSide) {
    Subject subject = subject(subjectSide);
    if (subject == null) {
      return null;
    }
    String constant = constant(constantSide, subject, false);
    return constant == null ? null : new Test(subject, List.of(constant));
  }

  private Test equality(Tree expression) {
    List<Tree> sides = sides(Names.unparen(expression));
    if (sides.isEmpty()) {
      return null;
    }
    Test forward = pair(sides.get(0), sides.get(1));
    return forward != null ? forward : pair(sides.get(1), sides.get(0));
  }

  private static List<Tree> sides(Tree e) {
    if (e instanceof BinaryTree binary && binary.getKind() == Tree.Kind.EQUAL_TO) {
      return List.of(binary.getLeftOperand(), binary.getRightOperand());
    }
    boolean equals =
        e instanceof MethodInvocationTree call
            && call.getMethodSelect() instanceof MemberSelectTree select
            && select.getIdentifier().contentEquals("equals");
    if (!equals) {
      return List.of();
    }
    MethodInvocationTree call = (MethodInvocationTree) e;
    Tree receiver = ((MemberSelectTree) call.getMethodSelect()).getExpression();
    List<? extends ExpressionTree> arguments = call.getArguments();
    if (arguments.size() == 1) {
      return List.of(receiver, arguments.get(0));
    }
    boolean objects = arguments.size() == 2 && receiver.toString().equals("Objects");
    return objects ? List.of(arguments.get(0), arguments.get(1)) : List.of();
  }

  public Test test(Tree condition, Set<Tree> consumed) {
    List<Tree> operands = new ArrayList<>();
    flatten(Names.unparen(condition), operands, consumed);
    Test merged = null;
    for (Tree operand : operands) {
      Test next = equality(operand);
      if (next == null || (merged != null && !merged.subject().sameValue(next.subject()))) {
        return null;
      }
      List<String> constants = new ArrayList<>(merged == null ? List.of() : merged.constants());
      constants.addAll(next.constants());
      merged = new Test(next.subject(), constants);
    }
    return merged;
  }

  private static void flatten(Tree tree, List<Tree> operands, Set<Tree> consumed) {
    Deque<Tree> work = new ArrayDeque<>(List.of(tree));
    while (!work.isEmpty()) {
      Tree current = Names.unparen(work.pollLast());
      if (current instanceof BinaryTree binary && binary.getKind() == Tree.Kind.CONDITIONAL_OR) {
        consumed.add(current);
        work.addLast(binary.getRightOperand());
        work.addLast(binary.getLeftOperand());
      } else {
        operands.add(current);
      }
    }
  }

  public List<Map<String, Object>> chain(IfTree head, Set<Tree> tails, Set<Tree> consumed) {
    List<IfTree> elements = elements(head, tails);
    List<Test> tests =
        elements.stream().map(element -> test(element.getCondition(), consumed)).toList();
    boolean otherwise = elements.get(elements.size() - 1).getElseStatement() != null;
    List<Map<String, Object>> found = new ArrayList<>();
    int index = 0;
    while (index < tests.size()) {
      boolean decided = tests.get(index) != null;
      int end = decided ? runEnd(tests, index) : index + 1;
      if (decided) {
        boolean last = end == tests.size() && otherwise;
        found.add(run(tests.subList(index, end), last, unit.line(elements.get(index))));
      }
      index = end;
    }
    return found;
  }

  private static List<IfTree> elements(IfTree head, Set<Tree> tails) {
    List<IfTree> elements = new ArrayList<>(List.of(head));
    Tree tail = head.getElseStatement();
    while (tail instanceof IfTree next) {
      elements.add(next);
      tails.add(next);
      tail = next.getElseStatement();
    }
    return elements;
  }

  private static Map<String, Object> run(List<Test> tests, boolean otherwise, int line) {
    List<List<String>> groups = new ArrayList<>();
    tests.forEach(next -> groups.add(next.constants()));
    return decision(tests.get(0).subject(), new Arms(groups, otherwise), line);
  }

  private static int runEnd(List<Test> tests, int start) {
    Subject subject = tests.get(start).subject();
    int end = start + 1;
    while (end < tests.size()
        && tests.get(end) != null
        && tests.get(end).subject().sameValue(subject)) {
      end++;
    }
    return end;
  }

  public Map<String, Object> disjunction(BinaryTree tree, Set<Tree> consumed) {
    Test test = test(tree, consumed);
    if (test == null || test.constants().size() < 2) {
      return null;
    }
    return decision(test.subject(), new Arms(List.of(test.constants()), false), unit.line(tree));
  }

  public Map<String, Object> selection(Tree selector, List<? extends CaseTree> cases, int line) {
    Subject subject = subject(selector);
    if (subject == null) {
      return null;
    }
    Grouping grouping = new Grouping(subject);
    for (CaseTree entry : cases) {
      if (!grouping.add(entry)) {
        return null;
      }
    }
    return decision(subject, grouping.finish(), line);
  }

  private final class Grouping {
    private final Subject subject;
    private final List<List<String>> groups = new ArrayList<>();
    private List<String> pending = new ArrayList<>();
    private boolean otherwise;

    private Grouping(Subject subject) {
      this.subject = subject;
    }

    private boolean add(CaseTree entry) {
      otherwise |= entry.getLabels().isEmpty();
      for (CaseLabelTree label : entry.getLabels()) {
        if (!addLabel(label)) {
          return false;
        }
      }
      boolean closes =
          entry.getCaseKind() == CaseTree.CaseKind.RULE || !entry.getStatements().isEmpty();
      if (closes && !pending.isEmpty()) {
        groups.add(pending);
        pending = new ArrayList<>();
      }
      return true;
    }

    private boolean addLabel(CaseLabelTree label) {
      if (label instanceof DefaultCaseLabelTree) {
        otherwise = true;
        return true;
      }
      String constant =
          label instanceof ConstantCaseLabelTree constantLabel
              ? labelText(constantLabel.getConstantExpression(), subject)
              : null;
      if (constant != null) {
        pending.add(constant);
      }
      return constant != null;
    }

    private Arms finish() {
      if (!pending.isEmpty()) {
        groups.add(pending);
      }
      return new Arms(groups, otherwise);
    }
  }

  private String labelText(Tree expression, Subject subject) {
    Tree e = Names.unparen(expression);
    if (e instanceof LiteralTree literal && literal.getValue() == null) {
      return "null";
    }
    return constant(e, subject, true);
  }

  private static Map<String, Object> decision(Subject subject, Arms arms, int line) {
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("subject", subject.id());
    map.put("groups", arms.groups());
    map.put("line", line);
    map.put("otherwise", arms.otherwise() ? Boolean.TRUE : null);
    return map;
  }
}
