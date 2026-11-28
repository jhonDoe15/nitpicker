package com.google.protobuf;

public interface MessageLite {
  ByteString toByteString();

  Builder toBuilder();

  interface Builder {
    MessageLite build();

    MessageLite buildPartial();

    boolean isInitialized();
  }
}
