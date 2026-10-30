#!/usr/bin/env node
// A stand-in browser that always dumps more than the cap allows.
process.stdout.write("x".repeat(50_000));
