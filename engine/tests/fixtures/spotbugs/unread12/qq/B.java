package qq;
public class B {
    Object a() throws Exception { return Class.forName("pk.A"); }
    String c() { return "pk.C"; }
    Object e(ClassLoader l) throws Exception { return l.loadClass("pk.E"); }
}
