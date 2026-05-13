/**
 * Register (style/tone of language)
 *
 * neutral: standard usage
 * formal: official/academic/business language
 * informal: casual conversation
 * colloquial: very casual/slang
 * technical: specialized/professional jargon
 */

export const REGISTERS = [
  'neutral',
  'formal',
  'informal',
  'colloquial',
  'technical'
];

export const REGISTER_LABELS = {
  neutral: 'Neutral',
  formal: 'Formal',
  informal: 'Informal',
  colloquial: 'Colloquial',
  technical: 'Technical'
};

export const REGISTER_DESCRIPTIONS = {
  neutral: 'Standard, everyday usage',
  formal: 'Official, academic, or business language',
  informal: 'Casual conversation',
  colloquial: 'Very casual, slang-like',
  technical: 'Specialized or professional jargon'
};

export const isValidRegister = (register) => REGISTERS.includes(register);

export default {
  REGISTERS,
  REGISTER_LABELS,
  REGISTER_DESCRIPTIONS,
  isValidRegister
};
