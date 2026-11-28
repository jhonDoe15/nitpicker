package e;

public class S17Android {
  static final String PATH1 = "/sdcard";

  static final String PATH2 = "/sdcard/file1";

  static final String PATH3 = "/mnt/sdcard/file2";

  static final String PATH4 = "/" + "sd" + "card";

  static final String PATH5 = "/system/media/sdcard";

  static final String PATH6 = "/system/media/sdcard/file3";

  static final String PATH7 = "file://sdcard/file2";

  static final String PATH8 = "file:///sdcard/file2";

  static final String PATH9 = "/data/data/dir/file";

  static final String PATH10 = "/data/user/file1";

  static final String FRAGMENT1 = "/data";

  static final String FRAGMENT2 = "/user";

  static final String PATH11 = "/data" + "/" + "user";

  static final String FOLD1 = "/sdcard" + "/x" + "/y";

  static String fold2(String x) {
    return x + "/sd" + "card";
  }

  static String fold3(String x) {
    return "/sd" + "card" + x;
  }

  static String fold4(String x) {
    return ("/sd" + "card") + x;
  }

  static String fold5(String x, String y) {
    return x + "a" + "/sd" + "card" + y + "/data/" + "user" + "/z" + 1 + "/mnt/sdcard";
  }

  static final String NEG1 = "/home/sdcard";

  static final String NEG2 = "/data/file1";

  static final String NEG3 = FRAGMENT1 + "/" + "x";

  static final String NEG4 = "/data/dir/file2";

  @SuppressWarnings("HardCodedSdCardPath")
  static final String SUPPRESSED = "/sdcard";

  static String local() {
    String path = "/sdcard/x";
    return path + "/mnt/sdcard";
  }
}
