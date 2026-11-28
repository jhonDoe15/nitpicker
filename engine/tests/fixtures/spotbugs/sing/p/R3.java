package p;
public class R3 {
    static final R3 INSTANCE = new R3();
    public R3() {}
    static R3 use() { return INSTANCE.self(); }
    R3 self() { return this; }
}
