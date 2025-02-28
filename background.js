// SpeakEasy TTS background script
// Handles extension icon clicks and cross-page communication

chrome.action.onClicked.addListener((tab) => {
  // Try to send message to content script
  chrome.tabs.sendMessage(tab.id, { action: "toggleSidebar" })
    .catch(error => {
      console.log("Content script not ready or error occurred. Injecting script directly:", error);
      
      // If content script isn't ready yet or there was an error, inject directly
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: toggleSidebarDirect
      }).catch(err => {
        console.error("Failed to execute script:", err);
        
        // Last resort: try to inject the content script and then toggle
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }).then(() => {
          // Wait a moment for the script to initialize
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: "toggleSidebar" });
          }, 100);
        }).catch(finalErr => {
          console.error("Could not inject content script:", finalErr);
        });
      });
    });
});

// Handle extension installation/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // First-time installation
    console.log("SpeakEasy TTS extension installed");
    
    // Optional: Open onboarding page
    // chrome.tabs.create({ url: "onboarding.html" });
  } else if (details.reason === "update") {
    // Extension update
    console.log("SpeakEasy TTS extension updated from version " + details.previousVersion);
  }
});

// This function will be stringified and injected directly into the page
// when needed as a fallback option
function toggleSidebarDirect() {
  const existingSidebar = document.getElementById('speakeasy-tts-sidebar');
  if (existingSidebar) {
    // If sidebar exists, toggle its state
    if (existingSidebar.classList.contains('collapsed')) {
      existingSidebar.classList.remove('collapsed');
    } else if (existingSidebar.classList.contains('expanded')) {
      existingSidebar.classList.remove('expanded');
      existingSidebar.classList.add('collapsed');
    } else {
      existingSidebar.classList.add('collapsed');
    }
  } else {
    // If content script is loaded but sidebar doesn't exist
    const event = new CustomEvent('speakeasyTTSToggle');
    document.dispatchEvent(event);
  }
}