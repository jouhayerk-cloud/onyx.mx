import sys

path = r'c:\Jouhayerk\git\app\src\features\core\MainHeader.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_block = """                    <StudioAction 
                        icon={DollarSign}
                        label={currencyMode}
                        active={true}
                        onClick={toggleCurrency}
                        color={currencyMode === 'USD' ? '#10b981' : '#38bdf8'}
                    />

                    <div className="w-px h-5 bg-(--text-color)/5 mx-1" />

                    <StudioAction 
                        icon={Filter}
                        label="FILTER"
                        active={isFiltersOpen}
                        onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                        color="var(--color-finance)"
                    />

                    <div className="w-px h-5 bg-(--text-color)/5 mx-1" />

                    <StudioAction 
                        icon={LayoutList}
                        label={overviewMode}
                        active={overviewMode !== 'collapsed'}
                        onClick={() => {
                            const next: Record<string, 'extended' | 'minimal' | 'collapsed'> = {
                                'extended': 'minimal', 'minimal': 'collapsed', 'collapsed': 'extended'
                            };
                            setOverviewMode((next[overviewMode] || 'extended') as any);
                        }}
                        color="var(--color-finance)"
                    />"""

new_block = """                    <button 
                        onClick={() => { setIsFiltersOpen(!isFiltersOpen); setIsActionOpen(false); }}
                        className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 ${isFiltersOpen ? 'text-(--color-finance) drop-shadow-[0_0_10px_rgba(var(--color-finance-rgb),0.5)]' : 'text-white/50 hover:text-white'}`}
                        title="Filter Payments"
                    >
                        <Filter size={22} strokeWidth={2} />
                    </button>
                    <button 
                        onClick={() => { setIsActionOpen(!isActionOpen); setIsFiltersOpen(false); }}
                        className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 ${isActionOpen ? 'text-(--color-finance) drop-shadow-[0_0_10px_rgba(var(--color-finance-rgb),0.5)]' : 'text-white/50 hover:text-white'}`}
                        title="Settings & Logic"
                    >
                        <SlidersHorizontal size={22} strokeWidth={2} />
                    </button>

                    <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />

                    <button 
                        onClick={toggleCurrency}
                        className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 text-white/50 hover:text-white`}
                        title={`Switch to ${currencyMode === 'MXN' ? 'USD' : 'MXN'}`}
                    >
                        <DollarSign size={22} strokeWidth={2} className={currencyMode === 'USD' ? 'text-emerald-400' : 'text-sky-400'} />
                    </button>

                    <button 
                        onClick={toggleOverview}
                        className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 ${overviewMode !== 'collapsed' ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'text-white/50 hover:text-white'}`}
                        title="Toggle Finance Hub Overview"
                    >
                        <LayoutList size={22} strokeWidth={2} />
                    </button>"""

# Try both CRLF and LF
if old_block in content:
    new_content = content.replace(old_block, new_block)
else:
    # Normalize line endings for the check
    content_norm = content.replace('\\r\\n', '\\n')
    old_block_norm = old_block.replace('\\r\\n', '\\n')
    if old_block_norm in content_norm:
        # If it matches normalized, we need to be careful about what we replace
        # But for now let's just try a simpler match or replace by line numbers
        pass
    
    # Fallback to a very simple match of the first line and then replacement of the range
    import re
    # This is a bit risky but let's try to find the block using regex that ignores whitespace/line endings
    # Actually, let's just overwrite the whole function since we have the start and end line numbers
    lines = content.splitlines()
    # Find start line (506 is 1-indexed, so 505)
    # But let's verify the content at that line
    if "StudioAction" in lines[505]:
        new_lines = lines[:505] + [new_block] + lines[537:]
        new_content = '\\n'.join(new_lines)
    else:
        print("Could not find StudioAction at expected line")
        sys.exit(1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)
print("Successfully updated MainHeader.tsx")
