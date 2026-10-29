package kin.call;

import java.util.Collection;
import java.util.Map;
import kin.Point;
import kin.Pool;

public class Overloads {
  public interface Finder {
    String find(String key);
  }

  public static class Store implements Finder {
    @Override
    public String find(String key) {
      return key;
    }

    public String find(Integer id) {
      return String.valueOf(id);
    }
  }

  public interface Visitor {
    void visit(Pool pool);

    void visit(Point point);
  }

  public static class Printer implements Visitor {
    @Override
    public void visit(Pool pool) {}

    @Override
    public void visit(Point point) {}
  }

  public interface Handler<T> {
    void handle(T value);
  }

  public static class TextHandler implements Handler<String> {
    @Override
    public void handle(String value) {}
  }

  public static <T extends Collection<?>> T notEmpty(T value, String message) {
    return value;
  }

  public static <T extends Map<?, ?>> T notEmpty(T value, String message) {
    return value;
  }

  public static <T extends CharSequence> T notEmpty(T value, String message) {
    return value;
  }
}
