import React from 'react';

export default function PTTButton({ isRecording }) {
    return (
        <button
            className={`relative w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 ${isRecording
                    ? 'bg-atc-red ptt-recording scale-110'
                    : 'bg-atc-surface-2 border border-atc-border hover:border-atc-accent/50 hover:bg-atc-surface-2/80'
                }`}
            title="Push to Talk (SPACE)"
        >
            {isRecording ? (
                <div className="flex items-end gap-0.5 h-5">
                    {[0, 1, 2, 3, 4].map(i => (
                        <div
                            key={i}
                            className="w-1 bg-white rounded-full radio-bar"
                            style={{
                                animationDelay: `${i * 0.1}s`,
                                height: `${8 + Math.random() * 12}px`,
                            }}
                        />
                    ))}
                </div>
            ) : (
                <svg className="w-5 h-5 text-atc-text-muted" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
            )}
        </button>
    );
}
