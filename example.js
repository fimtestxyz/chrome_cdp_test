const ChromeProfileManager = require('./chrome-profile-manager');

// Initialize manager
const manager = new ChromeProfileManager();

async function main() {
  try {
    // Example 1: List all profiles
    console.log('\n=== Listing Profiles ===');
    const profiles = await manager.listProfiles();
    console.log('Available profiles:', profiles);

    // Example 2: Connect to a profile and navigate
    console.log('\n=== Navigating to a URL ===');
    const profileName = 'profile1'; // Change this to your profile name
    
    await manager.navigate(profileName, 'https://example.com');
    console.log('✓ Navigated to example.com');

    // Example 3: Get page title and URL
    console.log('\n=== Getting Page Info ===');
    const title = await manager.getTitle(profileName);
    const url = await manager.getURL(profileName);
    console.log('Title:', title);
    console.log('URL:', url);

    // Example 4: Take a screenshot
    console.log('\n=== Taking Screenshot ===');
    await manager.screenshot(profileName, './screenshot.png');

    // Example 5: Execute custom code
    console.log('\n=== Executing Custom Code ===');
    await manager.execute(profileName, async ({ page }) => {
      // Get all links on the page
      const links = await page.$$eval('a', anchors => 
        anchors.map(a => ({ text: a.textContent, href: a.href }))
      );
      console.log('Found links:', links.slice(0, 5)); // Show first 5
    });

    // Example 6: Get and set cookies
    console.log('\n=== Working with Cookies ===');
    const cookies = await manager.getCookies(profileName);
    console.log('Current cookies:', cookies.length);

    // Example 7: Work with localStorage
    console.log('\n=== Working with LocalStorage ===');
    await manager.setLocalStorage(profileName, {
      'myKey': 'myValue',
      'timestamp': new Date().toISOString()
    });
    
    const storage = await manager.getLocalStorage(profileName);
    console.log('LocalStorage:', storage);

    // Example 8: Interact with elements
    console.log('\n=== Searching on Google ===');
    await manager.navigate(profileName, 'https://google.com');
    
    // Wait for search box and type
    await manager.waitForSelector(profileName, 'textarea[name="q"]');
    await manager.type(profileName, 'textarea[name="q"]', 'Playwright CDP');
    await manager.click(profileName, 'input[value="Google Search"]');
    
    // Wait a bit for results
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const searchTitle = await manager.getTitle(profileName);
    console.log('Search results title:', searchTitle);

    // Example 9: Get all pages
    console.log('\n=== Getting All Pages ===');
    const allPages = await manager.getAllPages(profileName);
    console.log('Number of pages:', allPages.length);
    for (let i = 0; i < allPages.length; i++) {
      console.log(`  Page ${i}: ${allPages[i].url()}`);
    }

    // Example 10: Evaluate JavaScript
    console.log('\n=== Evaluating JavaScript ===');
    const userAgent = await manager.evaluate(profileName, () => navigator.userAgent);
    console.log('User Agent:', userAgent);

    const pageData = await manager.evaluate(profileName, () => {
      return {
        title: document.title,
        width: window.innerWidth,
        height: window.innerHeight,
        links: document.querySelectorAll('a').length
      };
    });
    console.log('Page data:', pageData);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Clean up - disconnect from all profiles
    await manager.disconnectAll();
  }
}

// Advanced example: Working with multiple profiles
async function multipleProfiles() {
  const manager = new ChromeProfileManager();

  try {
    console.log('\n=== Working with Multiple Profiles ===');
    
    const profiles = ['profile1', 'profile2']; // Add your profile names
    
    // Open different URLs in different profiles
    for (const profile of profiles) {
      await manager.navigate(profile, `https://example.com?profile=${profile}`);
      console.log(`✓ Opened URL in ${profile}`);
    }

    // Get data from all profiles
    for (const profile of profiles) {
      const title = await manager.getTitle(profile);
      console.log(`${profile} title:`, title);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await manager.disconnectAll();
  }
}

// Run examples
if (require.main === module) {
  main().catch(console.error);
  
  // Uncomment to run multiple profiles example
  // multipleProfiles().catch(console.error);
}

module.exports = { main, multipleProfiles };
