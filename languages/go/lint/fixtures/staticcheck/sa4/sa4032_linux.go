package sa4

import "runtime"

func Windows() bool {
	return runtime.GOOS == "windows" // want SA4032
}

func Linux() bool {
	return runtime.GOOS == "linux"
}
