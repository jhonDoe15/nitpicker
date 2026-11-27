package p;

import java.security.KeyStore;

public class V {
  Object o = new Object() { String pass = "z"; void f(KeyStore k) throws Exception { k.load(null, pass.toCharArray()); } };
}
