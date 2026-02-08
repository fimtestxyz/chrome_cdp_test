const ChromeProfileManager = require('./chrome-profile-manager');

async function runTests() {
  const manager = new ChromeProfileManager();
  let testsPassed = 0;
  let testsFailed = 0;

  console.log('🧪 Running Chrome Profile Manager Tests\n');

  // Test 1: List profiles
  try {
    console.log('Test 1: List profiles...');
    const profiles = await manager.listProfiles();
    console.log(`✓ Found ${profiles.length} profile(s)`);
    testsPassed++;
  } catch (error) {
    console.error('✗ Failed:', error.message);
    testsFailed++;
  }

  // Test 2: Get profile config
  try {
    console.log('\nTest 2: Get profile config...');
    const config = await manager.getProfileConfig('profile1');
    console.log(`✓ Profile config loaded (port: ${config.port})`);
    testsPassed++;
  } catch (error) {
    console.error('✗ Failed:', error.message);
    console.log('  Note: Create a profile first with: ./chrome-profile-manager.sh create profile1');
    testsFailed++;
  }

  // Test 3: Connect to Chrome
  try {
    console.log('\nTest 3: Connect to Chrome...');
    const browser = await manager.connect('profile1');
    console.log('✓ Connected to Chrome successfully');
    
    // Test 4: Get page
    console.log('\nTest 4: Get page...');
    const { page } = await manager.getPage('profile1');
    console.log('✓ Got page successfully');
    testsPassed += 2;

    // Test 5: Navigate
    console.log('\nTest 5: Navigate to URL...');
    await manager.navigate('profile1', 'https://example.com');
    const url = await manager.getURL('profile1');
    console.log(`✓ Navigated successfully (${url})`);
    testsPassed++;

    // Test 6: Get title
    console.log('\nTest 6: Get page title...');
    const title = await manager.getTitle('profile1');
    console.log(`✓ Got title: "${title}"`);
    testsPassed++;

    // Test 7: Evaluate JavaScript
    console.log('\nTest 7: Evaluate JavaScript...');
    const result = await manager.evaluate('profile1', () => {
      return {
        userAgent: navigator.userAgent.substring(0, 50) + '...',
        width: window.innerWidth,
        height: window.innerHeight
      };
    });
    console.log(`✓ JavaScript executed:`, result);
    testsPassed++;

    // Test 8: Get cookies
    console.log('\nTest 8: Get cookies...');
    const cookies = await manager.getCookies('profile1');
    console.log(`✓ Got ${cookies.length} cookie(s)`);
    testsPassed++;

    // Test 9: Set and get localStorage
    console.log('\nTest 9: LocalStorage operations...');
    await manager.setLocalStorage('profile1', {
      'test_key': 'test_value',
      'timestamp': new Date().toISOString()
    });
    const storage = await manager.getLocalStorage('profile1');
    if (storage.test_key === 'test_value') {
      console.log('✓ LocalStorage working correctly');
      testsPassed++;
    } else {
      throw new Error('LocalStorage value mismatch');
    }

    // Test 10: Get all pages
    console.log('\nTest 10: Get all pages...');
    const pages = await manager.getAllPages('profile1');
    console.log(`✓ Got ${pages.length} page(s)`);
    testsPassed++;

    // Test 11: Get CDP endpoint
    console.log('\nTest 11: Get CDP endpoint...');
    const endpoint = await manager.getCDPEndpoint('profile1');
    console.log(`✓ CDP endpoint: ${endpoint}`);
    testsPassed++;

  } catch (error) {
    console.error('✗ Failed:', error.message);
    console.log('  Note: Start Chrome first with: ./chrome-profile-manager.sh start profile1');
    testsFailed++;
  }

  // Cleanup
  try {
    await manager.disconnectAll();
  } catch (error) {
    // Ignore cleanup errors
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('Test Summary:');
  console.log(`  Passed: ${testsPassed}`);
  console.log(`  Failed: ${testsFailed}`);
  console.log(`  Total:  ${testsPassed + testsFailed}`);
  console.log('='.repeat(50));

  if (testsFailed === 0) {
    console.log('\n✓ All tests passed! 🎉');
    process.exit(0);
  } else {
    console.log('\n✗ Some tests failed');
    process.exit(1);
  }
}

if (require.main === module) {
  runTests().catch(error => {
    console.error('\n✗ Test suite error:', error);
    process.exit(1);
  });
}

module.exports = runTests;
