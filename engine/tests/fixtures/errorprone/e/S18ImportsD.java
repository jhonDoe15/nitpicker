import static s18pkg.b.B.Both;
import static s18pkg.b.B.Inner;

class S18ImportsD {
  Both use() {
    Inner inner = new Inner();
    return new Both();
  }
}
