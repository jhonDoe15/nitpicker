package com.google.common.html.types;

import com.google.protobuf.ByteString;

public final class SafeHtmlProto {
  public static Builder newBuilder() {
    return new Builder();
  }

  public boolean hasPrivateDoNotAccessOrElseSafeHtmlWrappedValue() {
    return false;
  }

  public String getPrivateDoNotAccessOrElseSafeHtmlWrappedValue() {
    return "";
  }

  public ByteString getPrivateDoNotAccessOrElseSafeHtmlWrappedValueBytes() {
    return null;
  }

  public String getSomethingElse() {
    return "";
  }

  public static final class Builder {
    public Builder clearPrivateDoNotAccessOrElseSafeHtmlWrappedValue() {
      return this;
    }

    public Builder setPrivateDoNotAccessOrElseSafeHtmlWrappedValue(String value) {
      return this;
    }

    public Builder setPrivateDoNotAccessOrElseSafeHtmlWrappedValueBytes(ByteString value) {
      return this;
    }

    public boolean hasPrivateDoNotAccessOrElseSafeHtmlWrappedValue() {
      return false;
    }

    public String getPrivateDoNotAccessOrElseSafeHtmlWrappedValue() {
      return "";
    }

    public ByteString getPrivateDoNotAccessOrElseSafeHtmlWrappedValueBytes() {
      return null;
    }

    public SafeHtmlProto build() {
      return null;
    }
  }
}
