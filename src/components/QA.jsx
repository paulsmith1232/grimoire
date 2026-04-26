import React, { useState, useEffect } from 'react';
import { useApp } from '../context';
import checklistsData from '../qa-checklists.json';
import QAChecklist from './QAChecklist';

export default function QA() {
  const { getQAState, saveQAState, resetQAState } = useApp();
  const [allStates, setAllStates] = useState({});
  const [loaded, setLoaded] = useState(false);

  const checklists = checklistsData.checklists || [];

  useEffect(() => {
    async function loadAll() {
      const entries = await Promise.all(
        checklists.map(async (cl) => {
          const state = await getQAState(cl.id);
          return [cl.id, state || { itemStates: {}, generalNotes: '' }];
        })
      );
      setAllStates(Object.fromEntries(entries));
      setLoaded(true);
    }
    loadAll();
  }, []);

  async function handleStateChange(checklistId, newState) {
    await saveQAState(checklistId, newState);
    setAllStates((prev) => ({ ...prev, [checklistId]: newState }));
  }

  async function handleReset(checklistId) {
    await resetQAState(checklistId);
    setAllStates((prev) => ({
      ...prev,
      [checklistId]: { itemStates: {}, generalNotes: '' },
    }));
  }

  if (!loaded) {
    return (
      <div className="empty-state">
        <div className="icon">📋</div>
        <div className="title">Loading checklists...</div>
      </div>
    );
  }

  return (
    <div className="section fade-in">
      <h2 className="section-title">QA Checklists</h2>
      <p className="section-desc">
        Work through test checklists for features ready to verify. Check off items, add notes, and export a report.
      </p>

      {checklists.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📋</div>
          <div className="title">No checklists ready for testing</div>
          <div className="sub">Checklists appear here when a feature is implemented and moved to Ready for Testing.</div>
        </div>
      ) : (
        checklists.map((checklist) => (
          <QAChecklist
            key={checklist.id}
            checklist={checklist}
            qaState={allStates[checklist.id]}
            onStateChange={handleStateChange}
            onReset={handleReset}
          />
        ))
      )}
    </div>
  );
}
