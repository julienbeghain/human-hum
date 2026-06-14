import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

const MAX_ITERATIONS = 10;

// Explicit image name: the default derives "sandcastle:.sandcastle" from the
// dotfile dir, which Docker rejects as an invalid tag. Build it with:
//   npx sandcastle docker build-image --image-name sandcastle:human-hum
const IMAGE = "sandcastle:human-hum";

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  const plan = await sandcastle.run({
    sandbox: docker({ imageName: IMAGE }),
    name: "Planner",
    agent: sandcastle.claudeCode("claude-opus-4-8"),
    promptFile: "./plan-prompt.md",
    idleTimeoutSeconds: 300,
  });

  const planMatch = plan.stdout.match(/<plan>([\s\S]*?)<\/plan>/);
  if (!planMatch) {
    console.log("No plan output found — stopping.");
    break;
  }

  const raw = JSON.parse(planMatch[1]) as {
    issues: { number?: number; id?: number; title: string; branch: string }[];
  };
  const issues = raw.issues.map((i) => ({
    number: String(i.number ?? i.id),
    title: i.title,
    branch: i.branch,
  }));

  if (issues.length === 0) {
    console.log("No issues to work on — stopping.");
    break;
  }

  console.log(`Planning ${issues.length} issues for parallel execution.`);

  const settled = await Promise.allSettled(
    issues.map(async (issue) => {
      await using sandbox = await sandcastle.createSandbox({
        sandbox: docker({ imageName: IMAGE }),
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
        agent: sandcastle.claudeCode("claude-opus-4-8"),
        promptFile: "./implement-prompt.md",
        idleTimeoutSeconds: 600,
        promptArgs: {
          TASK_ID: issue.number,
          ISSUE_TITLE: issue.title,
          BRANCH: issue.branch,
        },
      });

      // Fail-closed: nothing merges without commits AND a PASS verdict from review.
      let verdict: "PASS" | "FAIL" = "FAIL";
      if (result.commits.length > 0) {
        const review = await sandbox.run({
          name: `Reviewer ${issue.number}`,
          agent: sandcastle.claudeCode("claude-sonnet-4-6"),
          promptFile: "./review-prompt.md",
          idleTimeoutSeconds: 300,
          promptArgs: {
            TASK_ID: issue.number,
            ISSUE_TITLE: issue.title,
            BRANCH: issue.branch,
          },
        });
        verdict = /<verdict>\s*PASS\s*<\/verdict>/i.test(review.stdout)
          ? "PASS"
          : "FAIL";
      }

      return { issue, result, verdict };
    }),
  );

  const completedBranches: string[] = [];
  const completedIssues: { number: string; title: string }[] = [];

  for (const entry of settled) {
    if (entry.status === "fulfilled") {
      const { issue, result, verdict } = entry.value;
      if (result.commits.length > 0 && verdict === "PASS") {
        completedBranches.push(issue.branch);
        completedIssues.push(issue);
      } else {
        console.warn(
          `Gate held ${issue.branch}: commits=${result.commits.length}, verdict=${verdict}`,
        );
      }
    } else {
      console.error("Agent failed:", entry.reason);
    }
  }

  if (completedBranches.length === 0) {
    console.log("No branches completed — stopping.");
    break;
  }

  await sandcastle.run({
    sandbox: docker({ imageName: IMAGE }),
    name: "Merger",
    maxIterations: 10,
    idleTimeoutSeconds: 600,
    agent: sandcastle.claudeCode("claude-opus-4-8"),
    promptFile: "./merge-prompt.md",
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
