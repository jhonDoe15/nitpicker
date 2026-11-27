package ivpb;
public class Base {
  protected int px;
  protected static int psx;
  protected Base() {}
  protected Base(int x) {}
  protected int pm() { return 1; }
  protected static int psm() { return 1; }
  public int pub;
  int pkg;
  protected static class PNested { public PNested() {} public static int Q; }
  @Deprecated public static int old() { return 1; }
  @Deprecated public int oldI() { return 1; }
  public static final int CONST = 3;
  public interface I { int K = 1; void im(); @Deprecated void oldim(); }
}
