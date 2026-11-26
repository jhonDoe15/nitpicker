package e;

import com.google.protobuf.ByteString;
import com.google.protobuf.MessageLite;

public class B4Protobuf {
  String m(MessageLite message, ByteString bytes) {
    String a = message.toByteString().toStringUtf8();
    String b = bytes.toStringUtf8();
    String c = message.toByteString().toStringUtf8().trim();
    ByteString d = message.toByteString();
    return d.toStringUtf8();
  }
}
