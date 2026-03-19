type DiffOp =
  | { type: "context"; line: string }
  | { type: "add"; line: string }
  | { type: "remove"; line: string };

function splitLines(content: string): string[] {
  return content.replace(/\r\n/g, "\n").split("\n");
}

function buildLcsMatrix(a: string[], b: string[]): number[][] {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      matrix[i][j] =
        a[i] === b[j]
          ? matrix[i + 1][j + 1] + 1
          : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
    }
  }

  return matrix;
}

function diffLines(currentContent: string, nextContent: string): DiffOp[] {
  const a = splitLines(currentContent);
  const b = splitLines(nextContent);
  const matrix = buildLcsMatrix(a, b);
  const ops: DiffOp[] = [];

  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ type: "context", line: a[i] });
      i += 1;
      j += 1;
      continue;
    }

    if (matrix[i + 1][j] >= matrix[i][j + 1]) {
      ops.push({ type: "remove", line: a[i] });
      i += 1;
    } else {
      ops.push({ type: "add", line: b[j] });
      j += 1;
    }
  }

  while (i < a.length) {
    ops.push({ type: "remove", line: a[i] });
    i += 1;
  }

  while (j < b.length) {
    ops.push({ type: "add", line: b[j] });
    j += 1;
  }

  return ops;
}

export function createUnifiedDiff(
  filePath: string,
  currentContent: string,
  nextContent: string,
): string {
  const ops = diffLines(currentContent, nextContent);
  const oldLines = splitLines(currentContent);
  const newLines = splitLines(nextContent);

  const body = ops.map((op) => {
    if (op.type === "context") {
      return ` ${op.line}`;
    }
    if (op.type === "add") {
      return `+${op.line}`;
    }
    return `-${op.line}`;
  });

  return [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...body,
  ].join("\n");
}

export function countDiffStats(diff: string): {
  additions: number;
  deletions: number;
} {
  return diff.split("\n").reduce(
    (stats, line) => {
      if (line.startsWith("+++")) {
        return stats;
      }
      if (line.startsWith("---")) {
        return stats;
      }
      if (line.startsWith("+")) {
        stats.additions += 1;
      } else if (line.startsWith("-")) {
        stats.deletions += 1;
      }
      return stats;
    },
    { additions: 0, deletions: 0 },
  );
}
