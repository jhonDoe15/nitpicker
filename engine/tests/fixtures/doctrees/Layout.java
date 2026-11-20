package p;
class Layout {
    /** one line */
    int a;
    /**one line tight*/
    int b;
    /*** three stars */
    int c;
    /** ends with stars **/
    int d;
    /**
     * stars ***/
    int e;
    /**
       no stars here
         indented more
     */
    int f;
    /**
     ** double stars
     *** triple stars
     */
    int g;
    /**
     *no space after star
     *@return tight tag
     */
    int h() { return 0; }
    /** */
    int i;
    /***/
    int j;
    /**
     */
    int k;
    /**
     *
     */
    int l;
    /** @return x */
    int m() { return 0; }
    /**
	 * tabs before star
	 *	tab after star
     */
    int n;
    /**   leading spaces
     *    @param x indented tag
     *  text * star in text
     */
    int o;
    /** first
    second without star @notag
    @return tag without star
    */
    int p() { return 0; }
    /**
     * text
     * @return x*/
    int q() { return 0; }
    /**
     * text
     * @return */
    int r() { return 0; }
    /** text. *
     * * list item
     */
    int s;
    /**
     * A<B> c &amp; d
     @param x no star
     */
    int t;
    /** {@code x} */
    int u;
    /**
     * @param <T>   spaced   description   
     * @throws   Foo    spaced
     */
    int v;
    /** @deprecated */
    int w;
    /**
     * @deprecated
     */
    int x;
}
