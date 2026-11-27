package p;
public class A {
  public long one() { return 1L; }
  public int hex() { return 0x1; }
  public int oct() { return 01; }
  public int bin() { return 0b1; }
  public long zero() { return 0L; }
  public int two() { return 2; }
  void m() { one(); hex(); oct(); bin(); zero(); two(); }
}
