package main

import (
	"encoding/json"
	"fmt"
	"os"
)

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "usage: inspect <module root> <report file>")
		os.Exit(2)
	}
	report, err := inspectModule(os.Args[1])
	if err == nil {
		err = writeReport(os.Args[2], report)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func writeReport(path string, report Report) error {
	data, err := json.Marshal(report)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}
