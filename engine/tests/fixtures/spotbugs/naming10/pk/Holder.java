package pk;

public class Holder {
    public static class NestedException {
        public int y;
    }
    static class PkgNestedException {
        public int z;
    }
    private static class PrivException { }
    public static class EmptyException {
    }
    public class InnerException {
        public int w;
    }
    public record RecException(int a) {}
    public interface IfaceException {}
    public enum EnException { A }
    public static class SubException extends java.io.IOException {}
    public static class ErrorException extends Error {}
    public static class ThrowException extends Throwable {}
    public static abstract class AbsException {}
    public @interface AnnException {}
    public static class Exception {}
    public static class Xexception {}
    public static class MyEXCEPTION {}
    public static class ExceptionHolder {}
    public static class ExceptionalException extends AbsException {}
    Object anon() { return new Object() {}; }
}
