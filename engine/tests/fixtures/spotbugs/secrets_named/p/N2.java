package p; import java.util.*; import java.util.concurrent.*; public class N2 {
  void m1(S2 t) { t.withPassword("x"); } // withPassword
  void m2(S2 t) { t.getPassword("x"); } // getPassword
  void m3(S2 t) { t.passwordX("x"); } // passwordX
  void m4(S2 t) { t.setUserPassword("x"); } // setUserPassword
  void m5(S2 t) { t.setPass("x"); } // setPass
  void m6(S2 t) { t.setPassphrase("x"); } // setPassphrase
  void m7(S2 t) { t.setPasswd("x"); } // setPasswd
  void m8(S2 t) { t.setPsw("x"); } // setPsw
  void m9(S2 t) { t.pwd("x"); } // pwd
  void m10(S2 t) { t.setDbPassword("x"); } // setDbPassword
  void m11(S2 t) { t.updatePassword("x"); } // updatePassword
  void m12(S2 t) { t.setPWD("x"); } // setPWD
  void m13(S2 t) { t.xpwd("x"); } // xpwd
  void m14(S2 t) { t.Password("x"); } // Password
  void m15(S2 t) { t.setPassWord("x"); } // setPassWord
  void m16(S2 t) { t.setUser_password("x"); } // setUser_password
  void m17(S2 t) { t.sett("x"); } // sett
  void m18(S2 t) { t.setpwdx("x"); } // setpwdx
  void m19(S2 t) { t.put("x"); } // put
  void q1(Hashtable<String, String> p) { p.put("password", "x"); }
  void q2(ConcurrentHashMap<String, String> p) { p.put("password", "x"); }
  void q3(Map<String, String> p) { p.putIfAbsent("password", "x"); }
  void q4(S2 t) { t.put("password", "x"); }
  void q5(S2 t) { t.setProperty("password", "x"); }
  void q6(Map<String, String> p) { p.put("dbPassword", "x"); }
  void q7(Map<String, String> p) { p.put("password_x", "x"); }
  void q8(Map<String, Object> p) { p.put("password", "x".toCharArray()); }
  void q9(Map<String, Object> p) { p.put("password", 5); }
  void q10(Map<String, String> p, boolean b) { p.put("password", b ? "x" : "x"); }
  void q11(Map<String, String> p) { String k = "password"; p.put(k, "x"); }
  void q12(Map<Object, String> p) { p.put(1, "x"); }
  void q13(java.util.TreeMap<String, String> p) { p.put("pwd", "x"); }
  void q14(Properties p) { p.setProperty("javax.net.ssl.keyStorePassword", "x"); }
}
