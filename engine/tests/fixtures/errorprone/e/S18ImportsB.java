import static s18pkg.a.A.Inner.SUPER_CONST;
import static s18pkg.a.A.foo;
import static s18pkg.b.E.shared;

class S18ImportsB {
  int use() {
    return SUPER_CONST + foo() + shared();
  }
}
