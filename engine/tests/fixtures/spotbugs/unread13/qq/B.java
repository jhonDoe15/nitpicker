package qq;
public class B {
    static final String NAME = "pk.C";
    Object a(ClassLoader l) throws Exception { return Class.forName("pk.A", true, l); }
    Object c() throws Exception { return Class.forName(NAME); }
    Object e() throws Exception { String s = "pk.E"; return Class.forName(s); }
    Object g() throws Exception { return Class.forName("pk." + "G"); }
    Object h() throws Exception { return java.lang.Class.forName("pk.H"); }
    Object i() throws Exception { return Class.forName("pk.I$In"); }
}
