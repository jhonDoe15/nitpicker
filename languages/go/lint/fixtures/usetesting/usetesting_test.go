package usetesting

import (
	"os"
	"testing"
)

func TestTemporaryFolder(t *testing.T) {
	folder, err := os.MkdirTemp("", "shop") // want usetesting
	if err != nil {
		t.Fatal(err)
	}
	t.Log(folder)
}

func TestTestingFolder(t *testing.T) {
	t.Log(t.TempDir())
}

func TestEnvironment(t *testing.T) {
	if err := os.Setenv("SHOP", "1"); err != nil { // want usetesting
		t.Fatal(err)
	}
	t.Setenv("SHOP", "1")
}
