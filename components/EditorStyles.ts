
const baseSelectClass = "appearance-none outline-none font-mono text-xs px-2 py-1 cursor-pointer transition-all border-2 text-center font-bold rounded-none h-8 flex items-center justify-center";

export const editorStyles = {
    target: `${baseSelectClass} bg-indigo-950 border-indigo-700 text-indigo-300 hover:bg-indigo-900`,
    variable: `${baseSelectClass} bg-sky-950 border-sky-700 text-sky-300 hover:bg-sky-900`,
    operator: `${baseSelectClass} bg-orange-950 border-orange-700 text-orange-400 hover:bg-orange-900 min-w-[2.5rem]`,
    action: `${baseSelectClass} bg-emerald-950 border-emerald-700 text-emerald-400 hover:bg-emerald-900`,
    input: "bg-slate-950 border-2 border-slate-700 px-1 py-1 text-xs font-mono text-center text-yellow-200 w-16 h-8 focus:border-yellow-500 outline-none transition-colors rounded-none",
};
