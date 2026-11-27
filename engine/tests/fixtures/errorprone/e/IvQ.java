package iv2.q;
public class IvQ {
  public static final int CONST = 1;
  public IvQ() {}
  @Deprecated public IvQ(int i) {}
  public static IvQ make() { return new IvQ(); }
  @Deprecated public int dep() { return 1; }
}
