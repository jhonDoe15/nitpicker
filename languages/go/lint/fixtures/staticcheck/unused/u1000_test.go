package unused

import "testing"

func TestUsedInTests(t *testing.T) {
	if usedInTests() != 3 {
		t.Fatal("wrong value")
	}
}
