package p;

public class C7 {
    int f;
    void g(Object o) {}
    void g(String o) {}
    class In extends Base<String> {
        void a() { g("x"); f++; }
        protected void ab() {}
    }
}
