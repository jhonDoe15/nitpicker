package shop.countdown;

import java.util.List;

public final class Countdowns {
  public int newestFirst(List<Integer> amounts) {
    int total = 0;
    for (int i = amounts.size() - 1; i > 0; i++) { // violation: LoopUpdateAwayFromExit
      total += amounts.get(i);
    }
    return total;
  }

  public int upwards(int[] amounts, int n) {
    int total = 0;
    for (int i = 0; i < n; i--) { // violation: LoopUpdateAwayFromExit
      total += amounts[i];
    }
    return total;
  }

  public int wrongSide(List<Integer> amounts) {
    int total = 0;
    for (int i = amounts.size() - 1; i <= 0; i--) { // violation: LoopUpdateAwayFromExit
      total += amounts.get(i);
    }
    return total;
  }

  public int stepped(int[] amounts) {
    int total = 0;
    for (int i = amounts.length - 1; i >= 0; i += 2) { // violation: LoopUpdateAwayFromExit
      total += amounts[i];
    }
    return total;
  }

  public int prefixForm(int[] amounts) {
    int total = 0;
    for (int i = amounts.length; 0 < i; ++i) { // violation: LoopUpdateAwayFromExit
      total += amounts[i - 1];
    }
    return total;
  }

  public int correctCountdown(List<Integer> amounts) {
    int total = 0;
    for (int i = amounts.size() - 1; i >= 0; i--) {
      total += amounts.get(i);
    }
    return total;
  }

  public int correctCountUp(int[] amounts) {
    int total = 0;
    for (int i = 0; i < amounts.length; i++) {
      total += amounts[i];
    }
    return total;
  }

  public int leavesOnBreak(List<Integer> amounts) {
    int total = 0;
    for (int i = amounts.size() - 1; i > 0; i++) {
      if (amounts.get(i) == null) {
        break;
      }
      total += amounts.get(i);
    }
    return total;
  }

  public int wrapsAround() {
    int count = 0;
    for (byte b = 1; b > 0; b++) {
      count++;
    }
    return count;
  }

  public int movedInBody(int[] amounts) {
    int total = 0;
    for (int i = 0; i < amounts.length; i--) {
      total += amounts[i];
      i += 2;
    }
    return total;
  }

  public int signedStep(int[] amounts) {
    int total = 0;
    for (int i = amounts.length - 1; i >= 0; i -= -1) { // violation: LoopUpdateAwayFromExit
      total += amounts[i];
    }
    for (int i = 0; i < amounts.length; i -= -1) {
      total += amounts[i];
    }
    for (int i = 0; i < amounts.length; i += -1) { // violation: LoopUpdateAwayFromExit
      total += amounts[i];
    }
    return total;
  }
}
