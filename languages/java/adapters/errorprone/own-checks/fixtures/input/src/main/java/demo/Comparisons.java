package demo;

public class Comparisons {
  boolean equalsTrue(boolean ready) {
    return ready == true;
  }

  boolean notEqualsFalse(boolean ready) {
    return ready != false;
  }

  boolean equalsFalse(boolean ready) {
    return ready == false;
  }

  boolean notEqualsTrue(boolean ready) {
    return ready != true;
  }

  boolean literalFirst(boolean ready, boolean late) {
    return true == ready && false == late;
  }

  boolean negatedComparison(int left, int right) {
    return left < right == false;
  }

  boolean negatedParenthesized(boolean first, boolean second) {
    return (first || second) == false;
  }

  boolean lowerOperand(boolean first, boolean second) {
    return first || second == false;
  }

  boolean negatedNegation(boolean ready) {
    return !ready == false;
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
