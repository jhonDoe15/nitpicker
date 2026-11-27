package p;
import java.sql.*;
import java.util.*;
class Res { static Class<?> classForName(String n) throws ClassNotFoundException { return Class.forName(n); } }
interface TH<T> {}
class OTH implements TH<Object> { static final OTH INSTANCE = new OTH(); }
class Reg { <T> TH<T> get(Class<T> t) { return null; } TH<?> get(java.lang.reflect.Type t) { return null; } }
public class A {
  Reg reg = new Reg();
  List<TH<?>> results(ResultSet rs) throws SQLException {
    List<String> columns = new ArrayList<>();
    List<TH<?>> typeHandlers = new ArrayList<>();
    ResultSetMetaData rsmd = rs.getMetaData();
    for (int i = 0, n = rsmd.getColumnCount(); i < n; i++) {
      columns.add(rsmd.getColumnLabel(i + 1));
      try {
        Class<?> type = Res.classForName(rsmd.getColumnClassName(i + 1));
        TH<?> typeHandler = reg.get(type);
        if (typeHandler == null) {
          typeHandler = OTH.INSTANCE;
        }
        typeHandlers.add(typeHandler);
      } catch (Exception e) {
        typeHandlers.add(OTH.INSTANCE);
      }
    }
    return typeHandlers;
  }
  void two(ResultSet rs) {
    try {
      Class<?> type = Res.classForName(rs.getMetaData().getColumnClassName(1));
      type.getName();
      type.getName();
      type.getName();
      type.getName();
    } catch (Exception e) {
    }
  }
}
