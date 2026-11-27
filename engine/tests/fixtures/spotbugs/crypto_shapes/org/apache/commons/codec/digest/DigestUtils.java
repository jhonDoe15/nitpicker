package org.apache.commons.codec.digest;

import java.security.MessageDigest;

public class DigestUtils {
    public DigestUtils(String name) {}
    public DigestUtils(MessageDigest digest) {}
    public byte[] digest(String data) { return null; }
    public static byte[] digest(MessageDigest digest, byte[] data) { return null; }
    public static MessageDigest getDigest(String name) { return null; }
    public static MessageDigest getDigest(String name, MessageDigest fallback) { return null; }
    public static boolean isAvailable(String name) { return false; }
    public static MessageDigest getMd2Digest() { return null; }
    public static MessageDigest getMd5Digest() { return null; }
    public static MessageDigest getShaDigest() { return null; }
    public static MessageDigest getSha1Digest() { return null; }
    public static byte[] md2(String data) { return null; }
    public static String md2Hex(String data) { return null; }
    public static byte[] md5(String data) { return null; }
    public static byte[] md5(byte[] data) { return null; }
    public static byte[] md5(java.io.InputStream data) { return null; }
    public static String md5Hex(String data) { return null; }
    public static byte[] sha(byte[] data) { return null; }
    public static String shaHex(String data) { return null; }
    public static byte[] sha1(String data) { return null; }
    public static String sha1Hex(String data) { return null; }
    public static byte[] sha256(String data) { return null; }
    public static String sha256Hex(String data) { return null; }
}
