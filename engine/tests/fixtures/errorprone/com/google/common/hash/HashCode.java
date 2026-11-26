package com.google.common.hash;

public abstract class HashCode {
  public abstract int asInt();

  public abstract long asLong();

  public abstract long padToLong();
}
