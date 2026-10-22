package nitpicker.designfacts;

import com.sun.source.tree.*;
import java.util.*;

final class Decisions {
  record Subject(String id, String text, TypeInfo enumType) {
    boolean sameValue(Subject other) {
      return id.equals(other.id) && text.equals(other.text);
    }
  }

  record Test(Subject subject, List<String> constants) {}

  private final Typer typer;
  private final Ctx ctx;
  private final Unit unit;

  Decisions(Typer typer, Ctx ctx) {
    this.typer = typer;
    this.ctx = ctx;
    this.unit = ctx.unit;
  }

  Subject subject(Tree expression) {
    Tree e = Names.unparen(expression);
    if (e instanceof LiteralTree) {
      return null;
    }
    Ty ty = typer.typeOf(e, ctx);
    if (ty.type() != null && ty.type().isEnum()) {
      return new Subject(ty.type().id, Names.compact(e), ty.type());
    }
    FieldInfo field = typer.fieldRef(e, ctx);
    return field == null ? null : new Subject(field.owner.id + "." + field.name, Names.compact(e), null);
  }

  private String constant(Tree expression, Subject subject, boolean bareNames) {
    Tree e = Names.unparen(expression);
    if (subject.enumType() != null) {
      return enumConstant(e, subject.enumType(), bareNames);
    }
    if (e instanceof UnaryTree unary && unary.getKind() == Tree.Kind.UNARY_MINUS
        && unary.getExpression() instanceof LiteralTree literal && literal.getValue() instanceof Number) {
      return "-" + literal.getValue();
    }
    if (e instanceof LiteralTree literal && literal.getValue() != null
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
    if (e instanceof MemberSelectTree select && type.cases.contains(select.getIdentifier().toString())
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
    Tree e = Names.unparen(expression);
    Tree left = null;
    Tree right = null;
    if (e instanceof BinaryTree binary && binary.getKind() == Tree.Kind.EQUAL_TO) {
      left = binary.getLeftOperand();
      right = binary.getRightOperand();
    } else if (e instanceof MethodInvocationTree call && call.getMethodSelect() instanceof MemberSelectTree select
        && select.getIdentifier().contentEquals("equals")) {
      if (call.getArguments().size() == 1) {
        left = select.getExpression();
        right = call.getArguments().get(0);
      } else if (call.getArguments().size() == 2 && select.getExpression().toString().equals("Objects")) {
        left = call.getArguments().get(0);
        right = call.getArguments().get(1);
      }
    }
    if (left == null) {
      return null;
    }
    Test forward = pair(left, right);
    return forward != null ? forward : pair(right, left);
  }

  Test test(Tree condition, Set<Tree> consumed) {
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

  List<Map<String, Object>> chain(IfTree head, Set<Tree> tails, Set<Tree> consumed) {
    List<IfTree> elements = new ArrayList<>(List.of(head));
    Tree tail = head.getElseStatement();
    while (tail instanceof IfTree next) {
      elements.add(next);
      tails.add(next);
      tail = next.getElseStatement();
    }
    List<Map<String, Object>> found = new ArrayList<>();
    int index = 0;
    while (index < elements.size()) {
      Test first = test(elements.get(index).getCondition(), consumed);
      if (first == null) {
        index++;
        continue;
      }
      List<List<String>> groups = new ArrayList<>(List.of(first.constants()));
      int end = index + 1;
      while (end < elements.size()) {
        Test next = test(elements.get(end).getCondition(), consumed);
        if (next == null || !next.subject().sameValue(first.subject())) {
          break;
        }
        groups.add(next.constants());
        end++;
      }
      boolean otherwise = end == elements.size() && tail != null;
      found.add(decision(first.subject(), groups, unit.line(elements.get(index)), otherwise));
      index = end;
    }
    return found;
  }

  Map<String, Object> disjunction(BinaryTree tree, Set<Tree> consumed) {
    Test test = test(tree, consumed);
    if (test == null || test.constants().size() < 2) {
      return null;
    }
    return decision(test.subject(), List.of(test.constants()), unit.line(tree), false);
  }

  Map<String, Object> selection(Tree selector, List<? extends CaseTree> cases, int line) {
    Subject subject = subject(selector);
    if (subject == null) {
      return null;
    }
    List<List<String>> groups = new ArrayList<>();
    List<String> pending = new ArrayList<>();
    boolean otherwise = false;
    for (CaseTree entry : cases) {
      if (entry.getLabels().isEmpty()) {
        otherwise = true;
      }
      for (CaseLabelTree label : entry.getLabels()) {
        if (label instanceof DefaultCaseLabelTree) {
          otherwise = true;
        } else if (label instanceof ConstantCaseLabelTree constantLabel) {
          String constant = labelText(constantLabel.getConstantExpression(), subject);
          if (constant == null) {
            return null;
          }
          pending.add(constant);
        } else {
          return null;
        }
      }
      boolean closes = entry.getCaseKind() == CaseTree.CaseKind.RULE || !entry.getStatements().isEmpty();
      if (closes && !pending.isEmpty()) {
        groups.add(pending);
        pending = new ArrayList<>();
      }
    }
    if (!pending.isEmpty()) {
      groups.add(pending);
    }
    return decision(subject, groups, line, otherwise);
  }

  private String labelText(Tree expression, Subject subject) {
    Tree e = Names.unparen(expression);
    if (e instanceof LiteralTree literal && literal.getValue() == null) {
      return "null";
    }
    return constant(e, subject, true);
  }

  private static Map<String, Object> decision(Subject subject, List<List<String>> groups, int line, boolean otherwise) {
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("subject", subject.id());
    map.put("groups", groups);
    map.put("line", line);
    map.put("otherwise", otherwise ? Boolean.TRUE : null);
    return map;
  }
}
