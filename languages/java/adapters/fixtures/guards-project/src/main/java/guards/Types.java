package guards;

import java.util.ArrayList;
import java.util.List;

public final class Types {
  public List untyped() { // violation: javac/rawtypes
    return new ArrayList<String>();
  }

  @SuppressWarnings("unchecked")
  public <T> T unchecked(Object value) {
    return (T) value; // violation: javac/unchecked
  }

  public String redundant(String value) {
    return (String) value; // violation: javac/cast
  }

  public int area(Object shape) {
    if (shape instanceof String) { // violation: pmd/InstanceofThenCast
      return ((String) shape).length();
    }
    if (shape instanceof List<?> list) {
      return list.size();
    }
    return 0;
  }

  public int checked(Object value) {
    if (value instanceof List<?>) {
      List<String> names = (List<String>) value; // violation: javac/unchecked
      return names.size();
    }
    return 0;
  }

  public int elsewhere(Object value, Object other) {
    if (value instanceof String) {
      return 1;
    }
    return ((String) other).length() + ((String) value).length();
  }

  public boolean blank(Object value) {
    return value instanceof String && ((String) value).isEmpty(); // violation: pmd/InstanceofThenCast
  }

  public int length(Object value) {
    return value instanceof String ? ((String) value).length() : 0; // violation: pmd/InstanceofThenCast
  }

  public List<String> names(Object value) {
    if (value instanceof List) {
      return (List<String>) value; // violation: javac/unchecked
    }
    return List.of();
  }
}
