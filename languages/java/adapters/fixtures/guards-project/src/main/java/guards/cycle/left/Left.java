package guards.cycle.left; // file violation: coupling/package-cycle

import guards.cycle.right.Right;

public final class Left {
  public int value() {
    return new Right().base() + 1;
  }

  public int base() {
    return 1;
  }
}
