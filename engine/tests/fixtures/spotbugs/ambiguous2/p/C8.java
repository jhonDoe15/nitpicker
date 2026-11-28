package p;

public class C8 {
    void m() {}
    class Other extends Base<String> { protected void ab() {} }
    class In extends Other {
        void a() { m(); }
    }
}
