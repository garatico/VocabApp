/**
 * TypeScript Type Definitions for VocabApp
 *
 * Provides type hints for all packages
 * Can be used in JavaScript files with JSDoc comments
 */

export interface LinguisticData {
  gender: string | null;
  number: string | null;
  forms: string[];
  etymology: string | null;
}

export interface FrequencyData {
  band: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  rank: number;
}

export interface WordMetadata {
  language: string;
  source: string;
  addedAt: string;
  updatedAt: string | null;
}

export interface Word {
  rank: number;
  word: string;
  display: string;
  pos: string | null;
  glosses: string[];
  difficulty: number;
  frequency: FrequencyData;
  domains: string[];
  register: string;
  linguistic: LinguisticData;
  examples: string[];
  metadata: WordMetadata;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface WordValidationResult extends ValidationResult {
  count?: number;
  total?: number;
}

export interface CSVParseOptions {
  delimiter?: string;
  hasHeader?: boolean;
  trimValues?: boolean;
  skipEmptyRows?: boolean;
}

export interface CSVObjectsOptions {
  delimiter?: string;
  includeHeader?: boolean;
  fields?: string[];
}

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  locale: string;
  flag: string;
}

export interface LanguageConfig {
  [key: string]: Language;
}

// Constants type definitions
export const POS_VALUES: string[];
export const CEFR_LEVELS: string[];
export const REGISTERS: string[];
export const DOMAINS: string[];
export const LANGUAGES: LanguageConfig;
export const LANGUAGE_CODES: string[];

// Utility function signatures for IDEs without JSDoc
declare module 'shared/utils/validation' {
  export function validateWord(word: any): ValidationResult;
  export function validateWordArray(words: any[]): WordValidationResult;
  export function isValidCEFRLevel(level: string): boolean;
  export function isValidRegister(register: string): boolean;
  export function isValidDomain(domain: string): boolean;
  export function validateDomains(domains: string[]): { valid: boolean; invalid: string[] };
  export function isValidPOS(pos: string | null): boolean;
  export function isValidLanguageCode(code: string): boolean;
  export function isValidDifficulty(difficulty: number): boolean;
  export function isValidRank(rank: number): boolean;
  export function isValidWordString(word: string): boolean;
  export function checkRequiredFields(obj: any, fields: string[]): { valid: boolean; missing: string[] };
  export function sanitizeWord(word: string): string;
  export function sanitizeGloss(gloss: string): string;
  export function deduplicateGlosses(glosses: string[]): string[];
  export function validateAndFixWord(word: any, autoFix?: boolean): { valid: boolean; word: any; errors: string[] };
}

declare module 'shared/utils/csv' {
  export function parseCSV(csv: string, options?: CSVParseOptions): any[];
  export function parseCSVLine(line: string, delimiter?: string): string[];
  export function objectsToCSV(data: any[], options?: CSVObjectsOptions): string;
  export function escapeCSVField(field: string): string;
  export function validateCSVStructure(csv: string, requiredColumns?: string[]): ValidationResult & { warnings: string[] };
  export function csvStringToObjects(csv: string, mapping?: Record<string, string>): any[];
  export function deduplicateByKey(data: any[], key: string): any[];
  export function sortByField(data: any[], field: string, order?: 'asc' | 'desc'): any[];
  export function filterByField(data: any[], field: string, value: any): any[];
}

declare module 'shared/utils/json' {
  export function deepClone<T>(obj: T): T;
  export function merge<T extends Record<string, any>>(...objects: T[]): T;
  export function deepMerge<T extends Record<string, any>>(...objects: T[]): T;
  export function pick<T extends Record<string, any>>(obj: T, keys: (keyof T)[]): Partial<T>;
  export function omit<T extends Record<string, any>>(obj: T, keys: (keyof T)[]): Partial<T>;
  export function renameKeys<T extends Record<string, any>>(obj: T, mapping: Record<string, string>): any;
  export function flatten<T extends Record<string, any>>(obj: T, prefix?: string): Record<string, any>;
  export function unflatten(obj: Record<string, any>): any;
  export function isEmpty(value: any): boolean;
  export function getByPath(obj: any, path: string): any;
  export function setByPath(obj: any, path: string, value: any): any;
  export function groupBy<T extends Record<string, any>>(data: T[], field: keyof T): Record<string, T[]>;
  export function countBy<T extends Record<string, any>>(data: T[], field: keyof T): Record<string, number>;
  export function prettyJSON(obj: any, spaces?: number): string;
  export function safeParse(json: string, fallback?: any): any;
  export function safeStringify(obj: any, fallback?: string): string;
  export function mapValues<T extends Record<string, any>>(obj: T, fn: (value: any, key: string) => any): Record<string, any>;
  export function filterObject<T extends Record<string, any>>(obj: T, fn: (value: any, key: string) => boolean): Partial<T>;
}

declare module 'shared/schemas/word-schema' {
  export const MIN_WORD: Word;
  export function validateWord(word: any): ValidationResult;
  export function createWord(partial: Partial<Word>): Word;
}

declare module 'shared/constants' {
  export { POS_VALUES, POS_LABELS, isValidPOS } from 'shared/constants/pos';
  export { CEFR_LEVELS, CEFR_LABELS, CEFR_DESCRIPTIONS, cefrIndex, isEasierThan, isValidCEFR } from 'shared/constants/cefr';
  export { REGISTERS, REGISTER_LABELS, REGISTER_DESCRIPTIONS, isValidRegister } from 'shared/constants/registers';
  export { DOMAINS, DOMAIN_LABELS, DOMAIN_COLORS, isValidDomain } from 'shared/constants/domains';
  export { LANGUAGES, LANGUAGE_CODES, LANGUAGE_KEYS, isValidLanguage, getLanguage } from 'shared/constants/languages';
}
