package nitpicker.designfacts;

import java.util.*;

final class Local {
  final String name;
  final int param;
  Ty ty;

  Local(String name, Ty ty, int param) {
    this.name = name;
    this.ty = ty;
    this.param = param;
  }
}
