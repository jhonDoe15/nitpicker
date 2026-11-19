package demo;

import java.util.function.IntSupplier;

public class Allowed {
  private final int id;
  private int counter;
  private int twice;
  private int conditional;
  private int looped;
  private int initializedAgain = 1;
  private int onlyOneConstructor;
  private int inLambda;
  private int inInner;
  private int viaOther;
  private int unassigned;
  private int incremented;
  private int combined;
  private volatile int shared;
  int packageVisible;
  protected int inherited;
  public int open;
  private static int created;
  private static int staticTwice;
  private static int fromConstructor;
  private int nameFromBuilder;

  static {
    staticTwice = 1;
  }

  static {
    staticTwice = 2;
  }

  public Allowed(int id) {
    this.id = id;
    twice = 1;
    twice = 2;
    if (id > 0) {
      conditional = 1;
    }
    for (int i = 0; i < id; i++) {
      looped = i;
    }
    initializedAgain = 2;
    onlyOneConstructor = id;
    IntSupplier supplier = () -> inLambda = 1;
    supplier.getAsInt();
    incremented++;
    combined += id;
    fromConstructor = id;
    package_(id);
  }

  public Allowed() {
    this.id = 0;
  }

  private void package_(int value) {
    counter = value;
    created = value;
    Allowed other = new Allowed();
    other.viaOther = value;
  }

  public class Inner {
    public void set() {
      inInner = 1;
    }
  }

  public int total() {
    return id + counter + twice + conditional + looped + initializedAgain + onlyOneConstructor
        + inLambda + inInner + viaOther + unassigned + incremented + combined + shared
        + packageVisible + inherited + open + created + staticTwice + fromConstructor
        + nameFromBuilder;
  }
}

class ReadBeforeWrite {
  private int a;
  private int b;
  private int c;
  private int d;
  private int e;
  private static int s;

  static {
    int copy = s;
    s = copy + 1;
  }

  ReadBeforeWrite() {
    int t = a;
    a = 1;
    Runnable r = () -> System.out.println(b);
    b = 1;
    c = c + 1;
    new Object() {
      int read() {
        return d;
      }
    };
    d = 1;
  }

  {
    int t = this.e;
    this.e = t + 1;
  }
}
