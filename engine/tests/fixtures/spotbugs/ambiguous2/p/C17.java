package p;

public class C17 {
    void m() {}
    class In extends Base<String> {
        void a() { m(); }
        protected void ab() {}
        class Deep { void z() { f(); } }
    }
    void f() {}
}
