import { readString, writeString } from '../../utils/storage.ts';

/**
 * sidebar-state.ts — which sidebar sections and folders are collapsed, remembered across visits.
 */

// ── Collapsible sections ──────────────────────────────────────────────────
//
// The four multi-row sections (Single-Language/Smart/Cross-Language Lists,
// Testing Profiles) — not Browse All Words, which is a single static entry
// with nothing to collapse. Persisted per section so a learner who's parked
// a section closed (e.g. Smart Lists they rarely touch) keeps it that way
// across visits, same convention as profile-panel.ts's own field-group
// collapse state (`ml_profile_group_open_<id>`).
// 'visual' (Visual Profiles) only actually renders when
// Settings.getShowVisualProfiles() is on — included here regardless so
// Collapse All/Expand All still remembers its state for whenever it's
// switched on.
export const SIDEBAR_SECTIONS = ['single', 'smart', 'multi', 'profiles', 'visual'] as const;
export type SidebarSectionId = (typeof SIDEBAR_SECTIONS)[number];

export function isSectionCollapsed(id: SidebarSectionId): boolean {
  return readString(`ml_sidebar_section_collapsed_${id}`) === 'true';
}
export function setSectionCollapsed(id: SidebarSectionId, collapsed: boolean): void {
  writeString(`ml_sidebar_section_collapsed_${id}`, String(collapsed));
}

/** Same idea, one level deeper — a folder within a section (see
 *  renderSection()'s own folder regrouping). Keyed by section + folder name
 *  so two sections can each have a same-named folder collapsed independently. */
export function isFolderCollapsed(sectionId: SidebarSectionId, folder: string): boolean {
  return readString(`ml_sidebar_folder_collapsed_${sectionId}_${folder}`) === 'true';
}
export function setFolderCollapsed(sectionId: SidebarSectionId, folder: string, collapsed: boolean): void {
  writeString(`ml_sidebar_folder_collapsed_${sectionId}_${folder}`, String(collapsed));
}
