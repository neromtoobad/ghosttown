// A lesson is a short run of cards. Each card: one character says one thing, the player does
// at most one small action, then Continue. One idea per screen keeps it easy for beginners.
import { h, sfx } from './ui';
import { castPortrait, CAST, type Who } from './identity';
import { icon, LEVEL_ICONS } from './icons';

export type StepCtx = {
  area: HTMLElement;
  /** Unlock the Continue button (for steps that wait on an action). */
  done: () => void;
  /** Swap who is talking, mid-step (e.g. the Watcher reacting). */
  say: (who: Who, pose: string, text: string) => void;
};
export type Step = {
  who: Who; pose: string; text: string;
  widget?: (c: StepCtx) => void;
  wait?: boolean;        // Continue stays locked until the widget calls done()
  cta?: string;
};
export type Quiz = { q: string; options: string[]; answer: number; why: string };
export type LessonDef = { n: number; title: string; blurb: string; steps: Step[]; quiz: Quiz; learned: string[] };

export function runLesson(host: HTMLElement, L: LessonDef, total: number): Promise<void> {
  const steps: Step[] = [
    ...L.steps,
    { who: 'zee', pose: 'think', text: 'Quick check.', wait: true, widget: (c) => quizWidget(c, L.quiz) },
    { who: 'zee', pose: 'cheer', text: 'Level complete.', widget: ({ area }) => area.append(h('div', { class: 'learned' }, h('div', { class: 'learned-title' }, 'You learned'), h('ul', {}, ...L.learned.map((t) => h('li', { html: t }))))), cta: 'Finish level' },
  ];
  const bar = h('i');
  const counter = h('span', { class: 'step-count' });
  const card = h('div', { class: 'card' });
  host.replaceChildren(h('section', { class: 'lesson' },
    h('div', { class: 'lesson-top' },
      h('a', { class: 'back', href: '#/' }, '← All levels'),
      h('span', { class: 'lesson-name' }, h('span', { class: 'lesson-icon' }, icon(LEVEL_ICONS[L.n - 1] ?? 'star', 16)), `Level ${L.n} of ${total} · ${L.title}`), counter),
    h('div', { class: 'steps-bar', 'aria-hidden': 'true' }, bar),
    card));

  return new Promise<void>((resolve) => {
    let i = 0;
    const show = () => {
      const s = steps[i];
      bar.style.width = `${(i / steps.length) * 100}%`;
      counter.textContent = `${i + 1}/${steps.length}`;
      const speech = h('div', { class: 'speech' });
      const area = h('div', { class: 'area' });
      const cta = h('button', { class: 'btn primary big cta', type: 'button' }, s.cta ?? 'Continue →') as HTMLButtonElement;
      const say = (who: Who, pose: string, text: string) => {
        speech.className = `speech ${who}`;
        speech.replaceChildren(
          h('figure', { class: `frame ${who}` }, castPortrait(who, pose, 4)),
          h('div', { class: 'speech-body' }, h('b', { class: 'speaker' }, CAST[who].name), h('p', { class: 'line', html: text })));
        speech.classList.remove('talk'); void speech.offsetWidth; speech.classList.add('talk');
      };
      say(s.who, s.pose, s.text);
      let unlocked = !s.wait;
      cta.disabled = !unlocked;
      const done = () => { if (unlocked) return; unlocked = true; cta.disabled = false; cta.classList.add('ready'); cta.focus({ preventScroll: true }); };
      card.replaceChildren(speech, area, h('div', { class: 'cta-row' }, cta));
      card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
      s.widget?.({ area, done, say });
      cta.addEventListener('click', () => {
        if (!unlocked) return;
        sfx.pop(); i++;
        if (i < steps.length) { show(); window.scrollTo({ top: 0, behavior: 'smooth' }); } else { bar.style.width = '100%'; resolve(); }
      });
    };
    show();
  });
}

function quizWidget({ area, done }: StepCtx, q: Quiz) {
  const why = h('p', { class: 'why', hidden: true });
  const list = h('div', { class: 'opts' });
  q.options.forEach((o, k) => {
    const b = h('button', { class: 'opt', type: 'button' }, o) as HTMLButtonElement;
    b.addEventListener('click', () => {
      if (k === q.answer) {
        sfx.ding(); b.classList.add('right');
        list.querySelectorAll('button').forEach((x) => ((x as HTMLButtonElement).disabled = true));
        why.hidden = false; why.textContent = `✓ ${q.why}`; done();
      } else { sfx.buzz(); b.classList.add('wrong'); b.disabled = true; }
    });
    list.append(b);
  });
  area.append(h('p', { class: 'q' }, q.q), list, why);
}

/** A row of big tappable choices. Calls onPick with the index. */
export function choices(labels: (string | Node)[], onPick: (i: number, btn: HTMLButtonElement) => void, cls = ''): HTMLElement {
  const row = h('div', { class: `choices ${cls}` });
  labels.forEach((l, i) => {
    const b = h('button', { class: 'choice', type: 'button' }, l) as HTMLButtonElement;
    b.addEventListener('click', () => { sfx.pop(); onPick(i, b); });
    row.append(b);
  });
  return row;
}
