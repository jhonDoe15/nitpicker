package p;

public class C10 {
    int f;
    void m() {}
    void use() {
        class Loc extends Base<String> {
            void a() { m(); f++; }
            protected void ab() {}
        }
        new Loc().a();
    }
}
