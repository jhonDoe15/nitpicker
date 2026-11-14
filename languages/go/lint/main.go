package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"golang.org/x/tools/go/analysis"
	"honnef.co/go/tools/config"
)

func main() {
	tags := flag.String("tags", "", "build tags, comma separated")
	project := flag.Bool("project-staticcheck-config", false, "read the project's staticcheck.conf files")
	flag.Parse()
	if err := configure(project); err != nil {
		fail(err)
	}
	result, err := analyze(".", options{tags: *tags, project: *project}, flag.Args())
	if err != nil {
		fail(err)
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		fail(err)
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

func configure(project *bool) error {
	run := config.Analyzer.Run
	config.Analyzer.Run = func(pass *analysis.Pass) (any, error) {
		if *project {
			return run(pass)
		}
		strict := config.DefaultConfig
		strict.HTTPStatusCodeWhitelist = []string{}
		return &strict, nil
	}
	if err := gosecConfigure(); err != nil {
		return err
	}
	return errcheckFlags()
}
