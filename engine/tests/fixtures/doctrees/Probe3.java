package p;
class Probe3 {
    /**
     * text { 
     * @param x
     */
    int f0;
    /**
     * {<b>x</b>}
     */
    int f1;
    /**
     * a {
     * <p>
     */
    int f2;
    /**
     * {{@code x}}
     */
    int f3;
    /**
     * {&amp;}
     */
    int f4;
    /**
     * text {
     */
    int f5;
    /**
     * a {b} c
     * @return {x} y {
     */
    int f6;
    /**
     * @param T>
     */
    int f7;
    /**
     * @param T> x
     */
    int f8;
    /**
     * @param <T>
     */
    int f9;
    /**
     * @param < T> x
     */
    int f10;
    /**
     * @param <T > x
     */
    int f11;
    /**
     * @see Foo#bar(int,
     * @param x
     */
    int f12;
    /**
     * @see "a
     *  b"
     */
    int f13;
    /**
     * @see "a"
     * @param x
     */
    int f14;
    /**
     * @see <a href="x">y</a>
     * @param x
     */
    int f15;
    /**
     * @see
     * @param x
     */
    int f16;
    /**
     * @throws Foo<Bar,
     *  Baz> x
     */
    int f17;
    /**
     * @return {@link Foo#bar(int,
     *    int) label} more
     */
    int f18;
    /**
     * {@link Foo#bar(int,
     * @see x
     */
    int f19;
    /**
     * <a href='x
     * @see y'>z</a>
     */
    int f20;
    /**
     * <a href=x
     * @see y>z</a>
     */
    int f21;
    /**
     * <a
     * @see y
     */
    int f22;
    /**
     * </a
     * @see y
     */
    int f23;
    /**
     * <!-- x
     * @see y --> z
     */
    int f24;
    /**
     * {@code x
     * @see y} z
     */
    int f25;
    /**
     * {@snippet :
     * @see y
     * } z
     */
    int f26;
    /**
     * {@index a
     * @see y} z
     */
    int f27;
    /**
     * {@index "a
     * @see y" b} z
     */
    int f28;
    /**
     * @see "a
     * @see y" b
     */
    int f29;
    /**
     * @@
     */
    int f30;
    /**
     * @@@param x
     */
    int f31;
    /**
     * @*/ x
     */
    int f32;
    /**
     * a*@/b
     */
    int f33;
    /**
     * {@link Foo @@}
     */
    int f34;
    /**
     * @author a@b.c
     */
    int f35;
    /**
     * @since 1.0 {@code x} <b>y</b> &amp; z
     */
    int f36;
    /**
     * @serial include extra
     */
    int f37;
    /**
     * @serial exclude
     */
    int f38;
    /**
     * @hidden
     * @see Foo
     */
    int f39;
    /**
     * @provides Foo
     * @uses Bar
     */
    int f40;
    /**
     * @spec
     * @see Foo
     */
    int f41;
    /**
     * @spec http://x
     */
    int f42;
    /**
     * @unknown-tag {@code a} b
     */
    int f43;
    /**
     * @version $Id$
     */
    int f44;
    /**
     * &#x1F600;
     */
    int f45;
    /**
     * &#1234567890123;
     */
    int f46;
    /**
     * &amp;amp;
     */
    int f47;
    /**
     * &amp
     */
    int f48;
    /**
     * &amp; &lt;b&gt; &#64;param
     */
    int f49;
    /**
     * <b><i>nested</i></b> <br> <hr/>
     */
    int f50;
    /**
     * <p>para
     * <ul>
     * <li>one
     * <li>two
     * </ul>
     */
    int f51;
    /**
     * <a href="x"
     *    title="y">z</a>
     */
    int f52;
    /**
     * <a href="{@docRoot}/x.html#y">z</a>
     */
    int f53;
    /**
     * <a href="x>y</a>
     */
    int f54;
    /**
     * <a href="x" title='y>z</a>
     */
    int f55;
    /**
     * <img src=x.png alt=y/>
     */
    int f56;
    /**
     * <code>{@code x}</code>
     */
    int f57;
    /**
     * <pre>{@code
     *   if (a < b && c > d) {
     *     x();
     *   }
     * }</pre>
     */
    int f58;
    /**
     * <pre>
     *   if (a < b && c > d) {
     *     x();
     *   }
     * </pre>
     */
    int f59;
    /**
     * <pre>
     *   List<String> x = new ArrayList<>();
     * </pre>
     */
    int f60;
    /**
     * <pre>
     *   @Override
     *   public void x() {}
     * </pre>
     * @return y
     */
    int f61;
    /**
     * a -> b <- c <= d >= e <> f << g >> h
     */
    int f62;
    /**
     * 1 < 2 and 2 > 1 & 3
     */
    int f63;
    /**
     * a<b
     */
    int f64;
    /**
     * a<b c
     */
    int f65;
    /**
     * a <b c>
     */
    int f66;
    /**
     * <b c=d e>
     */
    int f67;
    /**
     * Use {@code Map<String, List<Integer>>} or {@literal a & b}.
     */
    int f68;
    /**
     * Use {@link java.util.Map.Entry#getKey() the key} and {@linkplain #foo(int, String) that}.
     */
    int f69;
    /**
     * {@link Foo#bar(int, String)}.
     */
    int f70;
    /**
     * {@link #equals(Object)} {@link #hashCode()}
     */
    int f71;
    /**
     * {@value #FOO} {@value Bar#BAZ} {@value}
     */
    int f72;
    /**
     * {@inheritDoc} and more
     */
    int f73;
    /**
     * {@inheritDoc}
     * @param x {@inheritDoc}
     * @return {@inheritDoc}
     */
    int f74;
    /**
     * 		tabs
     */
    int f75;
    /**
     * trailing spaces   
     *    
     * @return   spaced   
     *    
     */
    int f76;
    /**
     * {@summary First sentence.} Rest.
     */
    int f77;
    /**
     * First. Second. Third.
     *
     * <p>More.
     */
    int f78;
    /**
     * First
     * <p>
     * Second
     */
    int f79;
    /**
     * First<p>Second
     */
    int f80;
    /**
     * First.<br>Second
     */
    int f81;
    /**
     * {@code a}. Second
     */
    int f82;
    /**
     * <p>First.</p> Second
     */
    int f83;
}
