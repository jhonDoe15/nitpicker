package demo;

import java.nio.charset.Charset;

public class Charsets {
  Charset charsets(String name) {
    Charset utf8 = Charset.forName("UTF-8");
    Charset dynamic = Charset.forName(name);
    Charset legacy = Charset.forName("windows-1252");
    return utf8.equals(dynamic) ? legacy : utf8;
  }
}
