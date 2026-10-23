package com.acme.features.orders;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.sql.Connection;

public class OrderHttp {
  public void write(HttpServletResponse response, OrderView view) {}

  public OrderView read(HttpServletRequest request, HttpServletResponse response) {
    return null;
  }

  public Connection open(HttpServletRequest request) {
    return null;
  }
}
