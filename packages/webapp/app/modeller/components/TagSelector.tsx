'use client';

import { ISituationTag } from '@/lib/db/models';
import { Check } from 'lucide-react';

interface TagSelectorProps {
    tags: ISituationTag[];
    selectedTagIds: string[];
    onToggleTag: (tagId: string) => void;
}

export default function TagSelector({ tags, selectedTagIds, onToggleTag }: TagSelectorProps) {
    // Filter out inactive (legacy) tags
    const activeTags = tags.filter(t => t.is_active !== false);
    const categories = Array.from(new Set(activeTags.map(t => t.category)));

    return (
        <div className="space-y-4">
            {categories.map(category => (
                <div key={category} className="space-y-2">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{category}</h3>
                    <div className="flex flex-wrap gap-2">
                        {activeTags.filter(t => t.category === category).map(tag => {
                            const isSelected = selectedTagIds.includes(tag.tag_id);
                            return (
                                <button
                                    key={tag.tag_id}
                                    onClick={() => onToggleTag(tag.tag_id)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 border ${isSelected
                                        ? 'bg-zinc-100 text-zinc-950 border-zinc-100 shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                                        : 'bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                                        }`}
                                >
                                    {isSelected && <Check size={14} className="animate-in zoom-in duration-200" />}
                                    {tag.display_name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
