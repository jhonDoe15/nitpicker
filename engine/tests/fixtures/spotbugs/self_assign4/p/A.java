package p;
import java.util.function.*;
public class A {
    int f; int g;
    void a1() { IntConsumer c = f -> { f = f; }; c.accept(1); }
    void a2() { IntConsumer c = f -> { f = f; foo(g); }; c.accept(1); }
    void a3() { IntConsumer c = f -> { f = f; bar(); }; c.accept(1); }
    void a4() { IntConsumer c = f -> { f = f; System.out.println(this); }; c.accept(1); }
    void a5() { IntConsumer c = x -> { x = x; foo(x); }; c.accept(1); }
    static void a6() { IntConsumer c = f -> { f = f; }; c.accept(1); }
    void a7() { Runnable r = new Runnable() { int h; public void run() { int h = 1; h = h; foo(h); int f = 2; f = f; foo(f); } }; r.run(); }
    void a8() { class L { void m(int f) { f = f; } } new L().m(1); }
    void a9(int f) {
        f
          = f;
    }
    void foo(int x) {}
    void bar() {}
}
