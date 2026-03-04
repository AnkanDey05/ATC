import React from 'react';

export default function CostBadge({ costs }) {
    const total = costs?.costs?.total || 0;

    if (total === 0) {
        return (
            <div className="bg-atc-surface-2/50 border border-atc-border rounded-lg px-2.5 py-1.5 text-center shrink-0">
                <div className="text-[9px] text-atc-text-muted">SESSION</div>
                <div className="text-xs font-mono font-semibold text-atc-green">FREE</div>
            </div>
        );
    }

    return (
        <div className="bg-atc-surface-2/50 border border-atc-border rounded-lg px-2.5 py-1.5 text-center shrink-0">
            <div className="text-[9px] text-atc-text-muted">COST</div>
            <div className="text-xs font-mono font-semibold text-atc-amber">
                ${total.toFixed(2)}
            </div>
        </div>
    );
}
