package p;
class Refs {
    /**
     * @see Foo#bar(int)label
     */
    int f0;
    /**
     * @see Foo(int)
     */
    int f1;
    /**
     * @see #bar(int[] , String...)
     */
    int f2;
    /**
     * {@link Foo#bar(java.util.List<? extends T>, int[]...)}
     */
    int f3;
    /**
     * {@link Foo.Bar[]}
     */
    int f4;
    /**
     * {@link Foo#bar()#baz}
     */
    int f5;
    /**
     * {@link Foo#bar(}
     */
    int f6;
    /**
     * {@link  Foo#bar(int)) x}
     */
    int f7;
    /**
     * {@link Foo#bar(int)x y}
     */
    int f8;
    /**
     * {@link Foo#<T>bar()}
     */
    int f9;
    /**
     * {@link Foo<}
     */
    int f10;
    /**
     * {@link Foo<Bar x}
     */
    int f11;
    /**
     * {@link Map<String, Integer> x}
     */
    int f12;
    /**
     * {@link Map<String,Integer> x}
     */
    int f13;
    /**
     * {@link a.b.c/d.e.F}
     */
    int f14;
    /**
     * {@link mod/}
     */
    int f15;
    /**
     * {@link Foo##frag ment}
     */
    int f16;
    /**
     * {@link ##frag}
     */
    int f17;
    /**
     * {@link Foo#bar(int)[]}
     */
    int f18;
    /**
     * {@link Foo[]#length}
     */
    int f19;
    /**
     * {@link int}
     */
    int f20;
    /**
     * {@link int[]}
     */
    int f21;
    /**
     * {@link Foo#Foo}
     */
    int f22;
    /**
     * {@link Foo#new}
     */
    int f23;
    /**
     * {@link Foo#class}
     */
    int f24;
    /**
     * {@link Foo.}
     */
    int f25;
    /**
     * {@link .Foo}
     */
    int f26;
    /**
     * {@link Foo#bar(int,)}
     */
    int f27;
    /**
     * {@link Foo#bar(,)}
     */
    int f28;
    /**
     * {@link Foo#bar(@Nullable String)}
     */
    int f29;
    /**
     * {@link Foo#bar(final int)}
     */
    int f30;
    /**
     * {@link Foo#bar(int...)}
     */
    int f31;
    /**
     * {@link Foo#bar(String name, int count)}
     */
    int f32;
    /**
     * {@link Foo$Bar}
     */
    int f33;
    /**
     * {@link Foo-bar}
     */
    int f34;
    /**
     * {@link Foo+bar}
     */
    int f35;
    /**
     * {@link 1Foo}
     */
    int f36;
    /**
     * {@link Foo#1bar}
     */
    int f37;
    /**
     * {@link Foo::bar}
     */
    int f38;
    /**
     * {@link Foo#bar[]}
     */
    int f39;
    /**
     * {@link Foo?}
     */
    int f40;
    /**
     * {@link ?}
     */
    int f41;
    /**
     * {@link Foo<?>}
     */
    int f42;
    /**
     * {@link Foo<? extends Bar>#x}
     */
    int f43;
    /**
     * {@link Foo<A,B>.Bar<C>}
     */
    int f44;
    /**
     * {@link http://example.com}
     */
    int f45;
    /**
     * {@link https://example.com/a?b=c label}
     */
    int f46;
    /**
     * {@link Foo,Bar}
     */
    int f47;
    /**
     * {@link Foo;}
     */
    int f48;
    /**
     * {@link Foo#bar(int) }
     */
    int f49;
    /**
     * {@link this}
     */
    int f50;
    /**
     * {@link Foo.this}
     */
    int f51;
    /**
     * {@link Foo#bar(Foo.Bar)}
     */
    int f52;
    /**
     * {@link Foo#bar(int[][])}
     */
    int f53;
    /**
     * {@link Foo#bar(int []) }
     */
    int f54;
    /**
     * {@link #bar( int , String )}
     */
    int f55;
    /**
     * {@link Foo #bar}
     */
    int f56;
    /**
     * {@link Foo#bar(int a, b)}
     */
    int f57;
    /**
     * {@link Foo#bar()}
     */
    int f58;
    /**
     * {@link Foo#bar(  )}
     */
    int f59;
    /**
     * {@link #bar(String...) }
     */
    int f60;
    /**
     * {@link Foo,}
     */
    int f61;
    /**
     * {@link Foo).}
     */
    int f62;
    /**
     * {@link Foo(}
     */
    int f63;
    /**
     * {@link Foo)}
     */
    int f64;
    /**
     * {@link (Foo)}
     */
    int f65;
    /**
     * {@link Foo#bar(int)(int)}
     */
    int f66;
    /**
     * {@link Foo#bar(List<String> names)}
     */
    int f67;
    /**
     * {@link Foo#bar(Map<String, List<Integer>> m, T... rest)}
     */
    int f68;
    /**
     * {@link Foo#bar(Map.Entry<K,V>[] e)}
     */
    int f69;
    /**
     * {@link Foo#bar(a.b.C)}
     */
    int f70;
    /**
     * {@link Foo#bar(1)}
     */
    int f71;
    /**
     * {@link Foo#bar("x")}
     */
    int f72;
    /**
     * {@link Foo#bar(int int)}
     */
    int f73;
    /**
     * {@link Foo#bar(int a b)}
     */
    int f74;
    /**
     * {@link Foo#bar(int... a)}
     */
    int f75;
    /**
     * {@link Foo#bar(...)}
     */
    int f76;
    /**
     * {@link Foo#bar(int.)}
     */
    int f77;
    /**
     * {@link Foo#bar(.int)}
     */
    int f78;
    /**
     * {@link Foo#bar(int[)}
     */
    int f79;
    /**
     * {@link Foo#bar(int])}
     */
    int f80;
    /**
     * {@link Foo#bar(? x)}
     */
    int f81;
    /**
     * {@link Foo#bar(List<?>)}
     */
    int f82;
    /**
     * {@link Foo#bar(List<>)}
     */
    int f83;
    /**
     * {@link Foo#bar(List<String)}
     */
    int f84;
    /**
     * {@link Foo#bar(void)}
     */
    int f85;
    /**
     * {@link Foo#bar(var x)}
     */
    int f86;
    /**
     * {@link Foo#bar(Foo.Bar.Baz x)}
     */
    int f87;
    /**
     * {@link Foo#bar(Outer<A>.Inner<B> x)}
     */
    int f88;
    /**
     * {@link Foo# bar}
     */
    int f89;
    /**
     * {@link Foo#bar baz}
     */
    int f90;
    /**
     * {@link Foo.bar()}
     */
    int f91;
    /**
     * {@link foo.bar.Baz#qux(int)}
     */
    int f92;
    /**
     * {@link Foo<T>}
     */
    int f93;
    /**
     * {@link Foo<T>.Bar}
     */
    int f94;
    /**
     * {@link Foo<T>#bar}
     */
    int f95;
    /**
     * {@link Foo<T[]>}
     */
    int f96;
    /**
     * {@link Foo<int>}
     */
    int f97;
    /**
     * {@link Foo<T> .Bar}
     */
    int f98;
    /**
     * {@link Foo< T >}
     */
    int f99;
    /**
     * {@link Foo<T,>}
     */
    int f100;
    /**
     * {@link Foo<<T>>}
     */
    int f101;
    /**
     * {@link Foo>}
     */
    int f102;
    /**
     * {@link Foo<T>>}
     */
    int f103;
    /**
     * {@link Foo[}
     */
    int f104;
    /**
     * {@link Foo]}
     */
    int f105;
    /**
     * {@link Foo[] []}
     */
    int f106;
    /**
     * {@link Foo[]x}
     */
    int f107;
    /**
     * {@link Foo[1]}
     */
    int f108;
    /**
     * {@link äöü}
     */
    int f109;
    /**
     * {@link Foo#äöü(Ünï)}
     */
    int f110;
    /**
     * {@link _foo}
     */
    int f111;
    /**
     * {@link $foo}
     */
    int f112;
    /**
     * {@link Foo#_}
     */
    int f113;
    /**
     * {@link assert}
     */
    int f114;
    /**
     * {@link Foo#if}
     */
    int f115;
    /**
     * {@link if}
     */
    int f116;
    /**
     * {@link Foo.if}
     */
    int f117;
    /**
     * {@link true}
     */
    int f118;
    /**
     * {@link null}
     */
    int f119;
    /**
     * {@link Foo#null}
     */
    int f120;
    /**
     * {@link enum}
     */
    int f121;
    /**
     * {@link record}
     */
    int f122;
    /**
     * {@link Foo#bar(enum)}
     */
    int f123;
    /**
     * {@link Foo#bar(int enum)}
     */
    int f124;
    /**
     * {@link Foo#bar(int if)}
     */
    int f125;
    /**
     * {@link Foo#bar(if x)}
     */
    int f126;
    /**
     * {@link Foo@Bar}
     */
    int f127;
    /**
     * {@link Foo#bar@baz}
     */
    int f128;
    /**
     * {@link Foo%}
     */
    int f129;
    /**
     * {@link Foo=}
     */
    int f130;
    /**
     * {@link Foo*}
     */
    int f131;
    /**
     * {@link Foo/}
     */
    int f132;
    /**
     * {@link Foo/Bar}
     */
    int f133;
    /**
     * {@link Foo/bar.Baz#qux}
     */
    int f134;
    /**
     * {@link a.b/}
     */
    int f135;
    /**
     * {@link a.b/#x}
     */
    int f136;
    /**
     * {@link /Foo}
     */
    int f137;
    /**
     * {@link a/b/C}
     */
    int f138;
    /**
     * {@link Foo\\Bar}
     */
    int f139;
    /**
     * {@link Foo'}
     */
    int f140;
    /**
     * {@link Foo|Bar}
     */
    int f141;
    /**
     * {@link Foo&Bar}
     */
    int f142;
    /**
     * {@link Foo&amp;Bar}
     */
    int f143;
    /**
     * {@link Foo<A&B>}
     */
    int f144;
    /**
     * {@link Foo<A & B>}
     */
    int f145;
    /**
     * {@link Foo<? super A>}
     */
    int f146;
    /**
     * {@link Foo<? super A>}
     */
    int f147;
    /**
     * {@link Foo#bar(A & B)}
     */
    int f148;
    /**
     * {@link Foo#bar(A|B)}
     */
    int f149;
    /**
     * {@link Foo ##frag}
     */
    int f150;
    /**
     * {@link Foo##}
     */
    int f151;
    /**
     * {@link Foo##a#b}
     */
    int f152;
    /**
     * {@link Foo##a b}
     */
    int f153;
    /**
     * {@link ##}
     */
    int f154;
    /**
     * {@link Foo###x}
     */
    int f155;
    /**
     * {@link Foo#bar##x}
     */
    int f156;
    /**
     * @throws 1Foo x
     */
    int f157;
    /**
     * @throws Foo.Bar<T> x
     */
    int f158;
    /**
     * @throws T x
     */
    int f159;
    /**
     * @throws Foo#bar x
     */
    int f160;
    /**
     * @throws "x" y
     */
    int f161;
    /**
     * @throws <T> y
     */
    int f162;
    /**
     * @throws {@link Foo} y
     */
    int f163;
    /**
     * @throws Foo, Bar y
     */
    int f164;
    /**
     * @throws Foo. y
     */
    int f165;
    /**
     * @throws Foo() y
     */
    int f166;
    /**
     * @throws #x y
     */
    int f167;
    /**
     * @throws int y
     */
    int f168;
    /**
     * @throws Foo[] y
     */
    int f169;
    /**
     * @serialField name int[] desc
     */
    int f170;
    /**
     * @serialField name Foo#x desc
     */
    int f171;
    /**
     * @serialField 1name Foo desc
     */
    int f172;
    /**
     * @serialField name 1Foo desc
     */
    int f173;
    /**
     * @provides 1Foo x
     */
    int f174;
    /**
     * @provides Foo#bar x
     */
    int f175;
    /**
     * @uses a.b.C x
     */
    int f176;
    /**
     * @see Foo.
     */
    int f177;
    /**
     * @see Foo, Bar
     */
    int f178;
    /**
     * @see Foo;
     */
    int f179;
    /**
     * @see Foo#bar(int a, b) x
     */
    int f180;
    /**
     * @see #bar() .
     */
    int f181;
    /**
     * @see http://example.com
     */
    int f182;
    /**
     * @see www.example.com
     */
    int f183;
    /**
     * @see Foo(
     */
    int f184;
    /**
     * @see _foo
     */
    int f185;
    /**
     * @see $foo
     */
    int f186;
    /**
     * @see äöü
     */
    int f187;
    /**
     * @see Foo<Bar
     */
    int f188;
    /**
     * @see Foo <a href="x">y</a>
     */
    int f189;
    /**
     * @see Foo {@code x}
     */
    int f190;
    /**
     * @see Foo &amp; x
     */
    int f191;
    /**
     * @see #
     */
    int f192;
    /**
     * @see ##
     */
    int f193;
    /**
     * @see ##frag
     */
    int f194;
    /**
     * @see Foo#bar(int,
     *    String) label
     */
    int f195;
    /**
     * @see Foo
     * @see Bar
     */
    int f196;
}
