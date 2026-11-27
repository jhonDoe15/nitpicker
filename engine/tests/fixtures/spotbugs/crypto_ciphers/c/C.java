package c;
import javax.crypto.*;
public class C {
  static final String T = "AES/ECB/PKCS5Padding";
  void a() throws Exception { Cipher.getInstance("AES"); }
  void b() throws Exception { Cipher.getInstance("AES/ECB/PKCS5Padding"); }
  void c() throws Exception { Cipher.getInstance("AES/CBC/PKCS5Padding"); }
  void d() throws Exception { Cipher.getInstance("AES/CBC/NoPadding"); }
  void e() throws Exception { Cipher.getInstance("AES/GCM/NoPadding"); }
  void f() throws Exception { Cipher.getInstance("DES"); }
  void g() throws Exception { Cipher.getInstance("DES/CBC/PKCS5Padding"); }
  void h() throws Exception { Cipher.getInstance("DESede"); }
  void i() throws Exception { Cipher.getInstance("DESede/ECB/PKCS5Padding"); }
  void j() throws Exception { Cipher.getInstance("TripleDES"); }
  void k() throws Exception { Cipher.getInstance("RSA"); }
  void l() throws Exception { Cipher.getInstance("RSA/ECB/NoPadding"); }
  void m() throws Exception { Cipher.getInstance("RSA/NONE/NoPadding"); }
  void n() throws Exception { Cipher.getInstance("RSA/ECB/PKCS1Padding"); }
  void o() throws Exception { Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding"); }
  void p() throws Exception { Cipher.getInstance("AES/CTR/NoPadding"); }
  void q() throws Exception { Cipher.getInstance("AES/OFB/NoPadding"); }
  void r() throws Exception { Cipher.getInstance("AES/CFB/NoPadding"); }
  void s() throws Exception { Cipher.getInstance("Blowfish"); }
  void t() throws Exception { Cipher.getInstance("ChaCha20-Poly1305"); }
  void u() throws Exception { Cipher.getInstance("AES/CCM/NoPadding"); }
  void v() throws Exception { Cipher.getInstance("aes/ecb/pkcs5padding"); }
  void w() throws Exception { Cipher.getInstance("des/cbc/pkcs5padding"); }
  void x() throws Exception { Cipher.getInstance("AES/ECB/PKCS5Padding", "BC"); }
  void y(java.security.Provider p) throws Exception { Cipher.getInstance("DES", p); }
  void z() throws Exception { Cipher.getInstance(T); }
  void aa() throws Exception { String s = "DES"; Cipher.getInstance(s); }
  void ab(String s) throws Exception { Cipher.getInstance(s); }
  Object ac() throws Exception { return new NullCipher(); }
  void ad() throws Exception { KeyGenerator.getInstance("DES"); SecretKeyFactory.getInstance("DESede"); }
  void ae() throws Exception { Cipher.getInstance("AES/CBC/PKCS7Padding"); Cipher.getInstance("RC4"); Cipher.getInstance("ARCFOUR"); }
  void af() throws Exception { Cipher.getInstance("DESEDE/CBC/NoPadding"); Cipher.getInstance("RSA/None/NoPadding"); Cipher.getInstance("RSA/ECB/NOPADDING"); }
  void ag() throws Exception { Cipher.getInstance("AES/GCM/PKCS5Padding"); Cipher.getInstance("AES/PCBC/PKCS5Padding"); Cipher.getInstance("AES/CTS/NoPadding"); }
  void ah() throws Exception { Cipher.getInstance("AES_256/GCM/NoPadding"); Cipher.getInstance("PBEWithMD5AndDES"); Cipher.getInstance("DESX"); }
  void ai() throws Exception { Cipher.getInstance("AES/ECB/NoPadding"); Cipher.getInstance("RSA/ECB/OAEPPadding"); Cipher.getInstance("ECIES"); }
  static class N extends NullCipher {}
  Object[] aj() { return new Object[] { new N(), new NullCipher() {} }; }
}
