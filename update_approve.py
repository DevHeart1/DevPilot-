import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

artifact_update_logic = """    await taskService.updateTaskStatus(taskId, 'merged');

    // Requirement 9: Update artifacts with final completion content
    if (task) {
      // Mock final completion content
      const diffContent = `--- a/src/components/MomentsGrid.tsx\\n+++ b/src/components/MomentsGrid.tsx\\n@@ -45,7 +45,7 @@\\n-      <div className="card-header overflow-hidden">\\n+      <div className="card-header overflow-hidden w-full overflow-x-auto whitespace-nowrap">\\n         <div className="title text-lg font-bold">Moments</div>\\n         <div className="actions flex gap-2">`;

      const logContent = `[SUCCESS] Build completed successfully.\\n[INFO] Tests passed: 42/42\\n[INFO] Coverage: 95.5%\\n[SUCCESS] Deployment artifact generated.`;

      const terminalContent = `> npm run build\\n\\n> vite build\\nvite v6.4.1 building for production...\\n✓ 45 modules transformed.\\nrendering chunks...\\ncomputing gzip size...\\ndist/index.html                   0.83 kB │ gzip:   0.44 kB\\n✓ built in 3.77s`;

      await taskService.updateTaskArtifact(taskId, 'diff', diffContent);
      await taskService.updateTaskArtifact(taskId, 'log', logContent);
      await taskService.updateTaskArtifact(taskId, 'terminal', terminalContent);
    }

    if (run) {"""

content = content.replace("    await taskService.updateTaskStatus(taskId, 'merged');\n    \n    if (run) {", artifact_update_logic)

with open('src/App.tsx', 'w') as f:
    f.write(content)
