import static s18pkg.b.B.CONST;
import static s18pkg.b.B.bar;
import static s18pkg.b.B.foo;

class S18ImportsA {
  int use() {
    return CONST + foo() + bar();
  }
}
