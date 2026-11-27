package p;
import java.io.*;
import java.util.*;
public class Z {
    static Object num() { return 3; }
    static Reader open(Object a, Object b) throws IOException { return null; }
    static Map<String, Object> map(Reader r) throws IOException { return null; }
    static boolean a1(InputStream s) {
        try (Reader r = new InputStreamReader(s)) {
            Object query = num();
            return true;
        } catch (IOException e) {
            throw new AssertionError("x", e);
        }
    }
    static boolean a2(Object s) {
        try (Reader r = open(s, s)) {
            Map<String, Object> query = map(r);
            return true;
        } catch (IOException e) {
            throw new AssertionError("x", e);
        }
    }
    boolean a3(Object s) {
        try (Reader r = open(s, s)) {
            Map<String, Object> query = map(r);
            return true;
        } catch (IOException e) {
            throw new AssertionError("x", e);
        }
    }
    static boolean a4(Object s) {
        try (Reader r = open(s, s)) {
            Object query = num();
            return true;
        } catch (IOException e) {
            throw new AssertionError("x", e);
        }
    }
    static void a5(Object s) throws IOException {
        try (Reader r = open(s, s)) {
            Object query = num();
        }
    }
}
