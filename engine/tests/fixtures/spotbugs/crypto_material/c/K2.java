package c;
import java.security.*;
import javax.crypto.*;
import javax.crypto.spec.*;
public class K2 {
  SecureRandom r = new SecureRandom();
  byte[] f = new byte[16];
  void a1() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(1023); }
  void a2() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(1024); }
  void a3() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(2047); }
  void a4() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("rsa"); g.initialize(512); }
  void a5() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA", "BC"); g.initialize(512); }
  void a6() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("DSA"); g.initialize(512); }
  void a7(KeyPairGenerator g) throws Exception { g.initialize(512); }
  void a8() throws Exception { KeyPairGenerator.getInstance("RSA").initialize(512); }
  void a9() throws Exception { int n = 512; KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(n); }
  void b1() throws Exception { KeyGenerator k = KeyGenerator.getInstance("blowfish"); k.init(64); }
  void b2() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); k.init(64, new SecureRandom()); }
  void b3(KeyGenerator k) throws Exception { k.init(64); }
  void b4() throws Exception { KeyGenerator.getInstance("Blowfish").init(64); }
  void b5() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish", "BC"); k.init(32); }
  void b6() throws Exception { KeyGenerator k = KeyGenerator.getInstance("AES"); KeyGenerator j = KeyGenerator.getInstance("Blowfish"); k.init(64); }
  void c1() throws Exception { byte[] iv = new byte[16]; r.nextBytes(iv); new IvParameterSpec(iv); }
  void c2() throws Exception { r.nextBytes(f); new IvParameterSpec(f); }
  void c3() throws Exception { byte[] iv = new byte[16]; new IvParameterSpec(iv); r.nextBytes(iv); }
  void c4() throws Exception { byte[] iv = new byte[16]; byte[] o = new byte[2]; r.nextBytes(o); new IvParameterSpec(iv); }
  void c5() throws Exception { byte[] iv = new byte[16]; new java.util.Random().nextBytes(iv); new IvParameterSpec(iv); }
  void c6() throws Exception { new IvParameterSpec(new byte[16], 0, 16); }
  void c7() throws Exception { byte[] iv = new byte[16]; r.nextBytes(iv); new IvParameterSpec(iv, 0, 16); }
  void c8(Cipher c) throws Exception { new IvParameterSpec(c.getIV()); }
  void c9() throws Exception { byte[] iv = r.generateSeed(16); new IvParameterSpec(iv); }
  void d1() throws Exception { byte[] iv = new byte[16]; r.nextBytes(iv);
    new IvParameterSpec(iv);
    new IvParameterSpec(new byte[3]); }
  void d2() throws Exception { new IvParameterSpec(new byte[1]); new IvParameterSpec(new byte[2]); }
  void d3() throws Exception { byte[] a = new byte[1]; r.nextBytes(a); byte[] b = new byte[1];
    new IvParameterSpec(b); }
  void d4() throws Exception { SecureRandom.getInstanceStrong().nextBytes(f); new IvParameterSpec(f); }
}
