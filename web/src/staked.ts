// Staked tables (host and join). Filled in below the practice table.
import { h } from './dom';
import type { Controller } from './table';

export function hostSetup(_play: (c: Controller) => void) {
  return h('section', { class: 'setup panel' }, h('h1', {}, 'Host a staked table'), h('p', { class: 'muted' }, 'Coming up.'));
}

export function joinView(code: string, _play: (c: Controller) => void) {
  return h('section', { class: 'setup panel' }, h('h1', {}, `Table ${code}`), h('p', { class: 'muted' }, 'Coming up.'));
}
