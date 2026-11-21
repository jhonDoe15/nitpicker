package p;
import java.io.*;
import java.util.concurrent.Callable;
import java.util.function.Supplier;
public class G {
    public interface P { int get() throws IllegalStateException; int get(Supplier<Object> s) throws IllegalStateException; }
    public static class Base { public Base() { } public Base(long a) { } }
    public static class Foo { public Foo(DataInput in) { } }
    static long declared() throws IOException { return 1; }
    public static class G1 { public G1(DataInput in) throws IOException { this(in.readLong()); } public G1(long a) { } }
    public static class G2 extends Base { public G2(DataInput in) throws IOException { super(in.readLong()); } }
    public static class G3 { public G3(String s) { this(Integer.parseInt(s)); } public G3(int a) { } }
    public static class G4 { public G4(String s, Callable<Integer> p) throws Exception { this(s.length(), p.call()); } public G4(int a, int b) { } }
    public static class G5 { public G5(DataInput in) throws IOException { this(new Foo(in), in.readLong()); } public G5(Foo f, long a) { } }
    public static class G6 {
        public G6(int a, P p) {
            this(a,
                p.get());
        }
        public G6(int a, int b) { if (a < b) { throw new IllegalStateException(); } }
    }
    public static class G7 {
        public G7(int a, P p) {
            this(a,
                p.get(
                    Object::new));
        }
        public G7(int a, int b) { if (a < b) { throw new IllegalStateException(); } }
    }
    public static class G8 {
        public G8(int a) {
            this(a,
                String.valueOf(a));
        }
        public G8(int a, String b) { if (b == null) { throw new IllegalStateException(); } }
    }
    public static class G9 extends Base {
        int x;
        public G9(DataInput in) throws IOException {
            super(in.readLong());
            x = in.readInt();
        }
    }
    public static class G10 { public G10() throws IOException { this(declared()); } public G10(long a) { } }
    public static class G11 { public G11() throws IOException { this(own()); } public G11(long a) { } static long own() throws IOException { return 1; } }
    public static class G12 { public G12(P p) { this(p.get()); } public G12(int a) { } }
    public static class G13 extends Base { public G13(P p) { super(p.get()); } }
    public static class G14 { public G14(String s) throws IOException { this(Integer.parseInt(s), declared()); } public G14(int a, long b) { } }
    public static class G15 { public G15(String s) throws Exception { this(Class.forName(s)); } public G15(Class<?> c) { } }
    public static class G16 extends Base { public G16(String s) throws Exception { super(Class.forName(s).hashCode()); } }
}
