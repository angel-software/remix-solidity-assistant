import './ChatModel.css';
import React, { useState, useEffect, useRef} from 'react';
import { api } from '../utils/api';
import { ENV } from '../utils/env';
import { ChatMessageView } from './ChatMessageView';

interface ChatModelProps {
  actualFilePath: string;
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

export function ChatModel({ actualFilePath }: ChatModelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileName = actualFilePath.split('/').pop() || '';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const getCleanedHistory = (currentHistory: Message[]) => {
    const lastMessages = currentHistory.slice(-6); 
    
    return lastMessages.map(msg => ({
      role: msg.role,
      content: msg.text
    }));
  };

  const handleSend = async () => {
    const userQuery = input.trim();
    if (!userQuery || isLoading) return;

    setInput('');
    setIsLoading(true);
    
    const newUserMessage: Message = { role: 'user', text: userQuery };

    // 1. Cleaned history takes only the previous messages (excluding the new one)
    const historyToSend = getCleanedHistory(messages); 
    setMessages((prev) => [...prev, newUserMessage]);

    try {
      const response = await api.post('/api/query', { 
        query: userQuery, 
        activeFilePath: actualFilePath,
        chatHistory: historyToSend
      });
      
      const reply = response.data.answer || 'No response received.';
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch (error) {
      console.error('[Chat Pipeline Error] Inbound model communication failure:', error);
      setMessages((prev) => [
        ...prev, 
        { role: 'assistant', text: 'Error trying to connect to the local server.' }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-model-container">
      <div className="chat-header">
        {fileName && (
          <span>
            Actual file: <span className="chat-context-badge">{fileName}</span>
          </span>
        )}
      </div>

      <div className="chat-messages-area">
        {messages.map((msg, index) => (
          <div key={index} className={`message-row ${msg.role}`}>
            <div className="message-bubble">
              <ChatMessageView text={msg.text} />
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="chat-loading-indicator">
            <div className="chat-spinner" />
            <span>Analyzing smart contract codebase...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your codebase..."
            disabled={isLoading}
          />
          <button 
            className="chat-send-btn" 
            onClick={handleSend} 
            disabled={isLoading || !input.trim()}
          >
            Send
          </button>
        </div>
        <div className="chat-footer-model">
          Model: {ENV.OLLAMA_MODEL}
        </div>
      </div>
    </div>
  );
}

export default ChatModel;
