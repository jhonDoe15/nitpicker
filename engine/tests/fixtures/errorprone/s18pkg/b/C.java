package s18pkg.b;

import s18pkg.a.Iface;

public class C extends B implements Iface {
  public static final int shared() {
    return 2;
  }
}
