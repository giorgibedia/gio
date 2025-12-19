/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect } from 'react';
import { getAssistantResponse } from '../services/geminiService';
import { ChatBubbleIcon, ChevronDownIcon, SendIcon } from './icons';

interface Message {
    role: 'user' | 'model';
    content: string;
}

const Assistant: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'model',
            content: "Hello! I'm your AI assistant for PixAI. How can I help you edit your photos today?",
        }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: Message = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        
        const currentInput = input;
        setInput('');
        setIsLoading(true);

        try {
            const historyForApi = messages.map(msg => ({
                role: msg.role as 'user' | 'model',
                parts: [{ text: msg.content }],
            }));
            
            const modelResponse = await getAssistantResponse(historyForApi, currentInput);
            
            setMessages(prev => [...prev, { role: 'model', content: modelResponse }]);

        } catch (error) {
            console.error("Assistant Error:", error);
            const errorMessage = error instanceof Error ? error.message : "Sorry, I encountered an error.";
            setMessages(prev => [...prev, { role: 'model', content: `Error: ${errorMessage}` }]);
        } finally {
            setIsLoading(false);
        }
    };
    
    // Simple markdown for bolding text like **this**
    const formatMessage = (content: string) => {
        const parts = content.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={index}>{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    return (
        <>
            <div className={`fixed bottom-5 right-5 z-50 transition-all duration-300 ${isOpen ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100 scale-100'}`}>
                <button
                    onClick={() => setIsOpen(true)}
                    className="w-16 h-16 bg-gradient-to-br from-[var(--color-primary-600)] to-[var(--color-primary-500)] rounded-full flex items-center justify-center shadow-lg shadow-[var(--shadow-primary)] hover:shadow-xl hover:shadow-[var(--shadow-primary)] hover:-translate-y-px transition-all duration-300"
                    aria-label="Open AI Assistant"
                >
                    <ChatBubbleIcon className="w-8 h-8 text-white" />
                </button>
            </div>

            <div className={`fixed bottom-0 right-0 sm:bottom-5 sm:right-5 z-50 w-full sm:max-w-sm h-[70vh] sm:h-auto sm:max-h-[80vh] flex flex-col bg-gray-900/70 backdrop-blur-xl border border-gray-700 rounded-t-2xl sm:rounded-2xl shadow-2xl transition-all duration-500 ease-in-out ${isOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
                <header className="flex items-center justify-between p-4 border-b border-gray-700">
                    <div className="flex items-center gap-2">
                        <ChatBubbleIcon className="w-6 h-6 text-[var(--color-primary-400)]" />
                        <h2 className="text-lg font-bold text-gray-100">AI Assistant</h2>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                        aria-label="Close AI Assistant"
                    >
                        <ChevronDownIcon className="w-6 h-6" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-xs md:max-w-sm rounded-2xl py-2 px-4 ${msg.role === 'user' ? 'bg-[var(--color-primary-600)] text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
                                <p className="text-sm whitespace-pre-wrap">{formatMessage(msg.content)}</p>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                             <div className="max-w-xs md:max-w-sm rounded-2xl py-2 px-4 bg-gray-700 text-gray-200 rounded-bl-none flex items-center">
                                <div className="dot-flashing"></div>
                             </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <footer className="p-4 border-t border-gray-700">
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask how to edit..."
                            className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-[var(--color-primary-500)] focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-sm"
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className="bg-gradient-to-br from-[var(--color-primary-600)] to-[var(--color-primary-500)] text-white font-bold p-3 rounded-lg transition-all duration-300 ease-in-out shadow-md shadow-[var(--shadow-primary-light)] hover:shadow-lg hover:shadow-[var(--shadow-primary)] active:scale-95 disabled:from-[var(--color-primary-800)] disabled:to-[var(--color-primary-700)] disabled:shadow-none disabled:cursor-not-allowed"
                            aria-label="Send Message"
                        >
                           <SendIcon className="w-5 h-5"/>
                        </button>
                    </form>
                </footer>
            </div>
        </>
    );
};

export default Assistant;