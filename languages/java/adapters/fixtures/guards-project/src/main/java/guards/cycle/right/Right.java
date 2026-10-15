package guards.cycle.right; // file violation: coupling/package-cycle

import guards.cycle.left.Left;

public final class Right {
  public int base() {
    return 2;
  }

  public int value() {
    return new Left().base() + 2;
  }
}
