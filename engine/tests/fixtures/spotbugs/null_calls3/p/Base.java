package p;
public class Base {
    Object v() { return "x"; }
}
class Sub extends Base {
    @Override Object v() { return null; }
}
class Lone {
    Object v() { return "x"; }
}
