package s26pkg;

import com.google.errorprone.annotations.concurrent.GuardedBy;

public class Lib {
  public static final Object LOCK = new Object();
  public final Object mu = new Object();

  @GuardedBy("mu")
  public int guarded;

  @GuardedBy("LOCK")
  public static int staticGuarded;

  @GuardedBy("this")
  public int self;

  @GuardedBy("mu")
  protected int prot;

  @GuardedBy("mu")
  int pkg;

  @GuardedBy("lock")
  public void withParam(Object lock) {}

  @GuardedBy("Lib.class")
  public static void classGuarded() {}

  public Object getMu() {
    return mu;
  }

  @GuardedBy("getMu()")
  public int viaMethod;

  public static class Inner {
    @GuardedBy("LOCK")
    public int innerStatic;
  }
}
