import React, { useEffect, useRef } from 'react';

export default function Transcript({ messages }) {
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const formatTime = (ts) => {
        const d = new Date(ts);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
    };

    return (
        <div className="glass-panel p-3 flex flex-col h-full min-h-0">
            <div className="text-xs font-semibold text-atc-text-dim mb-2 flex items-center gap-1.5">
                <span className="text-atc-accent">📻</span> Radio Transcript
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 pr-1">
                {messages.length === 0 && (
                    <div className="text-xs text-atc-text-muted text-center py-8 italic">
                        No radio communications yet.<br />
                        Hold SPACE or type below to transmit.
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className="animate-slide-up">
                        {msg.type === 'system' ? (
                            <div className="flex items-center gap-2 py-1">
                                <div className="h-px flex-1 bg-atc-accent/20" />
                                <span className="text-[10px] text-atc-accent/60 font-mono whitespace-nowrap">{msg.text}</span>
                                <div className="h-px flex-1 bg-atc-accent/20" />
                            </div>
                        ) : (
                            <div className={`flex gap-2 px-2 py-1.5 rounded-lg ${msg.type === 'pilot'
                                    ? 'bg-atc-accent/5 border-l-2 border-atc-accent/40'
                                    : 'bg-atc-green/5 border-l-2 border-atc-green/40'
                                }`}>
                                <div className="shrink-0 mt-0.5">
                                    <span className="text-[10px] text-atc-text-muted font-mono">{formatTime(msg.timestamp)}</span>
                                </div>
                                <div className="min-w-0">
                                    <div className={`text-[10px] font-semibold ${msg.type === 'pilot' ? 'text-atc-accent' : 'text-atc-green'
                                        }`}>
                                        {msg.type === 'pilot' ? '🎙 YOU' : `📻 ${msg.controller?.name || 'ATC'}`}
                                    </div>
                                    <div className="text-xs text-atc-text leading-relaxed font-mono">{msg.text}</div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                <div ref={bottomRef} />
            </div>
        </div>
    );
}
