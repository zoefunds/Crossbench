#!/bin/bash
export PATH="/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/../frontend"
exec /opt/homebrew/bin/node node_modules/.bin/next dev
