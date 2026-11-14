package com.stripe.model;

import com.stripe.net.RequestOptions;
import java.util.Map;

public class PaymentIntent {
  public static PaymentIntent create(Map<String, Object> params) {
    return new PaymentIntent();
  }

  public static PaymentIntent create(Map<String, Object> params, RequestOptions options) {
    return new PaymentIntent();
  }
}
