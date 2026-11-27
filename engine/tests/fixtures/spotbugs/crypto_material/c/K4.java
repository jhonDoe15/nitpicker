package c;
import java.security.*;
import javax.crypto.*;
import javax.crypto.spec.*;
public class K4 {
  SecureRandom r = new SecureRandom();
  void a1() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(5); }
  void a2() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(6); }
  void a3() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(-5); }
  void a4() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(-200); }
  void a5() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(1); }
  void b1() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); k.init(5); }
  void b2() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); k.init(6); }
  void b3() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); k.init(-5); }
  void c1() throws Exception { KeyPairGenerator.getInstance("RSA");
    KeyPairGenerator.getInstance("RSA").initialize(512); }
  void c2() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); KeyPairGenerator.getInstance("DSA").initialize(512); }
  void c3() throws Exception { KeyPairGenerator.getInstance("DSA").initialize(512); }
  void c4() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); KeyPairGenerator h = KeyPairGenerator.getInstance("DSA"); g.initialize(512); }
  void d1(boolean b) throws Exception { KeyPairGenerator g; if (b) g = KeyPairGenerator.getInstance("RSA"); else g = KeyPairGenerator.getInstance("RSA"); g.initialize(512); }
  void d2(boolean b) throws Exception { if (b) { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(512); } }
  void d3(boolean b, int x) throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); if (b) x++; g.initialize(512); }
  void d4(int x) throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); for (int i = 0; i < x; i++) { } g.initialize(512); }
  void d5() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); try { g.initialize(512); } catch (RuntimeException e) { } }
  void d6(boolean b) throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); if (b) { g.initialize(512); } }
  void e1(boolean b) throws Exception { KeyGenerator k = KeyGenerator.getInstance("AES"); if (b) KeyGenerator.getInstance("Blowfish"); k.init(64); }
  void e2(boolean b, int x) throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); if (b) x++; k.init(64); }
  void e3() throws Exception { final String a = "Blowfish"; KeyGenerator k = KeyGenerator.getInstance(a); k.init(64); }
  void e4(KeyGenerator k) throws Exception { k.init(64); }
  void e5() throws Exception { KeyGenerator.getInstance("Blowfish"); }
  void e6(KeyGenerator k) throws Exception { k.init(64); KeyGenerator.getInstance("Blowfish"); k.init(32); }
  void f1(boolean b) throws Exception { byte[] iv = new byte[16]; if (b) r.nextBytes(iv); else r.nextBytes(iv); new IvParameterSpec(iv); }
  void f2(int x) throws Exception { byte[] iv = new byte[16]; r.nextBytes(iv); for (int i = 0; i < x; i++) { } new IvParameterSpec(iv); }
  void f3(boolean b, int x) throws Exception { byte[] iv = new byte[16]; r.nextBytes(iv); if (b) x++; new IvParameterSpec(iv); }
  void f4(boolean b) throws Exception { byte[] iv = new byte[16]; if (b) { r.nextBytes(iv); new IvParameterSpec(iv); } }
  void f5() throws Exception { byte[] iv = new byte[16]; try { r.nextBytes(iv); } catch (RuntimeException e) { } new IvParameterSpec(iv); }
  void f6(boolean b) throws Exception { byte[] iv = new byte[16]; r.nextBytes(iv); if (b) { new IvParameterSpec(iv); } }
  void f7(Cipher c, boolean b) throws Exception { byte[] iv = new byte[16]; if (b) c.getIV(); new IvParameterSpec(iv); }
  void f8(boolean b) throws Exception { byte[] iv = new byte[16]; r.nextBytes(iv); new IvParameterSpec(b ? iv : iv); }
}
