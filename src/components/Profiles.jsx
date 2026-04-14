import React from 'react';
import { useApp } from '../context';
import { PROFILE_COLORS, genId } from '../db';

export default function Profiles() {
  const { state, dispatch, addProfile } = useApp();

  async function createProfile() {
    const np = await addProfile({
      id: genId(),
      name: 'New Profile',
      icon: '📋',
      color: PROFILE_COLORS[state.profiles.length % PROFILE_COLORS.length],
      builtIn: false,
      fields: [{ key: 'description', label: 'Description' }],
      additionalInstructions: '',
      useCustomPrompt: false,
      customPrompt: '',
    });
    dispatch({ type: 'EDIT_PROFILE', id: np.id });
  }

  return (
    <div className="section fade-in">
      <h2 className="section-title">Scan Profiles</h2>
      <p className="section-desc">
        Profiles control how scanned pages get parsed — what sections to extract and what to prioritize.
      </p>

      <button className="btn btn-primary btn-block" style={{ marginBottom: 16 }} onClick={createProfile}>
        + New Profile
      </button>

      {state.profiles.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📐</div>
          <div className="title">No profiles yet</div>
          <div className="sub">Create one to start scanning.</div>
        </div>
      ) : (
        state.profiles.map((p) => {
          const cnt = state.cards.filter((c) => c.profileId === p.id).length;
          return (
            <div
              key={p.id}
              className="profile-card"
              onClick={() => dispatch({ type: 'EDIT_PROFILE', id: p.id })}
            >
              <div className="profile-card-header">
                <h3>{p.icon} {p.name}</h3>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {cnt} card{cnt !== 1 ? 's' : ''}{p.builtIn ? ' · Sample' : ''}
                </span>
              </div>
              <div className="profile-section-list">
                {(p.fields || []).map((f, i) => (
                  <span key={i} className="profile-section-chip">{i + 1}. {f.label}</span>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
