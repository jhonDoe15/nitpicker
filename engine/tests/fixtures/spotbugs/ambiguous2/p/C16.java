package p;

public class C16 {
    int f;
    void m() {}
    class In extends Base<String> {
        void a() {
            if (f > 0) {
                f++;
            }
            m();
        }
        protected void ab() {}
        class Deep {
            void z() { m(); }
        }
    }
}
