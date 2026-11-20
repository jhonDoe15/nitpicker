package p;
class Probe4 {
    /**
     * Tests for {@@link Foo}.
     */
    int f0;
    /**
     * a {@@ b
     */
    int f1;
    /**
     * {@@}
     */
    int f2;
    /**
     * {@* x}
     */
    int f3;
    /**
     * {@/ x}
     */
    int f4;
    /**
     * x {@ y} z
     */
    int f5;
    /**
     * x { @y} z
     */
    int f6;
    /**
     * @ @author x
     */
    int f7;
    /**
     * @
     * @author x
     */
    int f8;
    /**
     * @throws Foo}bar x
     */
    int f9;
    /**
     * @see Foo}bar x
     */
    int f10;
    /**
     * @see Foo{bar x
     */
    int f11;
    /**
     * @throws Foo@Bar x
     */
    int f12;
    /**
     * {@link Foo@return}
     */
    int f13;
    /**
     * {@link Foo@see}
     */
    int f14;
    /**
     * {@link Foo@}
     */
    int f15;
    /**
     * {@link Foo@1}
     */
    int f16;
    /**
     * {@link Foo@Bar.Baz}
     */
    int f17;
    /**
     * x {
     */
    int f18;
    /**
     * x {
     *
     */
    int f19;
    /**
     * @author x
     * {
     */
    int f20;
    /**
     * @author x {
     */
    int f21;
}
