import { useState } from 'react';
import { inspectPages, repairPages } from '../../lib/sealedPages';
import './Basics.css';

const texts = ['Open the notebook', 'Pack three boxes', 'Close the notebook'];
const original = repairPages(texts.map(text => ({ text, number: 0 })), 2).pages;
const changedText = 'Pack four boxes';
const observations = {
  fits: 'The original seal still fits.',
  broken: 'The edited text no longer fits its stored seal.',
  'built-on-broken': 'Its own seal still fits the stored link, but the preceding page has changed.'
};

export function PageChallenge() {
  const [prediction, setPrediction] = useState([]);
  const [reason, setReason] = useState('');
  const [revealed, setRevealed] = useState(false);
  const pages = revealed ? original.map((page, i) => i === 1 ? { ...page, text: changedText } : page) : original;
  const checks = inspectPages(pages, 2).pages;
  const matched = checks.every(({ status }, i) => prediction.includes(i) === (status !== 'fits'));

  function toggle(i) {
    setPrediction(previous => previous.includes(i) ? previous.filter(n => n !== i) : [...previous, i]);
  }
  function reset() {
    setPrediction([]);
    setReason('');
    setRevealed(false);
  }
  return <section className="basics page-challenge" aria-labelledby="challenge-heading">
    <h2 id="challenge-heading">Which seals need replacing?</h2>
    <p>Page 2 will change from “Pack three boxes” to “Pack four boxes”. Predict which pages need new seals to make the chain valid again.</p>
    <ol>
      {pages.map((page, i) => <li key={i}><span className="challenge-page">Page {i + 1}</span> <strong>{page.text}</strong>
        {revealed && <p>{observations[checks[i].status]}</p>}</li>)}
    </ol>
    <fieldset disabled={revealed}>
      <legend>Choose every page that needs a new seal</legend>
      {texts.map((_, i) => <label key={i}><input type="checkbox" checked={prediction.includes(i)} onChange={() => toggle(i)} /> Page {i + 1}</label>)}
    </fieldset>
    <label htmlFor="page-reason">Why? Give your reason here or say it aloud.</label>
    <textarea id="page-reason" maxLength={500} rows={2} value={reason} readOnly={revealed}
      onChange={event => setReason(event.target.value)} placeholder="Your explanation stays on this page." />
    {!revealed && <button type="button" className="btn btn-emphasized" onClick={() => setRevealed(true)}>Change page 2 and check</button>}
    {revealed && <section className="challenge-comparison" aria-label="Compare your prediction">
      <p role="status">{matched ? 'Your prediction matches the checks.' : 'Compare your selection with the checks above.'}</p>
      <p>Page 1 keeps its seal. Page 2 needs a new seal for its changed text. Page 3 must then point to that new seal and be sealed again.</p>
      <button type="button" className="btn btn-default" onClick={reset}>Try again</button>
    </section>}
    <p><a className="btn btn-transparent" href="#/basics">Back to Basics</a></p>
  </section>;
}
