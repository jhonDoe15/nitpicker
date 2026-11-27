package p;

public class C2 {
    int f;
    void m() {}
    class In extends Base<String> {
        public void m() {}
        void a() { m(); f++; }
        protected void ab() {}
    }
}
