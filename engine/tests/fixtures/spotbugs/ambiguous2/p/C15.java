package p;

public class C15 {
    int f;
    void ab() {}
    class In extends Base<String> {
        void a() { ab(); f++; }
        protected void ab() {}
    }
    abstract class In2 extends Base<String> {
        void a() { ab(); f++; }
    }
}
