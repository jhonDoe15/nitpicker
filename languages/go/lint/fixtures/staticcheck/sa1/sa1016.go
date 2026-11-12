package sa1

import (
	"os"
	"os/signal"
	"syscall"
)

func TrapKill(signals chan os.Signal) {
	signal.Notify(signals, syscall.SIGKILL) // want SA1016
}

func TrapTerm(signals chan os.Signal) {
	signal.Notify(signals, syscall.SIGTERM)
}
