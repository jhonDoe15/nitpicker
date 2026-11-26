package com.google.common.hash;

public interface HashFunction {
  HashCode hashUnencodedChars(CharSequence input);
}
