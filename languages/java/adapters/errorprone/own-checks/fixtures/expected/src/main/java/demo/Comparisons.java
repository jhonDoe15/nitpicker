package demo;

public class Comparisons {
  boolean equalsTrue(boolean ready) {
    return ready;
  }

  boolean notEqualsFalse(boolean ready) {
    return ready;
  }

  boolean equalsFalse(boolean ready) {
    return !ready;
  }

  boolean notEqualsTrue(boolean ready) {
    return !ready;
  }

  boolean literalFirst(boolean ready, boolean late) {
    return ready && !late;
  }

  boolean negatedComparison(int left, int right) {
    return !(left < right);
  }

  boolean negatedParenthesized(boolean first, boolean second) {
    return !(first || second);
  }

  boolean lowerOperand(boolean first, boolean second) {
    return first || !second;
  }

  boolean negatedNegation(boolean ready) {
    return !!ready;
  }

  boolean boxedLeft(Boolean ready) {
    return ready == true;
  }

  boolean boxedRight(Boolean ready) {
    return false != ready;
  }

  boolean commentInside(boolean ready) {
    return ready == /* explicit */ true;
  }

  boolean otherComparisons(int left, int right) {
    return left == right;
  }
}
