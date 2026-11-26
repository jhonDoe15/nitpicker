package e;

import java.util.List;

public class B4Bool {
  boolean noField = true;

  void m(boolean noParam, List<Boolean> list) {
    boolean noThing = false;
    boolean notThing = true, fine = false, noOther = true;
    boolean normal = true;
    boolean nope = false;
    boolean no = true;
    boolean not = true;
    boolean nOpe = true;
    boolean noX[] = {true};
    Boolean noBoxed = true;
    var noVar = true;
    var noInt = 1;
    for (boolean noLoop = false; noLoop; ) {}
    for (boolean noEach : new boolean[] {true}) {}
    for (Boolean noEachBoxed : list) {}
    try {
      throw new RuntimeException();
    } catch (RuntimeException noCatch) {
    }
    Runnable r = () -> {
      boolean noInLambda = true;
    };
    @SuppressWarnings("NegativeBoolean")
    boolean noSuppressed = true;
  }

  @SuppressWarnings("NegativeBoolean")
  void suppressed() {
    boolean noInSuppressed = true;
  }
}
