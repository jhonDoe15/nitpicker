package org.owasp.esapi;

import org.owasp.esapi.crypto.CipherText;
import org.owasp.esapi.crypto.PlainText;

public interface Encryptor {
    String hash(String text, String salt) throws Exception;
    CipherText encrypt(PlainText plain) throws Exception;
    CipherText encrypt(javax.crypto.SecretKey key, PlainText plain) throws Exception;
    PlainText decrypt(CipherText cipher) throws Exception;
    PlainText decrypt(javax.crypto.SecretKey key, CipherText cipher) throws Exception;
    String hash(String text, String salt, int iterations) throws Exception;
    String sign(String data) throws Exception;
    boolean verifySignature(String signature, String data);
    String unseal(String seal) throws Exception;
    boolean verifySeal(String seal);
    long getTimeStamp();
    long getRelativeTimeStamp(long offset);
    String seal(String data, long expiration) throws Exception;
}
