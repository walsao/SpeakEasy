// SpeakEasy TTS content script - Enhanced for Google compatibility
console.log("SpeakEasy TTS content script loaded");

(function() {
  // Track sidebar state
  let sidebarInjected = false;
  let styleInjected = false;
  let sidebarState = {
    collapsed: false,
    fullScreen: false,
    readingMode: false,
    darkMode: true // Default to dark mode
  };
  
  // Listen for extension button clicks
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggleSidebar") {
      toggleSidebar();
      sendResponse({status: "success"});
      return true;
    }
  });
  
  // Function to toggle sidebar
  function toggleSidebar() {
    const sidebar = document.getElementById('speakeasy-tts-sidebar');
    
    if (sidebar) {
      if (sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
        sidebarState.collapsed = false;
      } else {
        sidebar.classList.add('collapsed');
        sidebarState.collapsed = true;
      }
      
      // Update toggle button text
      const toggleButton = document.getElementById('speakeasy-tts-sidebar-toggle');
      if (toggleButton) {
        toggleButton.textContent = sidebarState.collapsed ? '▶' : '◀';
      }
    } else {
      injectSidebar();
    }
  }
  
  // Inject necessary styles
  function injectStyles() {
    if (styleInjected) return;
    
    const style = document.createElement('style');
    style.id = 'speakeasy-tts-styles';
    style.textContent = `
      #speakeasy-tts-sidebar {
        position: fixed;
        top: 0;
        right: 0;
        width: 500px;
        height: 100vh;
        background: white;
        box-shadow: -5px 0 15px rgba(0, 0, 0, 0.1);
        z-index: 2147483647;
        transition: all 0.3s ease;
        display: flex;
        flex-direction: column;
      }
      
      #speakeasy-tts-sidebar.collapsed {
        right: -490px;
      }
      
      #speakeasy-tts-sidebar.expanded {
        width: 800px;
      }
      
      #speakeasy-tts-sidebar.fullscreen {
        width: 100%;
        height: 100%;
        right: 0;
      }
      
      #speakeasy-tts-sidebar-frame {
        border: none;
        width: 100%;
        height: 100%;
        flex-grow: 1;
      }
      
      #speakeasy-tts-sidebar-toggle {
        position: absolute;
        top: 50%;
        left: 0;
        transform: translateY(-50%) translateX(-100%);
        width: 24px;
        height: 50px;
        background: #3b82f6;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        border-top-left-radius: 4px;
        border-bottom-left-radius: 4px;
        opacity: 0.8;
        z-index: 2147483647;
      }
      
      #speakeasy-tts-sidebar.fullscreen #speakeasy-tts-sidebar-toggle {
        display: none;
      }
      
      .speakeasy-tts-dark-mode #speakeasy-tts-sidebar {
        background: #1a202c;
        box-shadow: -5px 0 15px rgba(0, 0, 0, 0.3);
      }
      
      .speakeasy-tts-dark-mode #speakeasy-tts-sidebar-toggle {
        background: #3b82f6;
      }
    `;
    
    // Add style to document - works even on Google
    document.documentElement.appendChild(style);
    styleInjected = true;
  }
  
  // Function to inject the sidebar
  function injectSidebar() {
    try {
      if (sidebarInjected) return;
      
      // Inject styles first
      injectStyles();
      
      // Create sidebar container
      const sidebar = document.createElement('div');
      sidebar.id = 'speakeasy-tts-sidebar';
      
      // Create iframe
      const iframe = document.createElement('iframe');
      iframe.id = 'speakeasy-tts-sidebar-frame';
      iframe.src = chrome.runtime.getURL('sidebar.html');
      
      // Create toggle button with a simple text character
      const toggleButton = document.createElement('div');
      toggleButton.id = 'speakeasy-tts-sidebar-toggle';
      toggleButton.textContent = '◀';
      toggleButton.onclick = function() {
        sidebar.classList.toggle('collapsed');
        sidebarState.collapsed = sidebar.classList.contains('collapsed');
        toggleButton.textContent = sidebarState.collapsed ? '▶' : '◀';
      };
      
      // Add components to sidebar
      sidebar.appendChild(iframe);
      sidebar.appendChild(toggleButton);
      
      // Add sidebar to document root for Google compatibility
      document.documentElement.appendChild(sidebar);
      
      // If dark mode is enabled, add the class
      if (sidebarState.darkMode) {
        document.documentElement.classList.add('speakeasy-tts-dark-mode');
      }
      
      sidebarInjected = true;
      
      // Handle communication with iframe
      window.addEventListener('message', function(event) {
        if (event.data.from === 'speakeasy-tts-sidebar') {
          if (event.data.action === 'getText') {
            const selectedText = window.getSelection().toString();
            iframe.contentWindow.postMessage({
              from: 'page',
              action: 'setText',
              text: selectedText || ''
            }, '*');
          } else if (event.data.action === 'enterReadingMode') {
            sidebarState.readingMode = true;
          } else if (event.data.action === 'exitReadingMode') {
            sidebarState.readingMode = false;
          } else if (event.data.action === 'enterFullScreen') {
            sidebarState.fullScreen = true;
            sidebar.classList.add('fullscreen');
          } else if (event.data.action === 'exitFullScreen') {
            sidebarState.fullScreen = false;
            sidebar.classList.remove('fullscreen');
          } else if (event.data.action === 'enableDarkMode') {
            sidebarState.darkMode = true;
            document.documentElement.classList.add('speakeasy-tts-dark-mode');
          } else if (event.data.action === 'disableDarkMode') {
            sidebarState.darkMode = false;
            document.documentElement.classList.remove('speakeasy-tts-dark-mode');
          } else if (event.data.action === 'collapseExtension') {
            // Collapse the sidebar when Exit button is clicked
            sidebar.classList.add('collapsed');
            sidebarState.collapsed = true;
            toggleButton.textContent = '▶';
          }
        }
      });
      
      console.log("SpeakEasy TTS sidebar injected successfully");
    } catch (error) {
      console.error("Error injecting sidebar:", error);
    }
  }

  // Start observing for Google homepage special cases
  const observer = new MutationObserver(function() {
    // If the sidebar was injected but is no longer in DOM
    const sidebar = document.getElementById('speakeasy-tts-sidebar');
    if (sidebarInjected && !sidebar) {
      console.log("Sidebar was removed, reinjecting");
      sidebarInjected = false;
      setTimeout(injectSidebar, 100);
    }
  });
  
  observer.observe(document.documentElement, { childList: true });
})();