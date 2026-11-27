package c;
import org.owasp.esapi.*;
import org.owasp.esapi.crypto.*;
public class Z3 {
  void a(Encryptor e) throws Exception { e.hash("a", "b"); }
  void b(Encryptor e) throws Exception { e.hash("a", "b", 2); }
  void c(Encryptor e, javax.crypto.SecretKey k) throws Exception { e.encrypt(k, new PlainText("x")); }
  void d(Encryptor e, javax.crypto.SecretKey k, CipherText c) throws Exception { e.decrypt(k, c); }
  void f(Encryptor e) throws Exception { e.sign("a"); }
  void g(Encryptor e) throws Exception { e.verifySignature("a", "b"); }
  void h(Encryptor e) throws Exception { e.seal("a", 1L); }
  void i(Encryptor e) throws Exception { e.unseal("a"); }
  void j(Encryptor e) throws Exception { e.verifySeal("a"); }
  void k(Encryptor e) throws Exception { e.getTimeStamp(); e.getRelativeTimeStamp(1L); }
  interface My extends Encryptor {}
  void l(My e) throws Exception { e.encrypt(new PlainText("x")); }
  void m(Encryptor e) throws Exception { e.encrypt(new PlainText("x")); e.decrypt(null); e.encrypt(null); }
  void n(Encryptor e) throws Exception { e.encrypt(new PlainText("x"));
    e.decrypt(null); }
  void o(Encryptor e) throws Exception { Runnable r = () -> { try { e.encrypt(null); } catch (Exception x) {} }; }
}
