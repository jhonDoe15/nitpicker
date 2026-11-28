package p;
import java.io.File;
import java.sql.*;
import java.util.*;
public class T {
  private String field;
  private static final String CONST = "x";
  private static String sfield;
  public void a1(String s) { new File(s); }
  public void a2() { new File("const"); }
  public void a3() { new File(CONST); }
  public void a4() { new File(field); }
  public void a5() { new File(sfield); }
  public void a6() { new File(System.getenv("X")); }
  public void a7() { new File(System.getProperty("X")); }
  public void a8(int i) { new File(String.valueOf(i)); }
  public void a9(String s) { String t = s.trim(); new File(t); }
  public void a10(String s) { new File("/a/" + s); }
  public void a11(String s) { StringBuilder b = new StringBuilder(); b.append(s); new File(b.toString()); }
  public void a12(String s) { new File(String.format("%s", s)); }
  public void a13(List<String> l) { new File(l.get(0)); }
  public void a14() { new File(helper()); }
  private String helper() { return "k"; }
  public void a15(String s) { new File(id(s)); }
  private String id(String s) { return s; }
  public void a16(String s) { new File(Integer.toString(Integer.parseInt(s))); }
  public void a17(Statement st, String s) throws SQLException { st.executeQuery(s); }
  public void a18(Statement st) throws SQLException { st.executeQuery("select 1"); }
  public void a19(Statement st, String s) throws SQLException { st.executeQuery("select " + s); }
  public void a20(String s) throws Exception { Runtime.getRuntime().exec(s); }
  public void a21(String s) throws Exception { Runtime.getRuntime().exec("ls"); }
  public void a22() { new File(new Object().toString()); }
  public void a23(Scanner sc) { new File(sc.nextLine()); }
  public void a24(String[] args) { new File(args[0]); }
  private void a25(String s) { new File(s); }
  public void a30(String s) { String t = s.toLowerCase(); String u = t.substring(1); new File(u); }
  public void a31(String s) { new File(s.replace("..", "")); }
  public void a32(String s) { new File(org(s)); }
  public static String org(String s) { return s + "x"; }
  public void a33(String s) { new File(java.net.URLEncoder.encode(s)); }
  public void a34(String s) { new File(org.apache.commons.io.FilenameUtils.getName(s)); }
}
