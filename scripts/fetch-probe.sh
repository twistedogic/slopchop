#!/usr/bin/env bash
# The spike's command: one real article, with the private network block, the
# hard deadline and the output cap in force.
set -euo pipefail
lightpanda fetch "${1:-https://blog.rust-lang.org/2026/10/15/Rust-1.99.1/}" \
	--dump markdown --block-private-networks --terminate-ms 10000 --dump-max-bytes 500
