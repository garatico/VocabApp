/**
 * JSON Manipulation Utilities
 *
 * Used by: corpus-builder, data-processor
 */

/**
 * Deep clone a JSON object
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Merge multiple objects (shallow merge)
 * @param {...Object} objects - Objects to merge
 * @returns {Object} Merged object
 */
export function merge(...objects) {
  return Object.assign({}, ...objects);
}

/**
 * Deep merge multiple objects
 * @param {...Object} objects - Objects to merge
 * @returns {Object} Merged object
 */
export function deepMerge(...objects) {
  return objects.reduce((result, obj) => {
    if (typeof obj !== 'object' || obj === null) {
      return result;
    }

    Object.keys(obj).forEach(key => {
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        result[key] = deepMerge(result[key] || {}, obj[key]);
      } else {
        result[key] = obj[key];
      }
    });

    return result;
  }, {});
}

/**
 * Pick specific keys from an object
 * @param {Object} obj - Source object
 * @param {Array<string>} keys - Keys to pick
 * @returns {Object} New object with picked keys
 */
export function pick(obj, keys) {
  const result = {};
  keys.forEach(key => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
}

/**
 * Omit specific keys from an object
 * @param {Object} obj - Source object
 * @param {Array<string>} keys - Keys to omit
 * @returns {Object} New object without omitted keys
 */
export function omit(obj, keys) {
  const keySet = new Set(keys);
  const result = {};
  Object.keys(obj).forEach(key => {
    if (!keySet.has(key)) {
      result[key] = obj[key];
    }
  });
  return result;
}

/**
 * Rename keys in an object
 * @param {Object} obj - Source object
 * @param {Object} mapping - Key mapping { oldKey: 'newKey' }
 * @returns {Object} New object with renamed keys
 */
export function renameKeys(obj, mapping) {
  const result = {};
  Object.keys(obj).forEach(key => {
    const newKey = mapping[key] || key;
    result[newKey] = obj[key];
  });
  return result;
}

/**
 * Flatten nested object (one level)
 * @param {Object} obj - Nested object
 * @param {string} prefix - Key prefix
 * @returns {Object} Flattened object
 */
export function flatten(obj, prefix = '') {
  const result = {};

  Object.keys(obj).forEach(key => {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flatten(value, newKey));
    } else {
      result[newKey] = value;
    }
  });

  return result;
}

/**
 * Unflatten a flattened object
 * @param {Object} obj - Flattened object
 * @returns {Object} Nested object
 */
export function unflatten(obj) {
  const result = {};

  Object.keys(obj).forEach(key => {
    const keys = key.split('.');
    let current = result;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current)) {
        current[k] = {};
      }
      current = current[k];
    }

    current[keys[keys.length - 1]] = obj[key];
  });

  return result;
}

/**
 * Check if value is empty (null, undefined, '', [], {})
 * @param {*} value - Value to check
 * @returns {boolean}
 */
export function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Get value at path in nested object
 * @param {Object} obj - Object
 * @param {string} path - Path (e.g., 'a.b.c')
 * @returns {*}
 */
export function getByPath(obj, path) {
  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * Set value at path in nested object
 * @param {Object} obj - Object
 * @param {string} path - Path (e.g., 'a.b.c')
 * @param {*} value - Value to set
 * @returns {Object} Modified object
 */
export function setByPath(obj, path, value) {
  const result = deepClone(obj);
  const keys = path.split('.');
  let current = result;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
  return result;
}

/**
 * Group array of objects by field
 * @param {Array<Object>} data - Array of objects
 * @param {string} field - Field to group by
 * @returns {Object} Grouped data
 */
export function groupBy(data, field) {
  const result = {};

  data.forEach(item => {
    const key = String(item[field] || 'null');
    if (!(key in result)) {
      result[key] = [];
    }
    result[key].push(item);
  });

  return result;
}

/**
 * Count occurrences of values in array of objects by field
 * @param {Array<Object>} data - Array of objects
 * @param {string} field - Field to count by
 * @returns {Object} Count map
 */
export function countBy(data, field) {
  const result = {};

  data.forEach(item => {
    const key = String(item[field] || 'null');
    result[key] = (result[key] || 0) + 1;
  });

  return result;
}

/**
 * Pretty print JSON
 * @param {*} obj - Object to stringify
 * @param {number} spaces - Indent spaces
 * @returns {string}
 */
export function prettyJSON(obj, spaces = 2) {
  return JSON.stringify(obj, null, spaces);
}

/**
 * Safe JSON parse with fallback
 * @param {string} jsonString - JSON string
 * @param {*} fallback - Fallback value if parse fails
 * @returns {*}
 */
export function safeParse(jsonString, fallback = null) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    return fallback;
  }
}

/**
 * Safe JSON stringify with fallback
 * @param {*} obj - Object to stringify
 * @param {string} fallback - Fallback value if stringify fails
 * @returns {string}
 */
export function safeStringify(obj, fallback = '{}') {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return fallback;
  }
}

/**
 * Map values in object (transform each value)
 * @param {Object} obj - Object
 * @param {Function} fn - Transform function (value, key) => newValue
 * @returns {Object} New object with transformed values
 */
export function mapValues(obj, fn) {
  const result = {};
  Object.keys(obj).forEach(key => {
    result[key] = fn(obj[key], key);
  });
  return result;
}

/**
 * Filter object by values
 * @param {Object} obj - Object
 * @param {Function} fn - Filter function (value, key) => boolean
 * @returns {Object} Filtered object
 */
export function filterObject(obj, fn) {
  const result = {};
  Object.keys(obj).forEach(key => {
    if (fn(obj[key], key)) {
      result[key] = obj[key];
    }
  });
  return result;
}

export default {
  deepClone,
  merge,
  deepMerge,
  pick,
  omit,
  renameKeys,
  flatten,
  unflatten,
  isEmpty,
  getByPath,
  setByPath,
  groupBy,
  countBy,
  prettyJSON,
  safeParse,
  safeStringify,
  mapValues,
  filterObject
};
