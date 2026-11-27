package p;
import java.io.File;
import java.util.*;
import java.nio.file.*;
public class G {
  public void h1() { new File(String.valueOf(new Object())); }
  public void h2() { new File(String.valueOf((Object) "a")); }
  public void h3() { new File(String.valueOf(new StringBuilder("a"))); }
  public void h5() { new File(Paths.get("a").toString()); }
  public void h6() { List<String> l = new ArrayList<>(); new File(String.valueOf(l)); }
  public void h7() { new File(Optional.of("a").get()); }
  public void h8() { new File(String.valueOf(1)); }
  public void h9() { Object o = "a"; new File(o.toString()); }
  public void h10() { new File("a".toString()); }
  public void h11() { new File(List.of("a").get(0)); }
  public void h12() { new File(Arrays.asList("a").get(0)); }
  public void h13() { new File(String.valueOf(new String[] {"a"})); }
  public void h16() { Map<String,String> m = new HashMap<>(); m.put("a", "b"); new File(m.get("a")); }
  public void h17() { new File(String.valueOf((Object) null)); }
  public void h18() { new File(new String("a")); }
  public void h19(String s) { new File(new String(s)); }
}
