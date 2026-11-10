package calls

import (
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	os.Exit(m.Run()) // want redundant-test-main-exit
}

func TestCollect(t *testing.T) {
	Collect()
	if !Equal(January(), January()) {
		t.Fatal("not equal")
	}
}
