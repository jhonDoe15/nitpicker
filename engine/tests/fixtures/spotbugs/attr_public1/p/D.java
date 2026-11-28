package p;
public class D {
    public int x;
    public class In { public int y; void s() { y = 1; x = 2; } }
    public static class Nest { public int z; Nest() { z = 1; } }
    public interface I { int K = 1; }
    public enum E { X; public int v; void s() { v = 1; } }
    public record R(int a) { public static int s; static { s = 1; } }
}
