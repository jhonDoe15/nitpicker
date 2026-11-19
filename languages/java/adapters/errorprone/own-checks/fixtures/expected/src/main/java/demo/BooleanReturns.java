package demo;

import java.util.function.IntPredicate;

public class BooleanReturns {
  boolean elseArms(int count) {
    return count > 0;
  }

  boolean sequence(String name) {
    return name == null;
  }

  boolean negatedArms(int count) {
    return !(count > 3);
  }

  boolean negatedSequence(boolean first, boolean second) {
    return !(first || second);
  }

  boolean negatedComparison(int left, int right) {
    return !(left < right);
  }

  boolean doubleNegation(boolean ready) {
    return ready;
  }

  Boolean boxedResult(int count) {
    if (count > 0) {
      return true;
    } else {
      return false;
    }
  }

  boolean commentInArm(int count) {
    if (count > 0) {
      return true; // positive
    } else {
      return false;
    }
  }

  boolean commentBetween(int count) {
    if (count > 0) return true;
    // otherwise
    return false;
  }

  boolean otherValue(int count, boolean late) {
    if (count > 0) return true;
    return late;
  }

  boolean sameValues(int count) {
    if (count > 0) {
      return true;
    } else {
      return true;
    }
  }

  IntPredicate inLambda() {
    return count -> {
      if (count > 0) {
        return true;
      }
      return false;
    };
  }
}
