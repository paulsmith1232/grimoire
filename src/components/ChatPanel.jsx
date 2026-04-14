import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { sendChatMessage } from '../api';
import { useApp } from '../context';

const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search' };

// Placeholder system prompts — full versions come with sections 5 & 6
const SYSTEM_PROMPTS = {
  create: 'You are a helpful assistant for the Grimoire app, which helps users organize reference cards. Help the user create a new scan profile by understanding their use case and the fields they need. When you are ready to propose a schema, output it in a ```json code fence with { "type": "schema_proposal", "name": "...", "fields": [...] }.',
  update: 'You are a helpful assistant for the Grimoire app. Help the user update their existing scan profile. When you are ready to propose changes, output them in a ```json code fence with { "type": "schema_diff", "changes": [...] }.',
};

function buildApiMessages(messages) {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((msg) => {
      if (msg.role === 'user') {
        if (msg.images?.length > 0) {
          return {
            role: 'user',
            content: [
              ...msg.images.map((img) => ({
                type: 'image',
                source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
              })),
              { type: 'text', text: msg.content || '' },
            ],
          };
        }
        return { role: 'user', content: msg.content || '' };
      }
      // assistant — use rawText so JSON fences are preserved in history
      return { role: 'assistant', content: msg.rawText || (typeof msg.content === 'string' ? msg.content : '') };
    });
}

function parseAssistantResponse(text) {
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (!fenceMatch) return { content: text, rawText: text, parsed: null };
  try {
    const parsed = JSON.parse(fenceMatch[1].trim());
    return { content: parsed, rawText: text, parsed };
  } catch {
    return { content: text, rawText: text, parsed: null };
  }
}

export default function ChatPanel({ mode, existingProfile, onClose, onSaveProfile }) {
  const { state } = useApp();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [attachedImages, setAttachedImages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const threadRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  const title = mode === 'create'
    ? 'Create Profile'
    : `Update Profile: ${existingProfile?.name || ''}`;

  // Slide-in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Auto-scroll to bottom on new messages or loading state change
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  async function handleSend() {
    const text = inputText.trim();
    if (!text && attachedImages.length === 0) return;
    if (isLoading) return;

    const userMsg = {
      role: 'user',
      content: text,
      images: attachedImages,
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setAttachedImages([]);
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setIsLoading(true);

    try {
      const apiMessages = buildApiMessages(updatedMessages);
      const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.create;

      // Cost guardrail: warn before large calls
      const estimatedTokens = JSON.stringify({ messages: apiMessages, system: systemPrompt }).length / 4;
      if (estimatedTokens > 30000) {
        const kTokens = Math.round(estimatedTokens / 1000);
        const ok = window.confirm(`This will send approximately ${kTokens}k tokens to Claude. Continue?`);
        if (!ok) {
          setIsLoading(false);
          // Restore input state
          setMessages((prev) => prev.filter((m) => m !== userMsg));
          setInputText(text);
          setAttachedImages(userMsg.images);
          return;
        }
      }

      const { text: responseText, usage } = await sendChatMessage(
        apiMessages, systemPrompt, state.apiKey, [WEB_SEARCH_TOOL]
      );

      const { content, rawText, parsed } = parseAssistantResponse(responseText);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content,
        rawText,
        parsed,
        usage,
        timestamp: new Date(),
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: 'error',
        content: err.message || 'Request failed.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleFileAttach(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.readAsDataURL(file);
      });
      setAttachedImages((prev) => [
        ...prev,
        { base64: dataUrl.split(',')[1], dataUrl, mediaType: file.type || 'image/jpeg' },
      ]);
    }
  }

  function renderMessage(msg, idx) {
    if (msg.role === 'error') {
      return (
        <div key={idx} className="chat-bubble chat-bubble-error">{msg.content}</div>
      );
    }

    if (msg.role === 'user') {
      return (
        <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {msg.images?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {msg.images.map((img, i) => (
                <img key={i} src={img.dataUrl} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
              ))}
            </div>
          )}
          {msg.content && <div className="chat-bubble chat-bubble-user">{msg.content}</div>}
        </div>
      );
    }

    // assistant
    const isStructured = msg.parsed && (msg.parsed.type === 'schema_proposal' || msg.parsed.type === 'schema_diff');
    return (
      <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <div className="chat-bubble chat-bubble-assistant">
          {isStructured
            ? <em style={{ color: 'var(--accent)' }}>Schema proposal received — review UI coming in a future update.</em>
            : (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2))
          }
        </div>
        {msg.usage && (
          <div className="chat-usage">
            ~{msg.usage.input_tokens?.toLocaleString()} input · ~{msg.usage.output_tokens?.toLocaleString()} output tokens
          </div>
        )}
      </div>
    );
  }

  return createPortal(
    <div className="chat-panel-backdrop" onClick={onClose}>
      <div
        className={'chat-panel' + (visible ? ' chat-panel-visible' : '')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="chat-panel-header">
          <span className="chat-panel-title">{title}</span>
          <button className="chat-panel-close" onClick={onClose}>✕</button>
        </div>

        {/* Message thread */}
        <div className="chat-panel-thread" ref={threadRef}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, paddingTop: 40 }}>
              {mode === 'create'
                ? 'Describe the cards you want to organize — what game, system, or topic?'
                : 'What would you like to change about this profile?'}
            </div>
          )}
          {messages.map(renderMessage)}
          {isLoading && (
            <div className="chat-bubble chat-bubble-assistant chat-bubble-loading">…</div>
          )}
        </div>

        {/* Input area */}
        <div className="chat-panel-input-area">
          {attachedImages.length > 0 && (
            <div className="chat-thumbs">
              {attachedImages.map((img, i) => (
                <div key={i} className="chat-thumb">
                  <img src={img.dataUrl} alt="" />
                  <button
                    className="chat-thumb-remove"
                    onClick={() => setAttachedImages((prev) => prev.filter((_, j) => j !== i))}
                  >✕</button>
                </div>
              ))}
            </div>
          )}
          <div className="chat-input-row">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileAttach}
            />
            <button
              className="btn btn-secondary btn-sm chat-attach-btn"
              onClick={() => fileRef.current?.click()}
              title="Attach image"
            >📎</button>
            <textarea
              ref={inputRef}
              value={inputText}
              rows={2}
              placeholder="Type or dictate a message..."
              style={{ flex: 1, fontSize: 16, resize: 'none', overflowY: 'auto', maxHeight: 168 }}
              onChange={(e) => {
                setInputText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 168) + 'px';
              }}
              onKeyDown={handleKeyDown}
            />
            <button
              className="btn btn-primary btn-sm chat-send-btn"
              disabled={isLoading || (!inputText.trim() && attachedImages.length === 0)}
              onClick={handleSend}
            >Send</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
