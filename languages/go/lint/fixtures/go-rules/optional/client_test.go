package optional

import (
	"testing"
	"time"
)

func TestMove(t *testing.T) {
	client := New("moved", WithTimeout(time.Second))
	client.Move(RegionOpts{Region: "west"})
	if client.String() != "movedwest" {
		t.Fatalf("String = %q", client.String())
	}
	if Open("other", Options{Timeout: time.Second}).timeout != time.Second {
		t.Fatal("timeout not kept")
	}
}
