import { useState, type FormEvent } from 'react';

export default function IdeaForm() {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;

    setSubmitting(true);
    setMessage('');

    try {
      const resp = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (resp.ok) {
        setText('');
        setMessage('Idea submitted! It will appear in the map shortly.');
        setTimeout(() => setMessage(''), 4000);
      } else {
        const err = await resp.json();
        setMessage(`Error: ${err.error || 'Failed to submit'}`);
      }
    } catch {
      setMessage('Error: Could not connect to the server');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="idea-form-section">
      <form className="idea-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type an idea — e.g. 'Smart Parking — Use AI to guide drivers to open spots'"
          maxLength={2000}
          disabled={submitting}
        />
        <button type="submit" disabled={submitting || !text.trim()}>
          {submitting ? 'Sending…' : 'Add Idea'}
        </button>
      </form>
      {message && (
        <p style={{ textAlign: 'center', marginTop: 12, fontSize: '0.85rem', color: message.startsWith('Error') ? '#f87171' : '#34d399' }}>
          {message}
        </p>
      )}
    </section>
  );
}
