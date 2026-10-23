package com.acme.features.orders;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Response;
import java.sql.ResultSet;

@Path("/orders")
public class OrderResource {
  @GET
  public Response list() {
    return null;
  }

  public ResultSet export() {
    return null;
  }
}
