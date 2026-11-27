package p;

public class B {
    static class MyException {}
    static class MyException2 extends RuntimeException {}
    static class FooError {}
    static class Exception {}
    interface IException {}
    static class OrException { int x; }
    static class Xexception {}
    enum EnumException { A }
    static abstract class AbsException {}
    static class Throwy extends Throwable {}
    static class ThrowException extends Throwable {}
    static class SubOfMy extends MyException {}
    record RecException(int a) {}
}
