// @vitest-environment jsdom
/**
 * section-collapse.test.ts — initSectionCollapse() (src/client/filters/
 * section-collapse.ts): the show/hide toggle for filter-box sections
 * (Part of Speech, Lists, Domains, Tense & Forms), including its
 * click-anywhere-in-the-box and "don't hijack a real control" behavior.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { initSectionCollapse } from '../../src/client/filters/section-collapse.js';

interface Fixture {
  block: HTMLElement;
  btn: HTMLButtonElement;
  body: HTMLElement;
  innerBtn: HTMLButtonElement;
  label: HTMLElement;
}

function buildFixture(defaultOpen = false): Fixture {
  const block = document.createElement('div');
  block.className = 'filter-box';

  const btn = document.createElement('button');
  btn.className = 'filter-collapse-btn';
  btn.dataset.collapse = 'body1';
  btn.setAttribute('aria-controls', 'body1');
  if (defaultOpen) btn.dataset.defaultOpen = 'true';
  const label = document.createElement('span');
  label.className = 'filter-section-label';
  label.textContent = 'Label';
  btn.appendChild(label);

  const body = document.createElement('div');
  body.id = 'body1';
  body.className = 'filter-body';
  const blank = document.createElement('p');
  blank.textContent = 'description text';
  const innerBtn = document.createElement('button');
  innerBtn.textContent = 'a real control';
  body.append(blank, innerBtn);

  block.append(btn, body);
  document.body.appendChild(block);
  return { block, btn, body, innerBtn, label };
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('initSectionCollapse', () => {
  it('does nothing when there are no [data-collapse] buttons', () => {
    expect(() => initSectionCollapse()).not.toThrow();
  });

  it('leaves a button alone when its target id does not exist', () => {
    const btn = document.createElement('button');
    btn.dataset.collapse = 'missing';
    btn.setAttribute('aria-expanded', 'unset');
    document.body.appendChild(btn);
    initSectionCollapse();
    expect(btn.getAttribute('aria-expanded')).toBe('unset');
  });

  it('starts collapsed by default, with no saved state and no data-default-open', () => {
    const { btn, body } = buildFixture();
    initSectionCollapse();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(body.classList.contains('filter-body--collapsed')).toBe(true);
  });

  it('starts open when data-default-open is set and nothing is saved', () => {
    const { btn, body } = buildFixture(true);
    initSectionCollapse();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(body.classList.contains('filter-body--collapsed')).toBe(false);
  });

  it('a saved "true" wins even without data-default-open', () => {
    localStorage.setItem('s_section_open_body1', 'true');
    const { btn, body } = buildFixture(false);
    initSectionCollapse();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(body.classList.contains('filter-body--collapsed')).toBe(false);
  });

  it('a saved "false" overrules data-default-open', () => {
    localStorage.setItem('s_section_open_body1', 'false');
    const { btn, body } = buildFixture(true);
    initSectionCollapse();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(body.classList.contains('filter-body--collapsed')).toBe(true);
  });

  it('clicking the header toggles state and persists it', () => {
    const { btn, body } = buildFixture();
    initSectionCollapse();
    click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(body.classList.contains('filter-body--collapsed')).toBe(false);
    expect(localStorage.getItem('s_section_open_body1')).toBe('true');

    click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(localStorage.getItem('s_section_open_body1')).toBe('false');
  });

  it('clicking blank space in the surrounding box also toggles', () => {
    const { block, btn } = buildFixture();
    initSectionCollapse();
    click(block);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('clicking a real control inside the body does not toggle', () => {
    const { btn, innerBtn } = buildFixture();
    initSectionCollapse();
    click(innerBtn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking inside the header (e.g. its label span) toggles exactly once, not twice', () => {
    const { btn, label } = buildFixture();
    initSectionCollapse();
    click(label);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    click(label);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('marks the surrounding box as toggleable for styling', () => {
    const { block } = buildFixture();
    initSectionCollapse();
    expect(block.classList.contains('filter-block--toggleable')).toBe(true);
  });
});
