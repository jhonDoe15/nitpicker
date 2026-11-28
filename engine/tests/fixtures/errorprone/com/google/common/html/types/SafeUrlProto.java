package com.google.common.html.types;

import com.google.protobuf.ByteString;

public final class SafeUrlProto {
  public static Builder newBuilder() {
    return new Builder();
  }

  public boolean hasPrivateDoNotAccessOrElseSafeUrlWrappedValue() {
    return false;
  }

  public String getPrivateDoNotAccessOrElseSafeUrlWrappedValue() {
    return "";
  }

  public ByteString getPrivateDoNotAccessOrElseSafeUrlWrappedValueBytes() {
    return null;
  }

  public String getSomethingElse() {
    return "";
  }

  public static final class Builder {
    public Builder clearPrivateDoNotAccessOrElseSafeUrlWrappedValue() {
      return this;
    }

    public Builder setPrivateDoNotAccessOrElseSafeUrlWrappedValue(String value) {
      return this;
    }

    public Builder setPrivateDoNotAccessOrElseSafeUrlWrappedValueBytes(ByteString value) {
      return this;
    }

    public boolean hasPrivateDoNotAccessOrElseSafeUrlWrappedValue() {
      return false;
    }

    public String getPrivateDoNotAccessOrElseSafeUrlWrappedValue() {
      return "";
    }

    public ByteString getPrivateDoNotAccessOrElseSafeUrlWrappedValueBytes() {
      return null;
    }

    public SafeUrlProto build() {
      return null;
    }
  }
}
