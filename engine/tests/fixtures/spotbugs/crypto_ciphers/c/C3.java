package c;
import javax.crypto.*;
public class C3 {
  void m0() throws Exception { Cipher.getInstance("DES/"); }
  void m1() throws Exception { Cipher.getInstance("des/x"); }
  void m2() throws Exception { Cipher.getInstance("DES "); }
  void m3() throws Exception { Cipher.getInstance("DESx/CBC"); }
  void m4() throws Exception { Cipher.getInstance("DES/ECB/"); }
  void m5() throws Exception { Cipher.getInstance("DES/ECB"); }
  void m6() throws Exception { Cipher.getInstance("RSAx/NoPadding"); }
  void m7() throws Exception { Cipher.getInstance("rsa/ECB/NoPadding"); }
  void m8() throws Exception { Cipher.getInstance("RSA/ECB/NoPadding "); }
  void m9() throws Exception { Cipher.getInstance("RSA/xNoPadding"); }
  void m10() throws Exception { Cipher.getInstance("RSA/CBC/PKCS5Padding"); }
  void m11() throws Exception { Cipher.getInstance("RSA/ECB/PKCS5Padding"); }
  void m12() throws Exception { Cipher.getInstance("AES/GCM/"); }
  void m13() throws Exception { Cipher.getInstance("/GCM/"); }
  void m14() throws Exception { Cipher.getInstance("AES/GCM/x/y"); }
  void m15() throws Exception { Cipher.getInstance("a/b/GCM/c"); }
  void m16() throws Exception { Cipher.getInstance("AES/CCM/"); }
  void m17() throws Exception { Cipher.getInstance("AES/EAX/"); }
  void m18() throws Exception { Cipher.getInstance("AES/OCB/x"); }
  void m19() throws Exception { Cipher.getInstance("AESx/GCM/NoPadding"); }
  void m20() throws Exception { Cipher.getInstance("AES/GCM/NoPadding "); }
  void m21() throws Exception { Cipher.getInstance("ChaCha20-Poly1305/None/NoPadding"); }
  void m22() throws Exception { Cipher.getInstance("XChaCha20-Poly1305"); }
  void m23() throws Exception { Cipher.getInstance("ECIESx"); }
  void m24() throws Exception { Cipher.getInstance("ECIES "); }
  void m25() throws Exception { Cipher.getInstance("AESx/ECB/a"); }
  void m26() throws Exception { Cipher.getInstance("DESede/ECB/"); }
  void m27() throws Exception { Cipher.getInstance("DES/ECB/x"); }
  void m28() throws Exception { Cipher.getInstance("AES/ECB/x"); }
  void m29() throws Exception { Cipher.getInstance("X/CBC/PKCS5Paddingx"); }
  void m30() throws Exception { Cipher.getInstance("/CBC/PKCS5Padding"); }
  void m31() throws Exception { Cipher.getInstance("AES/CBC/PKCS5Padding"); }
  void m32() throws Exception { Cipher.getInstance("AES/GCM/PKCS5Padding/CBC/PKCS5Padding"); }
  void m33() throws Exception { Cipher.getInstance("AES/ECB/GCM/x"); }
  void m34() throws Exception { Cipher.getInstance("AES/GCM/ECB/x"); }
  void m35() throws Exception { Cipher.getInstance("DES/GCM/NoPadding"); }
  void m36() throws Exception { Cipher.getInstance("RSA/GCM/x"); }
  void m37() throws Exception { Cipher.getInstance("RSA"); }
  void m38() throws Exception { Cipher.getInstance(""); }
  void m39() throws Exception { Cipher.getInstance("AES/CBC/PKCS5Padding/GCM/x"); }
  void m40() throws Exception { Cipher.getInstance("x/CCM/y"); }
  void m41() throws Exception { Cipher.getInstance("x/ccm/y"); }
  void m42() throws Exception { Cipher.getInstance("x/EAX/y"); }
  void m43() throws Exception { Cipher.getInstance("x/OCB/y"); }
  void m44() throws Exception { Cipher.getInstance("x/GCM-SIV/y"); }
  void m45() throws Exception { Cipher.getInstance("x/SIV/y"); }
  void m46() throws Exception { Cipher.getInstance("AES/GCM/NoPadding/"); }
  void m47() throws Exception { Cipher.getInstance("GCM/NoPadding"); }
  void m48() throws Exception { Cipher.getInstance("AES/GCM/NoPadding/a/b"); }
  void m49() throws Exception { Cipher.getInstance("AES//GCM/NoPadding"); }
  void m50() throws Exception { Cipher.getInstance("Rsa/ECB/NoPadding"); }
  void m51() throws Exception { Cipher.getInstance("RSA/"); }
  void m52() throws Exception { Cipher.getInstance("ECIES/"); }
  void m53() throws Exception { Cipher.getInstance("ECIESwithAES-CBC"); }
  void m54() throws Exception { Cipher.getInstance("DESede/CBC/PKCS5Padding"); }
  void m55() throws Exception { Cipher.getInstance("AES/ECB/x/"); }
  void k0() throws Exception { KeyGenerator.getInstance("DES", "BC"); }
  void k1() throws Exception { KeyGenerator.getInstance("DES", (java.security.Provider) null); }
  void k2() throws Exception { KeyGenerator.getInstance("RSA/ECB/NoPadding", "BC"); }
  void k3() throws Exception { Cipher.getInstance("DES", "BC"); }
  void k4() throws Exception { Cipher.getInstance("RSA/ECB/NoPadding", "BC"); }
  void k5() throws Exception { Cipher.getInstance("RSA/ECB/NoPadding", (java.security.Provider) null); }
  void k6() throws Exception { Cipher.getInstance("AES/CBC/PKCS5Padding", "BC"); }
  void k7() throws Exception { KeyGenerator.getInstance("AES"); }
  void k8() throws Exception { KeyGenerator.getInstance("DES/ECB/x"); }
}
