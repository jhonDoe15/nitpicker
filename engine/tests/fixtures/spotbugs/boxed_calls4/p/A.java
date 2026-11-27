package p;
public class A {
    static int v(int... a){return 0;}
    int va1(String s) { return v(Integer.valueOf(s)); }
    static int w(Object... a){return 0;}
    int va2(String s) { return w(Integer.valueOf(s)); }
    static int w2(long... a){return 0;}
    int va3(String s) { return w2(Integer.valueOf(s)); }
    
    int sv(String s) { return Integer.valueOf(s).byteValue(); }
    
    String sc(String s) { String t = s; t += Integer.valueOf(s); return t; }
    
    int ai(String s) { int[] a = new int[2]; a[0] = Integer.valueOf(s); return a[0]; }
    
    int ai2(String s) { Integer[] a = new Integer[2]; a[0] = Integer.valueOf(s); return 0; }
    
    int sw1(String s) { int r = switch (s.length()) { case 1 -> Integer.valueOf(s); default -> 0; }; return r; }
    
    Integer sw2(String s) { Integer r = switch (s.length()) { case 1 -> Integer.valueOf(s); default -> 0; }; return r; }
    
    int sw3(String s) { return switch (Integer.valueOf(s)) { case 1 -> 1; default -> 0; }; }
    
    int as(String s) { assert Integer.valueOf(s) > 0; return 1; }
    
    int tl(String s) { return ~Integer.valueOf(s); }
    
    long sh(String s) { long x = 1; x <<= Integer.valueOf(s); return x; }
    
    long cmpl(String s) { long x = 1; x += Integer.valueOf(s); return x; }
    
    Integer cmpS(String s) { Integer x = 1; x += Integer.valueOf(s); return x; }
    
    double dbl(String s) { return Double.valueOf(s) * 2; }
    
    double dblI(String s) { return Integer.valueOf(s) * 2.0; }
    
    double dblv(String s) { return Double.valueOf(s); }
    
    Object dblo(String s) { return Double.valueOf(s); }
    
    Double dblD(String s) { return Double.valueOf(s); }
    
    Number dblN(String s) { return Double.valueOf(s); }
    
    java.util.function.IntSupplier lam(String s) { return () -> Integer.valueOf(s); }
    
    java.util.function.Supplier<Integer> lam2(String s) { return () -> Integer.valueOf(s) + 1; }
    
    java.util.function.IntSupplier lam3(String s) { return () -> { return Integer.valueOf(s); }; }
    
    java.util.function.ToIntFunction<String> lam4(String s) { return x -> Integer.valueOf(x); }
    
    int ter(String s) { int r = s.isEmpty() ? Integer.valueOf(s) : 5; return r; }
    
    long ter2(String s) { long r = s.isEmpty() ? Integer.valueOf(s) : 5L; return r; }
    
    Object ter3(String s) { Object r = s.isEmpty() ? Integer.valueOf(s) : 5; return r; }
    
    Object ter4(String s) { Object r = s.isEmpty() ? Integer.valueOf(s) : Long.valueOf(s); return r; }
    
    int ter5(String s) { return s.isEmpty() ? (s.length() > 1 ? Integer.valueOf(s) : 1) : 5; }
    
    Integer ter6(String s) { return s.isEmpty() ? Integer.valueOf(s) : null; }
    
    int ter7(String s) { return s.isEmpty() ? Integer.valueOf(s) : Integer.valueOf(s + 1); }
    
    long ter8(String s) { return s.isEmpty() ? Integer.valueOf(s) : Long.valueOf(s); }
    
    long cast1(String s) { return (long) Integer.valueOf(s); }
    
    Object cast2(String s) { return (Object) Integer.valueOf(s); }
    
    Number cast3(String s) { return (Number) Integer.valueOf(s); }
    
    Integer cast4(String s) { return (Integer) Integer.valueOf(s); }
    
    int cast5(String s) { return (int) Integer.valueOf(s) + 1; }
    
    double cast6(String s) { return (double) Double.valueOf(s); }
    
    int cast7(String s) { return (int) (double) Double.valueOf(s); }
    
    int idx(String s) { int[] a = new int[3]; return a[Integer.valueOf(s)]; }
    
    boolean ne(String s) { return Integer.valueOf(s) != null; }
    
    boolean ne2(String s) { return Integer.valueOf(s) == null; }
    
    boolean ne3(String s) { Integer o = 3; return Integer.valueOf(s) == o; }
    
    boolean ne4(String s) { return Integer.valueOf(s) == 3L; }
    
    boolean ne5(String s) { return Integer.valueOf(s) == (Object) 3; }
    
    boolean ne6(String s) { return Integer.valueOf(s) < Integer.valueOf(s + 1); }
    
    boolean ne8(String s) { return Integer.valueOf(s) == new Integer(3); }
    
    boolean ne9(String s) { return Boolean.valueOf(s) == true; }
    
    boolean eq(String s) { return Integer.valueOf(s).equals(3); }
    
    int sw4(String s) { switch (Integer.valueOf(s)) { case 1: return 1; } return 0; }
    
    int sw5(String s) { switch (Long.valueOf(s).intValue()) { case 1: return 1; } return 0; }
    
    int inc(String s) { int x = 0; x = x + Integer.valueOf(s); return x; }
    
    int pa(String s) { return (Integer.valueOf(s)) + ((Integer.valueOf(s))); }
    
    int cond(String s) { int i = 0; while (Integer.valueOf(s) > i) i++; return i; }
    
    int pm(String s) { return +Integer.valueOf(s); }
    
    char ret_char(String s) { return (char) Integer.valueOf(s).intValue(); }
    
    short retsh(String s) { return (short) (int) Integer.valueOf(s); }
    
    String ov(String s) { return String.valueOf(Integer.valueOf(s)); }
    
    String ov2(String s) { return Integer.toString(Integer.valueOf(s)); }
    
    String ov3(String s) { return Math.max(Integer.valueOf(s), 1) + ""; }
    
    String ov4(String s) { return Math.max(Integer.valueOf(s), 1L) + ""; }
    
    String ov5(String s) { return Math.abs(Double.valueOf(s)) + ""; }
    
    String ov6(String s) { return java.util.Objects.toString(Double.valueOf(s)); }
    
    String ov7(String s) { return new StringBuilder().append(Integer.valueOf(s)).toString(); }
    
    String ov8(String s) { return new StringBuilder().append(Integer.valueOf(s) + 1).toString(); }
    
    String ov9(String s) { java.util.List<Integer> l = new java.util.ArrayList<>(); l.add(Integer.valueOf(s)); return ""; }
    
    String ov10(String s) { java.util.List<Integer> l = new java.util.ArrayList<>(); l.add(0, Integer.valueOf(s)); l.remove(Integer.valueOf(s)); return ""; }
}
