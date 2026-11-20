package p;
import java.io.*;
import java.util.*;
import java.util.concurrent.Callable;
public class D {
    static void declared() throws IOException { }
    static void unchecked() throws IllegalStateException { }
    public static class Base { protected void inherited() { throw new IllegalStateException(); } protected void inheritedDeclared() throws IOException { } }
    public static class Fin { protected final void finalize() { } }
    public static class D1 {
        private final int a;
        /** doc */
        public D1(int a,
                  int b) {
            this.a = a;
            if (b < 0) {
                throw new IllegalArgumentException();
            }
        }
    }
    public static class D2 {
        public D2() { throw new IllegalStateException(); }
        public D2(int a) { throw new IllegalStateException(); }
    }
    public static class D3 { public D3() { one(); } void one() { two(); } void two() { throw new IllegalStateException(); } }
    public static class D3b { public D3b() { one(); } void one() { two(); } void two() { three(); } void three() { throw new IllegalStateException(); } }
    public static class D4 { public D4() { safe(); } void safe() { try { throw new IllegalStateException(); } catch (RuntimeException e) { } } }
    public static class D5 extends Base { public D5() { inherited(); } }
    public static class D5b extends Base { public D5b() throws IOException { inheritedDeclared(); } }
    public static class D6 { public D6() { try { declared(); } catch (IOException e) { } } }
    public static class D6b { public D6b() { try { unchecked(); } catch (IllegalArgumentException e) { } } }
    public static class D6c { public D6c() { try { declared(); } catch (Exception e) { } } }
    public static class D6d { public D6d() { try { declared(); } catch (Throwable e) { } } }
    public static class D7 { public D7() { try { throw new IllegalStateException(); } catch (IllegalArgumentException e) { } } }
    public static class D8 { public D8() { try { throw new IllegalStateException(); } finally { System.out.println(); } } }
    public static class D9 { Object o; public D9() { o = new Object() { public String toString() { throw new IllegalStateException(); } }; } }
    public static class D10 { { if (hashCode() == 0) { throw new IllegalStateException(); } } public D10() { } }
    public static class D10b { int v = calc(); int calc() { throw new IllegalStateException(); } }
    public static class D11 { public D11() { this.check(); } void check() { throw new IllegalStateException(); } }
    public static class D11b { public D11b(D11b other) { other.check(); } void check() { throw new IllegalStateException(); } }
    public static class D12 { public D12(Closeable c) throws IOException { c.close(); } }
    public static class D12b { public D12b(Callable<String> c) throws Exception { c.call(); } }
    public static class D14 { public D14() { check(1); } void check(int a) { } void check(String s) { throw new IllegalStateException(); } }
    public static class D15 { int v; public D15(String s) { v = parse(s); } int parse(String s) { return Integer.parseInt(s); } }
    public static class D16 { public D16() throws IOException { own(); } void own() throws IOException { } }
    public static class D17 { public D17() { unchecked(); } }
    public static class D18 { public D18() { } Object make() { return new Object() { { if (hashCode() == 0) { throw new IllegalStateException(); } } }; } }
    public static class D20 extends Fin { public D20() { throw new IllegalStateException(); } }
    public static class D21 extends Base {
        public D21(int a) {
            super();
            if (a < 0) {
                throw new IllegalArgumentException();
            }
        }
    }
    public static class D25 { public D25(int x) { check(x); } void check(int x) { assert x > 0; } }
    public static class D26 { public D26(int x) { loop(x); } void loop(int x) { if (x > 0) { loop(x - 1); } } }
    public static class D27 { public D27() { D27.check(); } static void check() { throw new IllegalStateException(); } }
    public static class D30 { public D30() { own(); } void own() { try { declared(); } catch (IOException e) { } } }
    public static class D30b { public D30b() throws IOException { own(); } void own() throws IOException { declared(); } }
    public static class D31 { public D31() { own(); } void own() { unchecked(); } }
    public static class D32 { public D32(List<String> l) { for (String s : l) { if (s == null) { throw new IllegalArgumentException(); } } } }
    public static class D33 { public D33(Object o) { synchronized (o) { throw new IllegalStateException(); } } }
    public static class D34 { public D34(int a) { if (a > 0) { return; } throw new IllegalStateException(); } }
    public static class D35 { String s; public D35(Optional<String> o) { s = o.orElseThrow(IllegalStateException::new); } }
    public static class D36 { public D36() throws InterruptedException { Thread.sleep(1); } }
    public static class D37 { public D37(Object o) throws InterruptedException { o.wait(); } }
}
