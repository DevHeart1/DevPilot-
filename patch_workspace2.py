import re

def patch_workspace():
    filepath = "src/App.tsx"
    with open(filepath, 'r') as f:
        content = f.read()

    # The left panel drawer seems to have a bug where its height on mobile is too tall and overlaps things oddly,
    # Let's just make it take full height if open on mobile, but keep it on the left side overlaying everything.
    content = content.replace(
        "<aside className={`absolute z-40 md:static ${isAgentOpen ? 'w-[85vw] sm:w-80 border-r shadow-2xl md:shadow-none' : 'w-12 border-b md:border-b-0 md:border-r'} h-[50vh] md:h-auto md:border-r border-border-dark flex flex-col bg-background-dark transition-all duration-300`}>",
        "<aside className={`absolute top-0 left-0 z-40 md:static ${isAgentOpen ? 'w-[85vw] sm:w-80 border-r shadow-2xl md:shadow-none translate-x-0' : 'w-12 border-r -translate-x-full md:translate-x-0'} h-full md:h-auto border-border-dark flex flex-col bg-background-dark transition-all duration-300`}>"
    )

    # And we need to give users a way to toggle it open if it's translated away on mobile.
    # Actually, if we translate it away, the w-12 part is gone. Instead, let's keep the w-12 part on screen.
    content = content.replace(
        "<aside className={`absolute top-0 left-0 z-40 md:static ${isAgentOpen ? 'w-[85vw] sm:w-80 border-r shadow-2xl md:shadow-none translate-x-0' : 'w-12 border-r -translate-x-full md:translate-x-0'} h-full md:h-auto border-border-dark flex flex-col bg-background-dark transition-all duration-300`}>",
        "<aside className={`absolute md:relative z-40 md:static ${isAgentOpen ? 'w-[85vw] sm:w-80 border-r shadow-2xl md:shadow-none' : 'w-12 border-r'} h-full md:h-auto border-border-dark flex flex-col bg-background-dark transition-all duration-300`}>"
    )

    # Preview section needs some padding to avoid being under the left bar if it's absolute
    # Wait, the left bar is absolute, meaning it will sit on top of the preview section. So the preview section will be obscured by 12px (the closed width of the left bar) on mobile. We can add pl-12 on mobile.
    content = content.replace(
        '<section className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-border-dark bg-[#0a0a0a] overflow-hidden min-h-[40vh]">',
        '<section className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-border-dark bg-[#0a0a0a] overflow-hidden min-h-[40vh] pl-12 md:pl-0">'
    )

    with open(filepath, 'w') as f:
        f.write(content)

    print("Workspace responsive patches updated.")

patch_workspace()
