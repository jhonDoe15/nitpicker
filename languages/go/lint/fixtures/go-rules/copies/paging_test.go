package copies_test

import (
	"testing"

	"fixtures/go-rules/copies/paging"
)

func TestPages(t *testing.T) {
	if got := paging.Pages(50); got != 2 {
		t.Fatalf("Pages(50) = %d", got)
	}
	if got := paging.Pages(25); got != 1 { // want copied-constant-in-test
		t.Fatalf("Pages(25) = %d", got)
	}
	if got := paging.Pages(30); got != 2 {
		t.Fatalf("an unexported constant is not visible: %d", got)
	}
}
