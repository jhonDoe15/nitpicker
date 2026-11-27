package c;
import java.security.*;
import javax.crypto.*;
import javax.crypto.spec.*;
public class K6 {
  void w1() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); k.init(32);
    k.init(64); }
  void w2() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); k.init(64);
    k.init(200); }
  void w3() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); k.init(64);
    KeyGenerator.getInstance("AES"); }
  void w4(KeyGenerator k) throws Exception { k.init(64);
    k.init(32);
    KeyGenerator.getInstance("Blowfish"); }
  void w5() throws Exception { int n = 64; KeyGenerator k = KeyGenerator.getInstance("Blowfish"); k.init(n); }
}
