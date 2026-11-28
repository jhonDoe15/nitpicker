package e;

public class Builders {
    private static final String HOST = "127.0.0.1";
    private static final String V6 = "2001:db8::1";
    private static final String MAPPED = "::ffff:10.0.0.1";
    private static final String NOT_ADDRESS = "1.2.3.400";

    String text(String name) {
        StringBuilder sb = new StringBuilder("a");
        sb.append("b");
        sb.append("c").append('d');
        sb.append(name);
        sb.append("e").append("f");
        StringBuffer other = new StringBuffer();
        other.append("x" + name + "y");
        other.append("z");
        return sb.toString() + other;
    }

    void rethrow(String text) {
        try {
            Integer.parseInt(text);
        } catch (NumberFormatException e) {
            throw new IllegalStateException("bad number");
        }
        try {
            Integer.parseInt(text);
        } catch (NumberFormatException e) {
            IllegalStateException wrapped = new IllegalStateException("bad");
            wrapped.initCause(e);
            throw wrapped;
        }
        try {
            Integer.parseInt(text);
        } catch (NumberFormatException e) {
            throw e instanceof RuntimeException ? new IllegalArgumentException(e) : new IllegalStateException();
        }
        try {
            Integer.parseInt(text);
        } catch (NumberFormatException ignored) {
            throw new IllegalStateException("ignored");
        }
    }
}
