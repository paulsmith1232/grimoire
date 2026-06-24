import React, { useState } from 'react';
import { AppProvider, useApp } from './context';
import Library from './components/Library';
import CardDetail from './components/CardDetail';
import Scan from './components/Scan';
import Profiles from './components/Profiles';
import ProfileEditor from './components/ProfileEditor';
import Tags from './components/Tags';
import Settings from './components/Settings';
import QA from './components/QA';

const TABS = [
  { key: 'library', icon: '📚', label: 'Library' },
  { key: 'scan', icon: '📷', label: 'Scan' },
  { key: 'profiles', icon: '📐', label: 'Profiles' },
  { key: 'tags', icon: '🏷', label: 'Tags' },
  { key: 'qa', icon: '📋', label: 'QA' },
  { key: 'settings', icon: '⚙', label: 'Settings' },
];

function TestPopup() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--gold)', borderRadius: 12, padding: '28px 24px', maxWidth: 320, textAlign: 'center' }}>
        <p style={{ margin: '0 0 20px', fontSize: 18 }}>hello, just testing 👋</p>
        <button className="btn-primary" style={{ minWidth: 80 }} onClick={() => setVisible(false)}>Close</button>
      </div>
    </div>
  );
}

function AppInner() {
  const { state, dispatch } = useApp();

  if (state.loading) {
    return (
      <div id="app">
        <div className="header"><h1><span>✦</span> Grimoire</h1></div>
        <div className="content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="empty-state">
            <div className="icon" style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>✦</div>
            <div className="title">Loading your grimoire...</div>
          </div>
        </div>
      </div>
    );
  }

  function renderContent() {
    switch (state.currentTab) {
      case 'library':
        return state.selectedCardId
          ? <CardDetail />
          : <Library />;
      case 'scan':
        return <Scan />;
      case 'profiles':
        return state.editingProfileId
          ? <ProfileEditor />
          : <Profiles />;
      case 'tags':
        return <Tags />;
      case 'qa':
        return <QA />;
      case 'settings':
        return <Settings />;
      default:
        return <Library />;
    }
  }

  return (
    <div id="app">
      <TestPopup />
      <div className="header">
        <h1><span>✦</span> Grimoire</h1>
      </div>
      <div className="content">
        {renderContent()}
      </div>
      <nav className="nav">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={'nav-btn' + (state.currentTab === t.key ? ' active' : '')}
            onClick={() => dispatch({ type: 'SET_TAB', tab: t.key })}
          >
            <div className="icon">{t.icon}</div>
            <div className="label">{t.label}</div>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
