package com.acme.features.security;

import jakarta.servlet.http.HttpServletResponse;

public class TokenProvider {
  public void attach(HttpServletResponse response, String token) {}
}
