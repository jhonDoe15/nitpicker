package com.google.protobuf;

public abstract class ByteString {
  public abstract String toStringUtf8();

  public static ByteString copyFrom(byte[] bytes) {
    return null;
  }

  public static ByteString copyFrom(String text, String charset) {
    return null;
  }

  public static ByteString copyFrom(String text, java.nio.charset.Charset charset) {
    return null;
  }

  public static ByteString copyFromUtf8(String text) {
    return null;
  }
}
