#!/bin/bash
MAX_ITERATIONS=${1:-15}
ITERATION=0

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
  ITERATION=$((ITERATION + 1))
  echo "=== Ralph iteration $ITERATION of $MAX_ITERATIONS ==="

  RESULT=$(claude -p --dangerously-skip-permissions "$(cat RALPH-PROMPT.md)")

  if echo "$RESULT" | grep -q "<promise>COMPLETE</promise>"; then
    echo "All tasks complete after $ITERATION iterations!"
    exit 0
  fi
done

echo "Reached max iterations ($MAX_ITERATIONS)"
