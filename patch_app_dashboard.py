import re

def patch_app_file():
    filepath = "src/App.tsx"
    with open(filepath, 'r') as f:
        content = f.read()

    # Header: adjust padding and gap for mobile
    content = content.replace(
        '<header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-background-dark/50 backdrop-blur-md sticky top-0 z-50">',
        '<header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border-subtle bg-background-dark/50 backdrop-blur-md sticky top-0 z-50">'
    )

    # Hero: padding and size adjustments
    content = content.replace(
        '<div className="flex flex-col items-center text-center mb-10">',
        '<div className="flex flex-col items-center text-center mb-8 sm:mb-10 px-2 sm:px-0">'
    )
    content = content.replace(
        '<h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-8">',
        '<h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white mb-6 sm:mb-8">'
    )

    # Main container padding
    content = content.replace(
        '<main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12">',
        '<main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12">'
    )

    # Tabs: allow horizontal scroll on mobile
    content = content.replace(
        '<div className="flex items-center border-b border-border-subtle mb-8 gap-8">',
        '<div className="flex items-center border-b border-border-subtle mb-6 sm:mb-8 gap-4 sm:gap-8 overflow-x-auto whitespace-nowrap hide-scrollbar">'
    )

    # Task item: adjust flex direction and spacing on mobile
    content = content.replace(
        '<div onClick={onClick} className="group flex flex-col md:flex-row md:items-center justify-between p-5 hover:bg-surface-dark/50 hover:scale-[1.01] hover:shadow-lg hover:z-10 relative transition-all duration-200 border-t border-border-subtle first:border-t-0 cursor-pointer">',
        '<div onClick={onClick} className="group flex flex-col md:flex-row md:items-center justify-between p-4 sm:p-5 hover:bg-surface-dark/50 hover:scale-[1.01] hover:shadow-lg hover:z-10 relative transition-all duration-200 border-t border-border-subtle first:border-t-0 cursor-pointer">'
    )

    # Task title: wrap text
    content = content.replace(
        '<span className="text-sm font-medium text-slate-100 group-hover:text-primary transition-colors">{title}</span>',
        '<span className="text-sm font-medium text-slate-100 group-hover:text-primary transition-colors line-clamp-2 md:line-clamp-1 break-words">{title}</span>'
    )

    # Write back
    with open(filepath, 'w') as f:
        f.write(content)

    print("Dashboard responsive patches applied.")

patch_app_file()
