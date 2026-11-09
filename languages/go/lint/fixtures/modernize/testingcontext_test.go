package modernize

import (
	"context"
	"testing"
)

func TestCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background()) // want testingcontext
	defer cancel()
	if ctx.Err() != nil {
		t.Fatal("cancelled")
	}
}

func TestContext(t *testing.T) {
	if t.Context().Err() != nil {
		t.Fatal("cancelled")
	}
}
