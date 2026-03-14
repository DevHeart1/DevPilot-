import re

def patch_workspace():
    filepath = "src/App.tsx"
    with open(filepath, 'r') as f:
        content = f.read()

    # Make the main workspace body stack on mobile, but stay flex-row on desktop
    content = content.replace(
        '<main className="flex flex-1 overflow-hidden">',
        '<main className="flex flex-col md:flex-row flex-1 overflow-hidden">'
    )

    # Adjust Agent panel: absolute drawer on mobile, static on desktop
    content = content.replace(
        "<aside className={`${isAgentOpen ? 'w-80' : 'w-12'} border-r border-border-dark flex flex-col bg-background-dark transition-all duration-300`}>",
        "<aside className={`absolute z-40 md:static ${isAgentOpen ? 'w-[85vw] sm:w-80 border-r shadow-2xl md:shadow-none' : 'w-12 border-b md:border-b-0 md:border-r'} h-[50vh] md:h-auto md:border-r border-border-dark flex flex-col bg-background-dark transition-all duration-300`}>"
    )

    # Add a backdrop overlay for mobile when agent or code panel is open
    # We'll just rely on the existing layout and adjust widths

    # Preview panel (middle): take remaining space
    content = content.replace(
        '<section className="flex-1 flex flex-col border-r border-border-dark bg-[#0a0a0a] overflow-hidden">',
        '<section className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-border-dark bg-[#0a0a0a] overflow-hidden min-h-[40vh]">'
    )

    # Code panel (right):
    content = content.replace(
        "<section className={`${isCodeOpen ? 'flex-1' : 'w-12 flex-none'} flex flex-col bg-background-dark transition-all duration-300`}>",
        "<section className={`absolute bottom-0 right-0 z-40 md:static ${isCodeOpen ? 'w-full h-[60vh] md:h-auto md:flex-1 md:w-auto shadow-2xl md:shadow-none border-t md:border-t-0' : 'w-full h-12 md:h-auto md:w-12 flex-none border-t md:border-t-0'} flex flex-col bg-background-dark transition-all duration-300`}>"
    )

    # Code panel collapse button orientation on mobile (horizontal) vs desktop (vertical)
    # We can use flex-row md:flex-col
    content = content.replace(
        '<div className="flex flex-col items-center gap-4 w-full py-3" onClick={() => setIsCodeOpen(true)}>',
        '<div className="flex flex-row md:flex-col items-center justify-center gap-4 w-full h-full md:py-3 cursor-pointer hover:bg-white/5" onClick={() => setIsCodeOpen(true)}>'
    )
    content = content.replace(
        '<span className="material-symbols-outlined text-slate-500 text-sm">keyboard_double_arrow_left</span>',
        '<span className="material-symbols-outlined text-slate-500 text-sm hidden md:block">keyboard_double_arrow_left</span><span className="material-symbols-outlined text-slate-500 text-sm block md:hidden">keyboard_double_arrow_up</span>'
    )

    # Header flex wrap on small screens
    content = content.replace(
        '<header className="flex items-center justify-between border-b border-border-dark px-6 py-3 bg-background-dark">',
        '<header className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-border-dark px-4 sm:px-6 py-3 bg-background-dark gap-4 sm:gap-0">'
    )

    # Hide breadcrumbs on very small screens, or adjust text size
    content = content.replace(
        '<span className="text-slate-500">Project-X</span>',
        '<span className="text-slate-500 hidden sm:inline">Project-X</span>'
    )

    # Header right controls alignment
    content = content.replace(
        '<div className="flex items-center gap-3">',
        '<div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end">'
    )

    with open(filepath, 'w') as f:
        f.write(content)

    print("Workspace responsive patches applied.")

patch_workspace()
