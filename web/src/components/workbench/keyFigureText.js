// Words and forecasts of the key figures (web/DESIGN.md, "Key figures"), pure so the
// components stay presentational: number formats, the difficulty check's forecast,
// the marks for rule changes on the chain and the note that explains a change.
import { formatSeconds } from './blockView';
import { CHECK_EVERY } from '../../lib/difficulty';

/** A reward in a few significant digits: 3.125, 0.0488, 0.00122. */
export function formatReward(value) {
  if (!Number.isFinite(value)) return null;
  if (value >= 1) return String(Number(value.toFixed(3)));
  return String(Number(value.toPrecision(3)));
}

export const whole = seconds => formatSeconds(seconds)?.replace('.0 s', ' s');

/** What the next check does with the current pace: 'stays', 'up' or 'down'. */
export function forecastOf(figures) {
  const { difficulty, check } = figures;
  return check.next > difficulty ? 'up' : check.next < difficulty ? 'down' : 'stays';
}

/** The note for a chain event, or null when the event needs none (a learner's own setting). */
export function eventNote(event, { halvingInterval, targetSeconds, coinName = 'powfyicoin' }) {
  if (event.kind === 'halving') {
    if (event.to === null) return null;
    return {
      key: `halving-${event.index}`, kind: 'halving', icon: '½',
      title: `The reward halved with #${event.index}: ${formatReward(event.from)} → ${formatReward(event.to)} ${coinName}.`,
      text: `A block still needs the same work; its miner gets half the new coins. Here every ${halvingInterval} blocks, in Bitcoin every 210,000.`
    };
  }
  if (event.source !== 'check') return null;
  const up = event.to > event.from;
  const { first, last, seconds } = event.window;
  const limit = up ? `faster than ${whole(targetSeconds * 0.7)} (70 %` : `slower than ${whole(targetSeconds * 1.5)} (150 %`;
  return {
    key: `difficulty-${event.index}`, kind: up ? 'up' : 'down', icon: up ? '↑' : '↓',
    title: `Difficulty ${up ? 'rose' : 'fell'} from ${event.from} to ${event.to} after #${event.checked}.`,
    lead: ` Blocks #${first}–#${last} took ${formatSeconds(seconds)} on average, ${limit} of the ${whole(targetSeconds)} target).`,
    text: `From #${event.index} a hash needs one leading zero ${up ? 'more: about 16 times the tries' : 'less: about 16 times fewer tries'}. Next check after #${event.checked + CHECK_EVERY}.`
  };
}


// The short mark beside a block number and its explanation, for each rule that
// changed with this block (chainEventsOf in workbenchModel.js).
export function epochMark(event) {
  if (event.kind === 'halving') {
    return { kind: 'halving', text: `½ reward ${formatReward(event.to) ?? ''}`.trim(),
      title: `Halving: from #${event.index} a block pays ${formatReward(event.to)} instead of ${formatReward(event.from)}` };
  }
  const up = event.to > event.from;
  const why = event.source === 'check'
    ? `the check after #${event.checked} measured ${event.window.seconds.toFixed(1)} s per block`
    : 'set by hand';
  return { kind: up ? 'up' : 'down', text: `${up ? '↑' : '↓'} difficulty ${event.to}`,
    title: `Difficulty ${event.from} → ${event.to} from #${event.index}: ${why}` };
}

// What the next blocks bring: the next halving and the next difficulty check, with the
// check's forecast; a difficulty already changed for this block names its new value.
export function upcomingOf(keyFigures, events = []) {
  if (!keyFigures?.halving) return [];
  const { halving, check, difficulty, pace } = keyFigures;
  const marks = [];
  const changed = events.find(event => event.kind === 'difficulty');
  if (changed) {
    marks.push({ ...epochMark(changed), key: 'difficulty' });
  } else {
    const forecast = check.next === difficulty ? `stays ${difficulty}` : `${check.next > difficulty ? 'rises' : 'falls'} to ${check.next}`;
    marks.push({ key: 'check', kind: 'check', text: check.in === 1 ? 'pace check' : `check in ${check.in}`,
      title: pace.seconds === null
        ? `Difficulty check after #${check.at}`
        : `Difficulty check after #${check.at}: at ${pace.seconds.toFixed(1)} s per block the difficulty ${forecast}` });
  }
  marks.push({ key: 'halving', kind: 'halving', text: halving.in === 1 ? '½ reward' : `½ in ${halving.in}`,
    title: `Halving at #${halving.at}: the reward drops to ${formatReward(halving.reward)}` });
  return marks;
}
