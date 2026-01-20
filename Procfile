server: lsof -ti:2567 | xargs kill -9 2>/dev/null; pnpm --filter @swipe/server dev 2>&1
client: lsof -ti:5173 | xargs kill -9 2>/dev/null; pnpm --filter @swipe/client dev 2>&1
shared: pnpm --filter @swipe/shared dev 2>&1
