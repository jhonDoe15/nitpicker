package e;

import static s11b.S11B.Inner;
import static s11a.S11A.Other;
import static s11a.S11A.Generic.f;
import static s11b.S11B.VALUE;
import static s11b.S11B.*;

class S11Imports {
  Object use() {
    return new Inner();
  }

  Object use2(Other other) {
    f();
    return VALUE;
  }
}
