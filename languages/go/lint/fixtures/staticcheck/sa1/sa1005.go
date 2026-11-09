package sa1

import "os/exec"

func ShellLine() *exec.Cmd {
	return exec.Command("ls -l") // want SA1005
}

func ProgramAndArguments() *exec.Cmd {
	return exec.Command("ls", "-l")
}
