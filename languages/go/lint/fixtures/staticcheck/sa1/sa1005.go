package sa1

import (
	"context"
	"os/exec"
)

func ShellLine() *exec.Cmd {
	return exec.Command("ls -l") // want SA1005
}

func ProgramAndArguments(ctx context.Context) *exec.Cmd {
	return exec.CommandContext(ctx, "ls", "-l")
}
