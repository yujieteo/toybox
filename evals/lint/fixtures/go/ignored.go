package main

import "os"

func open() {
	f, _ := os.Open("x")
	f.Close()
}
