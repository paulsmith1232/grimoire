import React from 'react';
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
