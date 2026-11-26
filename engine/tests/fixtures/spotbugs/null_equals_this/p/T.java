package p;
import java.util.Objects;
public class T {
    public static class A { int x; public int hashCode(){return x;} public boolean equals(Object o) { if (o == this) return true; A b = (A) o; return b.x == x; } }
    public static class B { int x; public int hashCode(){return x;} public boolean equals(Object o) { if (o != this) { B b = (B) o; return b.x == x; } return true; } }
    public static class C { int x; public int hashCode(){return x;} public boolean equals(Object o) { return this == o || ((C) o).x == x; } }
    public static class D { int x; public int hashCode(){return x;} public boolean equals(Object o) { if (this == o) return true; D b = (D) o; return b.x == x; } }
    public static class E { int x; Object f; public int hashCode(){return x;} public boolean equals(Object o) { if (Objects.isNull(o)) {} E b = (E) o; return b.x == x; } }
    public static class F { int x; public int hashCode(){return x;} public boolean equals(Object o) { synchronized (this) { F b = (F) o; return b.x == x; } } }
    public static class G { int x; public int hashCode(){return x;} public boolean equals(Object o) { try { G b = (G) o; return b.x == x; } catch (Throwable t) { return false; } } }
}
