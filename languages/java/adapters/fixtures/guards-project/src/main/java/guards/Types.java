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
}
