package p;
import java.io.*;
public class T {
    public void t1() { try { thr(); } catch (IOException e) { if (e instanceof FileNotFoundException) foo(e); } }
    public void t2() { try { thr(); } catch (IOException e) { Object o = e; if (o instanceof FileNotFoundException) foo(e); } }
    public void t3(boolean b) { IOException ex = new IOException(); for (int i = 0; i < 3; i++) { try { thr(); } catch (IOException e) { ex = e; } } if (ex instanceof FileNotFoundException) foo(ex); }
    public void t4() { try { thr(); } catch (Exception e) { if (e instanceof RuntimeException) foo(e); } }
    public void t5() { try { foo(1); } catch (Exception e) { if (e instanceof IllegalStateException) foo(e); } }
    public void t6() { try { foo(1); } catch (Throwable e) { if (e instanceof Error) foo(e); } }
    public void t7() { try { foo(1); } catch (Error e) { if (e instanceof OutOfMemoryError) foo(e); } }
    public void t8(boolean b) { try { if (b) throw new IOException(); foo(1); } catch (Exception e) { if (e instanceof FileNotFoundException) foo(e); } }
    public void t9() { try { thrAll(); } catch (Exception e) { if (e instanceof IOException) foo(e); } }
    public void t10() { try { foo(1); } catch (Exception e) { if (e instanceof IOException) foo(e); } }
    public void t11() { try { foo(1); } catch (Throwable e) { if (e instanceof IOException) foo(e); } }
    public void t12() { try { thr(); } catch (Exception e) { if (e instanceof InterruptedException) foo(e); } }
    public void t13() { try { thr(); } catch (IOException e) { FileNotFoundException f = (FileNotFoundException) e; foo(f); } }
    public void t14() { try { thr(); thr2(); } catch (Exception e) { if (e instanceof IOException) foo(e); } }
    public void t15() { try { thr2(); thr(); } catch (Exception e) { if (e instanceof IOException) foo(e); } }
    public void t16() { try { thr2(); thr(); } catch (Exception e) { if (e instanceof InterruptedException) foo(e); } }
    public void t17() { try { foo(1); } catch (RuntimeException e) { if (e instanceof IllegalStateException) foo(e); } }
    public void t18() { try { thr(); } catch (IOException | RuntimeException e) { if (e instanceof FileNotFoundException) foo(e); } }
    public void t19() { try { thr(); } catch (RuntimeException e) { if (e instanceof IllegalStateException) foo(e); } catch (Exception e) { if (e instanceof FileNotFoundException) foo(e); } }
    public void t20() { try { thrNpe(); } catch (Exception e) { if (e instanceof IOException) foo(e); } }
    static void thr() throws IOException {}
    static void thr2() throws InterruptedException {}
    static void thrAll() throws Exception {}
    static void thrNpe() throws NullPointerException {}
    static void foo(Object o) {}
}
