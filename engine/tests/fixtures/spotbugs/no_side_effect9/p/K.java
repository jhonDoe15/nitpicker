package p;
class K {
    static { System.out.println("init"); }
    K() {}
    static Object get() { return null; }
}
class S {
    static int count;
    static String name;
    static { count = 5; name = "a" + count; }
    static Object get() { return null; }
}
class S2 {
    static int count;
    static { count = calc(); }
    static int calc() { return 3; }
    static Object get() { return null; }
}
class S3 {
    static { K.get(); }
    static Object get() { return null; }
}
class S4 {
    static final Object o = new K();
    static Object get() { return null; }
}
class S5 extends K {
    static Object get5() { return null; }
}
class Use {
    void a() { new K(); S.get(); S2.get(); S3.get(); S4.get(); S5.get5(); }
}
