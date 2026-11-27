package p;

import java.sql.DriverManager;
import java.security.KeyStore;

public class W {
  String name = "outer";
  Object anon() { return new Object() { String name = "z"; }; }
  void f(KeyStore k) throws Exception { k.load(null, name.toCharArray()); }
}
