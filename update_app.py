import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Fix 1: Move import { useEffect } from 'react'; to the top
content = re.sub(r"import { useEffect } from 'react';\n", "", content)
content = re.sub(r"import React, { useState } from 'react';", "import React, { useState, useEffect } from 'react';", content)

# Fix 2: Render memoryHits in the Left Sidebar
memory_ui = """
                {memoryHits && memoryHits.length > 0 && (
                  <div className="pt-4 border-t border-border-dark space-y-3">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Recalled Memories</h3>
                    {memoryHits.map(hit => (
                      <div key={hit.id} className="bg-surface-dark/50 border border-border-dark rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-300">{hit.memory.title}</span>
                          <span className="text-[10px] font-mono text-primary/70">{Math.round(hit.score * 100)}% Match</span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">{hit.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
"""

content = content.replace(
    "</div>\n              <div className=\"p-4 border-t border-border-dark\">",
    memory_ui + "              </div>\n              <div className=\"p-4 border-t border-border-dark\">"
)

with open('src/App.tsx', 'w') as f:
    f.write(content)
