package c;
import java.security.*;
import javax.crypto.*;
import javax.crypto.spec.*;
public class K {
  static final byte[] IV = new byte[16];
  byte[] f = new byte[16];
  void a() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(1024); }
  void b() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(2048); }
  void c() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(512, new SecureRandom()); }
  void d(int n) throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(n); }
  void e() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("DSA"); g.initialize(1024); }
  void e2(KeyPairGenerator g) throws Exception { g.initialize(1024); }
  void e3() throws Exception { KeyPairGenerator.getInstance("RSA").initialize(1024); }
  void e4() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(new java.security.spec.RSAKeyGenParameterSpec(1024, java.math.BigInteger.ONE)); }
  void f() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); k.init(64); }
  void g() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); k.init(128); }
  void h() throws Exception { KeyGenerator k = KeyGenerator.getInstance("AES"); k.init(64); }
  void h2() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); k.init(127); }
  void i() throws Exception { new IvParameterSpec(IV); }
  void j() throws Exception { new IvParameterSpec(f); }
  void k() throws Exception { byte[] iv = new byte[16]; new IvParameterSpec(iv); }
  void l() throws Exception { byte[] iv = new byte[16]; new SecureRandom().nextBytes(iv); new IvParameterSpec(iv); }
  void m() throws Exception { new IvParameterSpec(new byte[] {1, 2, 3}); }
  void n(byte[] iv) throws Exception { new IvParameterSpec(iv); }
  void o() throws Exception { byte[] iv = "abcdefgh12345678".getBytes(); new IvParameterSpec(iv); }
  void p() throws Exception { byte[] iv = new byte[16]; Cipher c = Cipher.getInstance("AES/CBC/PKCS5Padding"); c.init(Cipher.ENCRYPT_MODE, (Key) null, new IvParameterSpec(iv)); }
  void q() throws Exception { new GCMParameterSpec(128, new byte[12]); }
}
