package p;

public class Holder {
    public static class NestedException {
        public int y;
    }
    static class PkgNestedException {
        public int z;
    }
    public static class EmptyException {
    }
    public class InnerException {
        public int w;
    }
    public record RecException(int a) {}
    public interface IfaceException {}
    public enum EnException { A }
    public static class SubException extends java.io.IOException {}
    public static class Sub2Exception extends SubException {}
    public static class ErrorException extends Error {}
    public static abstract class AbsException {}
}
