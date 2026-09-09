#!/bin/sh
# tests/helpers/sed-inplace.sh — edit a file in place, portably.
#
# WHY THIS EXISTS (BUG-041). Several suites used `sed -i 's/x/y/' FILE`. That is
# GNU syntax. **BSD sed requires an argument to -i** (the backup suffix), so on
# macOS it consumes the SCRIPT as the suffix and then treats the FILE PATH as
# the script — which fails with the memorable and thoroughly unhelpful
#
#     sed: 1: "/var/folders/_y/2wm_6jm ...": invalid command code f
#
# where the "command code" is just the first letter of the path. The edit does
# not happen, and a suite whose fixture depends on that edit fails somewhere
# else entirely, describing a defect that does not exist. tests/session-resume
# #11 reported "a known PAST id was reported as an unbacked claim" — an
# accusation against the product — when the real story was that the fixture's
# marker had never been rewritten.
#
# The shipped scripts were already correct (`scripts/blueprint` and
# `scripts/new-project.sh` both use `sed -i.bak`). Only the tests were wrong,
# which is the recurring shape of this whole macOS sequence.
#
# bp_sed_i SCRIPT FILE
#   Applies SCRIPT to FILE in place. No temporary file is left behind.
#
# A temp file plus mv is used rather than `-i.bak`, because a stray FILE.bak
# sitting next to the original is itself a hazard: suites in this repo glob and
# count files (tests/manifest walks tests/, the bootstrap suites diff trees), so
# leaving debris changes what other assertions see.
bp_sed_i() {
  _bpsi_script="$1"
  _bpsi_file="$2"
  _bpsi_tmp="$(mktemp)" || return 1
  if sed "$_bpsi_script" "$_bpsi_file" > "$_bpsi_tmp"; then
    # cat-and-truncate rather than mv, so the file keeps its inode, mode and
    # any symlink identity. Suites here watch inodes to detect rotation
    # (tests/agent-activity-bound #8), and an mv would look like one.
    cat "$_bpsi_tmp" > "$_bpsi_file"
    rm -f "$_bpsi_tmp"
    return 0
  fi
  rm -f "$_bpsi_tmp"
  return 1
}
