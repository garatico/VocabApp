/**
 * Simple API Test Script
 *
 * Usage: node test-api.js
 * Make sure the backend is running first: npm run dev
 */

const BASE_URL = 'http://localhost:3000';

/**
 * Make HTTP request
 */
async function request(path) {
  try {
    const response = await fetch(`${BASE_URL}${path}`);
    const data = await response.json();
    return {
      status: response.status,
      data
    };
  } catch (error) {
    return {
      error: error.message
    };
  }
}

/**
 * Format JSON for display
 */
function formatJSON(obj, depth = 2) {
  return JSON.stringify(obj, null, 2).split('\n').slice(0, depth * 3).join('\n');
}

/**
 * Test the API
 */
async function runTests() {
  console.log('\n🧪 VocabApp Backend API Tests\n');
  console.log('═'.repeat(60));

  // Test 1: Health check
  console.log('\n✓ Test 1: Health Check');
  console.log('  Request: GET /api/health');
  const health = await request('/api/health');
  if (health.error) {
    console.log('  ❌ Error:', health.error);
    console.log('  Make sure backend is running: npm run dev');
    return;
  }
  console.log('  Status:', health.status);
  console.log('  Response:', formatJSON(health.data, 2));

  // Test 2: List languages
  console.log('\n✓ Test 2: List Available Languages');
  console.log('  Request: GET /api/languages');
  const languages = await request('/api/languages');
  console.log('  Status:', languages.status);
  console.log('  Languages:', languages.data.languages.map(l => `${l.flag} ${l.name}`).join(', '));

  // Test 3: Get vocabulary (may fail if file doesn't exist - that's OK)
  console.log('\n✓ Test 3: Get Spanish Vocabulary');
  console.log('  Request: GET /api/vocab/spanish');
  const spanish = await request('/api/vocab/spanish');
  console.log('  Status:', spanish.status);
  if (spanish.data.error) {
    console.log('  ℹ  Expected: Vocabulary file not found yet');
    console.log('  Message:', spanish.data.message);
  } else {
    console.log('  Words loaded:', spanish.data.count);
    if (spanish.data.data.length > 0) {
      console.log('  First word:', JSON.stringify(spanish.data.data[0], null, 2).split('\n').slice(0, 5).join('\n'));
    }
  }

  // Test 4: Test 404 error handling
  console.log('\n✓ Test 4: Error Handling (Invalid Language)');
  console.log('  Request: GET /api/vocab/klingon');
  const invalid = await request('/api/vocab/klingon');
  console.log('  Status:', invalid.status);
  console.log('  Error:', invalid.data.message);

  // Test 5: Test 404 for non-existent route
  console.log('\n✓ Test 5: 404 Handler (Non-existent Route)');
  console.log('  Request: GET /api/invalid-endpoint');
  const notFound = await request('/api/invalid-endpoint');
  console.log('  Status:', notFound.status);
  console.log('  Error:', notFound.data.message);

  console.log('\n═'.repeat(60));
  console.log('\n✅ API Tests Complete!\n');
  console.log('Next steps:');
  console.log('  1. Add vocabulary JSON files to backend/data/');
  console.log('  2. Run: npm run dev');
  console.log('  3. Visit: http://localhost:3000\n');
}

// Run tests
runTests().catch(console.error);
