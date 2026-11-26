package e;

import com.google.protobuf.ByteString;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.io.Reader;
import java.io.Writer;
import java.util.Scanner;

public class B4DefaultCharset {
  FileReader field;

  void m(String s, byte[] bytes, InputStream in, OutputStream out, File file, ByteArrayOutputStream baos, boolean append) throws IOException {
    byte[] a = s.getBytes();
    String b = new String(bytes);
    String c = new String(bytes, 0, 1);
    Reader d = new InputStreamReader(in);
    Writer e = new OutputStreamWriter(out);
    String f = baos.toString();
    ByteString g = ByteString.copyFrom(s.getBytes());
    ByteString h = com.google.protobuf.ByteString.copyFrom("x".getBytes());
    FileReader i = new FileReader(file);
    BufferedReader j = new BufferedReader(new FileReader(s));
    Reader k = new BufferedReader(new FileReader("name"), 10);
    FileWriter l = new FileWriter(file);
    FileWriter m = new FileWriter(s, true);
    FileWriter n = new FileWriter(file, append);
    FileWriter o = new FileWriter(s, false);
    BufferedWriter p = new BufferedWriter(new FileWriter(s));
    PrintWriter q = new PrintWriter(file);
    PrintWriter r = new PrintWriter(s);
    PrintWriter t = new PrintWriter(out);
    PrintWriter u = new PrintWriter(out, true);
    Scanner v = new Scanner(in);
    Scanner w = new Scanner(file);
    field = new FileReader(file);
    var x = new FileReader(file);
    Object y = new FileReader(file);
    String z = new String(bytes, "UTF-8");
    new PrintWriter(System.out);
    new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out)));
    s.getBytes(java.nio.charset.StandardCharsets.UTF_8);
    baos.toString("UTF-8");
  }

  @SuppressWarnings("DefaultCharset")
  void sup(String s) {
    s.getBytes();
  }
}
