package kin;

import java.io.Serializable;

public interface Labeled extends Named, Serializable {
  default String label() {
    return "[" + name() + "]";
  }
}
