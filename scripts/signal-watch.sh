#!/usr/bin/env bash
exec node "$(dirname "$0")/signal-watch.mts" "$@"
