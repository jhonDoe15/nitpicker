package demo;

import java.util.List;

public class Banned {
  public boolean empty(List<String> items) {
    if (items.isEmpty()) { // violation: SimplifyBooleanReturns
      return true;
    }
    return false;
  }

  public boolean present(String name) {
    if (name == null) { // violation: SimplifyBooleanReturns
      return false;
    }
    return name.isBlank();
  }

  public boolean flagged(boolean active) {
    return active == true; // violation: SimplifyBooleanExpressions
  }

  public boolean unset(boolean active) {
    return active != true; // violation: SimplifyBooleanExpressions
  }

  public boolean either(boolean first, boolean second) {
    return first ? true : second; // violation: SimplifiedTernary
  }

  public boolean literal(boolean first) {
    return first ? false : true; // violation: SimplifiedTernary
  }

  public boolean text(Object value) {
    return value != null && value instanceof String; // violation: SimplifyConditional
  }

  public int nested(int count, boolean ready) {
    if (count > 0) {
      if (ready) { // violation: CollapsibleIfStatements
        return count;
      }
    }
    return 0;
  }

  public boolean differs(int left, int right) {
    return !(left == right); // violation: LogicInversion
  }

  public boolean before(int left, int right) {
    return !(left < right); // violation: LogicInversion
  }

  public String swapped(boolean ready) {
    if (!ready) { // violation: ConfusingTernary
      return "wait";
    } else {
      return "go";
    }
  }

  public String picked(boolean ready) {
    return !ready ? "wait" : "go"; // violation: ConfusingTernary
  }

  public boolean neither(boolean first, boolean second) {
    return !first && !second; // violation: NegatedOperands
  }

  public boolean notAll(boolean first, boolean second, boolean third) {
    return !first || (!second || !third); // violation: NegatedOperands
  }
}
