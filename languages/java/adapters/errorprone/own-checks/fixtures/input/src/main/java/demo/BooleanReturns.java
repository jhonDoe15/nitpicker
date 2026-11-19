package demo;

import java.util.function.IntPredicate;

public class BooleanReturns {
  boolean elseArms(int count) {
    if (count > 0) {
      return true;
    } else {
      return false;
    }
  }

  boolean sequence(String name) {
    if (name == null) return true;
    return false;
  }

  boolean negatedArms(int count) {
    if (count > 3) {
      return false;
    } else {
      return true;
    }
  }

  boolean negatedSequence(boolean first, boolean second) {
    if (first || second) return false;
    return true;
  }

  boolean negatedComparison(int left, int right) {
    if (left < right) {
      return false;
    }
    return true;
  }

  boolean doubleNegation(boolean ready) {
    if (!ready) {
      return false;
    }
    return true;
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
