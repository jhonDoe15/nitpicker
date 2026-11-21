package e;

class CompactRecords {
  void body() {
    record R2(int a) { R2 {} }
    record R3(int a) { R3 { System.out.println(a); } }
    R3 r = new R3(1);
    record R4() { R4 {} }
  }
  private record P(int a) { P {} }
  private record Q(int a) { Q {} }
  Q q = new Q(1);
}
