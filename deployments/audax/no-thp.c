// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// Build-only launcher. The process flag survives fork/exec; host policy is untouched.
#include <stdio.h>
#include <unistd.h>
#include <sys/prctl.h>

int main(int argc, char **argv) {
    if (argc < 2) {
        fputs("audax-no-thp: missing command\n", stderr);
        return 64;
    }
    if (prctl(PR_SET_THP_DISABLE, 1, 0, 0, 0) != 0) {
        perror("audax-no-thp: cannot disable build process huge pages");
        return 1;
    }
    execvp(argv[1], argv + 1);
    perror("audax-no-thp: exec");
    return 127;
}
