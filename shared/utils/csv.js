/**
 * CSV Parsing and Conversion Utilities
 *
 * Used by: corpus-builder, data-processor
 */

/**
 * Parse CSV string into array of objects
 * @param {string} csvString - CSV content
 * @param {Object} options - Parsing options
 * @returns {Array<Object>} Array of objects
 */
export function parseCSV(csvString, options = {}) {
  const {
    delimiter = ',',
    hasHeader = true,
    trimValues = true,
    skipEmptyRows = true
  } = options;

  const lines = csvString.split('\n');
  const result = [];

  if (lines.length === 0) {
    return result;
  }

  let headers = [];
  let startIndex = 0;

  // Parse header if present
  if (hasHeader && lines.length > 0) {
    headers = parseCSVLine(lines[0], delimiter).map(h => trimValues ? h.trim() : h);
    startIndex = 1;
  }

  // Parse data rows
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty rows
    if (skipEmptyRows && line.trim() === '') {
      continue;
    }

    const values = parseCSVLine(line, delimiter).map(v => trimValues ? v.trim() : v);

    if (headers.length === 0) {
      // No header - store as arrays
      result.push(values);
    } else {
      // Convert to object using headers
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      result.push(obj);
    }
  }

  return result;
}

/**
 * Parse a single CSV line handling quoted fields
 * @param {string} line - CSV line
 * @param {string} delimiter - Field delimiter
 * @returns {Array<string>}
 */
export function parseCSVLine(line, delimiter = ',') {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current);

  return result;
}

/**
 * Convert array of objects to CSV string
 * @param {Array<Object>} data - Array of objects
 * @param {Object} options - Options
 * @returns {string} CSV content
 */
export function objectsToCSV(data, options = {}) {
  const {
    delimiter = ',',
    includeHeader = true,
    fields = null
  } = options;

  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }

  // Determine fields
  let columns = fields;
  if (!columns) {
    const firstRow = data[0];
    columns = typeof firstRow === 'object' ? Object.keys(firstRow) : [];
  }

  if (columns.length === 0) {
    return '';
  }

  const lines = [];

  // Add header
  if (includeHeader) {
    lines.push(columns.map(col => escapeCSVField(col)).join(delimiter));
  }

  // Add data rows
  data.forEach(row => {
    const values = columns.map(col => {
      const value = typeof row === 'object' ? row[col] : '';
      return escapeCSVField(String(value || ''));
    });
    lines.push(values.join(delimiter));
  });

  return lines.join('\n');
}

/**
 * Escape a field for CSV (handle quotes and special chars)
 * @param {string} field - Field value
 * @returns {string}
 */
export function escapeCSVField(field) {
  // If field contains delimiter, quotes, or newlines, wrap in quotes
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    // Escape internal quotes
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

/**
 * Validate CSV data structure
 * @param {string} csvString - CSV content
 * @param {Array<string>} requiredColumns - Required column names
 * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateCSVStructure(csvString, requiredColumns = []) {
  const errors = [];
  const warnings = [];

  if (!csvString || typeof csvString !== 'string') {
    return { valid: false, errors: ['CSV string is required'], warnings: [] };
  }

  const lines = csvString.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    return { valid: false, errors: ['CSV is empty'], warnings: [] };
  }

  if (lines.length === 1) {
    warnings.push('CSV contains only header row, no data');
  }

  // Parse and check headers
  const headers = parseCSVLine(lines[0]);
  const headerSet = new Set(headers.map(h => h.trim().toLowerCase()));

  requiredColumns.forEach(col => {
    if (!headerSet.has(col.toLowerCase())) {
      errors.push(`Missing required column: ${col}`);
    }
  });

  // Check row consistency
  const firstRowFieldCount = parseCSVLine(lines[0]).length;
  for (let i = 1; i < lines.length; i++) {
    const fieldCount = parseCSVLine(lines[i]).length;
    if (fieldCount !== firstRowFieldCount) {
      warnings.push(`Row ${i + 1} has ${fieldCount} fields, expected ${firstRowFieldCount}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Convert CSV string directly to array of objects
 * @param {string} csvString - CSV content
 * @param {Array<string>} columnMapping - Map headers to field names (optional)
 * @returns {Array<Object>}
 */
export function csvStringToObjects(csvString, columnMapping = null) {
  const data = parseCSV(csvString, { hasHeader: true });

  if (columnMapping) {
    return data.map(row => {
      const mapped = {};
      Object.keys(columnMapping).forEach(oldKey => {
        const newKey = columnMapping[oldKey];
        if (oldKey in row) {
          mapped[newKey] = row[oldKey];
        }
      });
      return mapped;
    });
  }

  return data;
}

/**
 * Deduplicate array of objects by key
 * @param {Array<Object>} data - Array of objects
 * @param {string} key - Key to deduplicate by
 * @returns {Array<Object>}
 */
export function deduplicateByKey(data, key) {
  const seen = new Set();
  return data.filter(item => {
    const value = item[key];
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

/**
 * Sort array of objects by field
 * @param {Array<Object>} data - Array of objects
 * @param {string} field - Field to sort by
 * @param {string} order - 'asc' or 'desc'
 * @returns {Array<Object>}
 */
export function sortByField(data, field, order = 'asc') {
  const sorted = [...data];
  sorted.sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    }

    const aStr = String(aVal).toLowerCase();
    const bStr = String(bVal).toLowerCase();

    if (order === 'asc') {
      return aStr.localeCompare(bStr);
    } else {
      return bStr.localeCompare(aStr);
    }
  });

  return sorted;
}

/**
 * Filter array of objects by field value
 * @param {Array<Object>} data - Array of objects
 * @param {string} field - Field to filter by
 * @param {*} value - Value to match
 * @returns {Array<Object>}
 */
export function filterByField(data, field, value) {
  return data.filter(item => item[field] === value);
}

export default {
  parseCSV,
  parseCSVLine,
  objectsToCSV,
  escapeCSVField,
  validateCSVStructure,
  csvStringToObjects,
  deduplicateByKey,
  sortByField,
  filterByField
};
