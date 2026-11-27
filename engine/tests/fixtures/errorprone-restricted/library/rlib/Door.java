package rlib;

import com.google.errorprone.annotations.RestrictedApi;

public interface Door {
  @RestrictedApi(explanation = "door")
  void knock();
}
