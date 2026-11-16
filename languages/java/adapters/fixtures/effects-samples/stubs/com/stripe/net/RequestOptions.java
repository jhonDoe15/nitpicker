package com.stripe.net;

public class RequestOptions {
  public static Builder builder() {
    return new Builder();
  }

  public static class Builder {
    public Builder setIdempotencyKey(String key) {
      return this;
    }

    public RequestOptions build() {
      return new RequestOptions();
    }
  }
}
