/**
 * Semantic Domains / Topics
 *
 * Categories for organizing vocabulary by topic/context
 */

export const DOMAINS = [
  'general',
  'business',
  'academic',
  'medical',
  'legal',
  'technology',
  'travel',
  'culture',
  'sport',
  'food',
  'politics',
  'science',
  'environment',
  'entertainment',
  'relationships'
];

export const DOMAIN_LABELS = {
  general: 'General',
  business: 'Business',
  academic: 'Academic',
  medical: 'Medical',
  legal: 'Legal',
  technology: 'Technology',
  travel: 'Travel',
  culture: 'Culture',
  sport: 'Sport',
  food: 'Food',
  politics: 'Politics',
  science: 'Science',
  environment: 'Environment',
  entertainment: 'Entertainment',
  relationships: 'Relationships'
};

export const DOMAIN_COLORS = {
  general: '#6B7280',
  business: '#0EA5E9',
  academic: '#8B5CF6',
  medical: '#EC4899',
  legal: '#DC2626',
  technology: '#14B8A6',
  travel: '#F59E0B',
  culture: '#A78BFA',
  sport: '#22C55E',
  food: '#F97316',
  politics: '#64748B',
  science: '#06B6D4',
  environment: '#10B981',
  entertainment: '#EF4444',
  relationships: '#F43F5E'
};

export const isValidDomain = (domain) => DOMAINS.includes(domain);

export default {
  DOMAINS,
  DOMAIN_LABELS,
  DOMAIN_COLORS,
  isValidDomain
};
