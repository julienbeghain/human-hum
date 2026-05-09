import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

const MAX_ITERATIONS = 10;

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  const plan = await sandcastle.run({
    sandbox: docker(),
    name: "Planner",
    agent: sandcastle.claudeCode("claude-opus-4-6"),
    promptFile: "./.sandcastle/plan-prompt.md",
  });

  const planMatch = plan.stdout.match(/<plan>([\s\S]*?)<\/plan>/);
  if (!planMatch) {
    console.log("No plan output found — stopping.");
    break;
  }

  const { issues } = JSON.parse(planMatch[1]) as {
    issues: { number: number; title: string; branch: string }[];
  };

  if (issues.length === 0) {
    console.log("No issues to work on — stopping.");
    break;
  }

  console.log(`Planning ${issues.length} issues for parallel execution.`);

  const settled = await Promise.allSettled(
    issues.map(async (issue) => {
      await using sandbox = await sandcastle.createSandbox({
        sandbox: docker(),
        branch: issue.branch,
        copyToWorktree: ["node_modules"],
        hooks: {
          sandbox: {
            onSandboxReady: [{ command: "pnpm install && pnpm build" }],
          },
        },
      });

      const result = await sandbox.run({
        name: `Implementer ${issue.number}`,
        agent: sandcastle.claudeCode("claude-opus-4-6"),
        promptFile: "./.sandcastle/implement-prompt.md",
        promptArgs: {
          TASK_ID: issue.number,
          ISSUE_TITLE: issue.title,
          BRANCH: issue.branch,
        },
      });

      if (result.commits.length > 0) {
        await sandbox.run({
          name: `Reviewer ${issue.number}`,
          agent: sandcastle.claudeCode("claude-sonnet-4-6"),
          promptFile: "./.sandcastle/review-prompt.md",
          promptArgs: {
            TASK_ID: issue.number,
            ISSUE_TITLE: issue.title,
            BRANCH: issue.branch,
          },
        });
      }

      return { issue, result };
    }),
  );

  const completedBranches: string[] = [];
  const completedIssues: { number: number; title: string }[] = [];

  for (const entry of settled) {
    if (entry.status === "fulfilled") {
      completedBranches.push(entry.value.issue.branch);
      completedIssues.push(entry.value.issue);
    } else {
      console.error("Agent failed:", entry.reason);
    }
  }

  if (completedBranches.length === 0) {
    console.log("No branches completed — stopping.");
    break;
  }

  await sandcastle.run({
    sandbox: docker(),
    name: "Merger",
    maxIterations: 10,
    agent: sandcastle.claudeCode("claude-opus-4-6"),
    promptFile: "./.sandcastle/merge-prompt.md",
    promptArgs: {
      BRANCHES: completedBranches.map((b) => `- ${b}`).join("\n"),
      ISSUES: completedIssues
        .map((i) => `- #${i.number}: ${i.title}`)
        .join("\n"),
    },
  });

  console.log(
    `Iteration ${iteration} complete. Merged ${completedBranches.length} branches.`,
  );
}
