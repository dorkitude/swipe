#!/bin/bash
# Start Swipe development servers with logging

cd "$(dirname "$0")"

# Kill any existing overmind
overmind quit 2>/dev/null
rm -f .overmind.sock

# Start overmind and pipe output to log file
echo "Starting Swipe... (logs: overmind.log.local)"
overmind start 2>&1 | tee overmind.log.local
