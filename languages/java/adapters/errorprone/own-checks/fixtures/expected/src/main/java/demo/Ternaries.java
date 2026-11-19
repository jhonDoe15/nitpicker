package demo;

public class Ternaries {
  boolean orForm(boolean ready, boolean late) {
    return ready || late;
  }

  boolean negatedAnd(boolean ready, boolean late) {
    return !ready && late;
  }

  boolean negatedOr(boolean ready, boolean late) {
    return !ready || late;
  }

  boolean andForm(boolean ready, boolean late) {
    return ready && late;
  }

  boolean comparison(int count, boolean late) {
    return count > 0 || late;
  }

  boolean lowerCondition(boolean first, boolean second, boolean third) {
    return (first || second) && third;
  }

  boolean negatedLowerCondition(boolean first, boolean second, boolean third) {
    return !(first || second) && third;
  }

  boolean lowerOperand(boolean first, boolean second, boolean third) {
    return !first && (second || third);
  }

  boolean nestedTernary(boolean first, boolean second, boolean third, boolean fourth) {
    return first || (second ? third : fourth);
  }

  boolean bothLiterals(boolean ready) {
    return ready;
  }

  boolean bothLiteralsNegated(boolean ready) {
    return !ready;
  }

  boolean insideNegation(boolean first, boolean second) {
    return !(first || second);
  }

  boolean sameLiterals(boolean ready) {
    return ready ? true : true;
  }

  boolean boxedBranch(boolean ready, Boolean late) {
    return ready ? true : late;
  }

  boolean commentInside(boolean ready, boolean late) {
    return ready ? true /* kept */ : late;
  }

  Object mixedBranches(boolean ready, String name) {
    return ready ? true : name;
  }

  boolean negatedOrHead(boolean first, boolean second, boolean third) {
    return (first || second) && third;
  }

  boolean negatedTernaryHead(boolean first, boolean second, boolean third, boolean fourth) {
    return (first ? second : third) && fourth;
  }

  boolean negatedAssignmentHead(boolean first, boolean second, boolean third) {
    return (first = second) && third;
  }

  boolean boxedCondition(Boolean ready) {
    return ready ? true : false;
  }

  boolean boxedConditionNegated(Boolean ready) {
    return ready ? false : true;
  }
}
