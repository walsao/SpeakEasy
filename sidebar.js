// SpeakEasy TTS Sidebar Script
document.addEventListener('DOMContentLoaded', function() {
  // State tracking
  let voiceOptionsVisible = false;
  let isPlaying = false;
  let isPaused = false;
  let currentUtterance = null;
  let readingMode = false;
  let fullScreenMode = false;
  let statusTimeout = null;
  let currentParagraphIndex = 0;
  let allParagraphs = [];
  let playbackProgress = 0;
  let estimatedTotalDuration = 0;
  let playbackTimer = null;
  let startTime = 0;
  
  // Settings with defaults
  const settings = {
    voice: null,
    rate: 1.0,
    pitch: 1.0,
    enableSmartPauses: true,
    darkMode: true // Default to dark mode
  };
  
  // Try to load settings from storage
  try {
    chrome.storage.local.get(['speakEasySettings'], function(result) {
      if (result.speakEasySettings) {
        Object.assign(settings, result.speakEasySettings);
        applySettings();
      }
    });
  } catch (e) {
    console.log("Could not load settings from storage:", e);
    // Try localStorage as fallback
    try {
      const savedSettings = localStorage.getItem('speakEasySettings');
      if (savedSettings) {
        Object.assign(settings, JSON.parse(savedSettings));
        applySettings();
      }
    } catch (e2) {
      console.log("Could not load settings from localStorage either:", e2);
    }
  }
  
  // Function to save settings
  function saveSettings() {
    try {
      chrome.storage.local.set({ speakEasySettings: settings });
    } catch (e) {
      console.log("Could not save settings to storage:", e);
      try {
        localStorage.setItem('speakEasySettings', JSON.stringify(settings));
      } catch (e2) {
        console.log("Could not save settings to localStorage either:", e2);
      }
    }
  }
  
  // Apply loaded settings to UI
  function applySettings() {
    // Apply dark mode
    if (settings.darkMode) {
      document.body.classList.remove('light');
      document.body.classList.add('dark');
      const container = document.querySelector('.tts-container');
      if (container) {
        container.classList.remove('light');
        container.classList.add('dark');
      }
    } else {
      document.body.classList.remove('dark');
      document.body.classList.add('light');
      const container = document.querySelector('.tts-container');
      if (container) {
        container.classList.remove('dark');
        container.classList.add('light');
      }
    }
    
    // Update checkboxes
    const smartPausesCheck = document.getElementById('enable-smart-pauses');
    if (smartPausesCheck) smartPausesCheck.checked = settings.enableSmartPauses;
    
    // Update sliders
    const rateSlider = document.getElementById('rate-slider');
    if (rateSlider) rateSlider.value = settings.rate;
    
    const pitchSlider = document.getElementById('pitch-slider');
    if (pitchSlider) pitchSlider.value = settings.pitch;
    
    const rateValue = document.getElementById('rate-value');
    if (rateValue) rateValue.textContent = settings.rate.toFixed(1);
    
    const pitchValue = document.getElementById('pitch-value');
    if (pitchValue) pitchValue.textContent = settings.pitch.toFixed(1);
    
    // Update theme toggle icon
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
      themeToggle.innerHTML = settings.darkMode ? '☀️' : '🌙';
      themeToggle.title = settings.darkMode ? 'Switch to light mode' : 'Switch to dark mode';
    }
  }
  
  // Get selected text from the page
  window.parent.postMessage({
    from: 'speakeasy-tts-sidebar',
    action: 'getText'
  }, '*');
  
  // Listen for text from the page
  window.addEventListener('message', function(event) {
    if (event.data.from === 'page') {
      if (event.data.action === 'setText') {
        // If there's selected text, populate the textarea
        const textElement = document.querySelector('textarea');
        if (textElement && event.data.text) {
          textElement.value = event.data.text;
        }
      } else if (event.data.action === 'toggleVoiceOptions') {
        toggleVoiceOptions();
      }
    }
  });
  
  // Function to toggle voice options panel
  function toggleVoiceOptions() {
    voiceOptionsVisible = !voiceOptionsVisible;
    const voicePanel = document.getElementById('voice-options-panel');
    const voiceButton = document.getElementById('voice-options-button');
    
    if (voiceOptionsVisible) {
      // Position the panel below the voice options button
      voicePanel.style.display = 'block';
      
      // Position the panel in the center
      voicePanel.style.position = 'absolute';
      voicePanel.style.top = '80px'; // Position below the play button
      voicePanel.style.left = '50%'; // Center horizontally
      voicePanel.style.transform = 'translateX(-50%)'; // Center adjustment
      
      // Ensure panel stays within viewport
      const viewportHeight = window.innerHeight;
      const panelHeight = voicePanel.offsetHeight;
      
      if (panelHeight + 30 > viewportHeight - 20) {
        // If panel extends beyond viewport, adjust position
        voicePanel.style.top = `${Math.max(20, viewportHeight - panelHeight - 20)}px`;
      }
      
      // Make the header transparent when visible
      const header = voicePanel.querySelector('.panel-header');
      if (header) {
        header.style.opacity = '0.8';
      }
      
      // Add event listener to close when clicking outside
      setTimeout(() => {
        document.addEventListener('click', closeVoiceOptionsOutside);
      }, 10);
    } else {
      voicePanel.style.display = 'none';
      document.removeEventListener('click', closeVoiceOptionsOutside);
    }
  }
  
  // Function to close voice options when clicking outside
  function closeVoiceOptionsOutside(event) {
    const voicePanel = document.getElementById('voice-options-panel');
    const voiceButton = document.getElementById('voice-options-button');
    
    if (voicePanel && 
        !voicePanel.contains(event.target) && 
        event.target !== voiceButton) {
      voiceOptionsVisible = false;
      voicePanel.style.display = 'none';
      document.removeEventListener('click', closeVoiceOptionsOutside);
    }
  }
  
  // Function to show status messages
  function showStatus(message, type = 'info') {
    const container = document.querySelector('.tts-container');
    // Clear any existing status timeout
    if (statusTimeout) {
      clearTimeout(statusTimeout);
      statusTimeout = null;
    }
    
    // Remove any existing status indicator
    const oldStatus = document.querySelector('.status-indicator');
    if (oldStatus) {
      oldStatus.remove();
    }
    
    // Create new status
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-indicator ${type}`;
    statusDiv.textContent = message;
    
    // Add to container
    container.appendChild(statusDiv);
    
    // Auto clear after 3 seconds for regular messages
    if (type !== 'error') {
      statusTimeout = setTimeout(() => {
        statusDiv.remove();
        statusTimeout = null;
      }, 3000);
    }
  }
  
  // Estimate speaking time for text
  function estimateSpeakingTime(text) {
    // Average speaking rate is about 150 words per minute
    const wordsPerMinute = 150 * settings.rate;
    const wordCount = text.split(/\s+/).length;
    return (wordCount / wordsPerMinute) * 60; // Return seconds
  }
  
  // Format time as mm:ss
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  // Update progress bar
  function updateProgressBar(currentTime, totalTime) {
    const progressBar = document.getElementById('playback-progress');
    const currentTimeDisplay = document.getElementById('current-time');
    const totalTimeDisplay = document.getElementById('total-time');
    
    if (progressBar && currentTimeDisplay && totalTimeDisplay) {
      const progressPercentage = (currentTime / totalTime) * 100;
      progressBar.value = progressPercentage;
      currentTimeDisplay.textContent = formatTime(currentTime);
      totalTimeDisplay.textContent = formatTime(totalTime);
    }
  }
  
  // Start progress tracking
  function startProgressTracking(totalDuration) {
    estimatedTotalDuration = totalDuration;
    startTime = Date.now();
    
    if (playbackTimer) {
      clearInterval(playbackTimer);
    }
    
    updateProgressBar(0, totalDuration);
    
    playbackTimer = setInterval(() => {
      if (isPlaying && !isPaused) {
        const elapsedTime = (Date.now() - startTime) / 1000;
        updateProgressBar(Math.min(elapsedTime, totalDuration), totalDuration);
        
        // If we've reached the end, clear the timer
        if (elapsedTime >= totalDuration) {
          clearInterval(playbackTimer);
          playbackTimer = null;
        }
      }
    }, 100);
  }
  
  // Stop progress tracking
  function stopProgressTracking() {
    if (playbackTimer) {
      clearInterval(playbackTimer);
      playbackTimer = null;
    }
  }
  
  // Jump forward or backward
  function jumpPlayback(seconds) {
    if (!isPlaying) return;
    
    // Calculate rough text position based on elapsed time
    const elapsedTime = (Date.now() - startTime) / 1000;
    const newTime = Math.max(0, Math.min(estimatedTotalDuration, elapsedTime + seconds));
    const jumpRatio = newTime / estimatedTotalDuration;
    
    // Stop current speech
    window.speechSynthesis.cancel();
    
    // Reset elapsed time
    startTime = Date.now() - (newTime * 1000);
    
    // Calculate new paragraph index
    let totalTextLength = 0;
    const allText = allParagraphs.join(' ');
    
    for (let i = 0; i < allParagraphs.length; i++) {
      totalTextLength += allParagraphs[i].length;
      if (totalTextLength / allText.length > jumpRatio) {
        currentParagraphIndex = i;
        break;
      }
    }
    
    // Start speaking from the new position
    speakFromPosition(currentParagraphIndex);
  }
  
  // Function to speak from a specific paragraph position
  function speakFromPosition(startIndex) {
    if (startIndex >= allParagraphs.length) {
      // We've reached the end
      finishSpeaking();
      return;
    }
    
    currentParagraphIndex = startIndex;
    updateReadingDisplay();
    
    // Create utterance for current paragraph
    const enhancedText = generateEnhancedText(allParagraphs[currentParagraphIndex]);
    const utterance = new SpeechSynthesisUtterance(enhancedText);
    currentUtterance = utterance;
    
    // Apply voice settings
    applyVoiceSettings(utterance);
    
    // Set handlers
    utterance.onend = function() {
      currentUtterance = null;
      currentParagraphIndex++;
      speakFromPosition(currentParagraphIndex);
    };
    
    utterance.onerror = function(event) {
      console.error('Speech error:', event);
      currentUtterance = null;
      currentParagraphIndex++;
      speakFromPosition(currentParagraphIndex);
    };
    
    // Start speaking
    try {
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error("Speech synthesis error:", e);
      currentParagraphIndex++;
      speakFromPosition(currentParagraphIndex);
    }
  }
  
  // Function to update reading display with current paragraph highlighted
  function updateReadingDisplay() {
    const readingDisplay = document.getElementById('reading-display');
    const readText = document.getElementById('read-text');
    
    if (readingMode || readingDisplay.classList.contains('full-screen')) {
      // In reading mode, format with paragraphs
      readText.innerHTML = ''; // Clear existing content
      
      allParagraphs.forEach((p, index) => {
        const paragraphElem = document.createElement('p');
        paragraphElem.textContent = p;
        
        // Highlight current paragraph
        if (index === currentParagraphIndex) {
          paragraphElem.className = 'current-paragraph';
          paragraphElem.style.color = settings.darkMode ? '#60a5fa' : '#3b82f6';
          paragraphElem.style.fontWeight = 'bold';
        }
        
        readText.appendChild(paragraphElem);
      });
      
      // Scroll to current paragraph
      const currentParagraphElem = readText.querySelector('.current-paragraph');
      if (currentParagraphElem) {
        currentParagraphElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }
  
  // Apply voice settings to an utterance
  function applyVoiceSettings(utterance) {
    // Apply voice if available
    const voices = window.speechSynthesis.getVoices();
    const voiceSelect = document.getElementById('voice-select');
    const selectedValue = voiceSelect.value;
    
    if (selectedValue) {
      // Find matching voice by name
      const selectedVoice = voices.find(v => v.name === selectedValue);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }
    
    // Apply rate and pitch
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
  }
  
  // Finish speaking
  function finishSpeaking() {
    isPlaying = false;
    isPaused = false;
    const speakButton = document.getElementById('speak-button');
    const pauseButton = document.getElementById('pause-button');
    
    speakButton.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Play';
    pauseButton.style.display = 'none';
    
    const readingDisplay = document.getElementById('reading-display');
    readingDisplay.classList.remove('speaking');
    stopProgressTracking();
    showStatus("Finished speaking");
  }

  // Function to exit extension (minimize)
  function exitExtension() {
    // Send message to parent to collapse sidebar
    window.parent.postMessage({
      from: 'speakeasy-tts-sidebar',
      action: 'collapseExtension'
    }, '*');
  }
  
  // Initialize TTS component
  const container = document.getElementById('speakeasy-tts-container');
  container.innerHTML = `
    <div class="tts-container ${settings.darkMode ? 'dark' : 'light'}">
      <h2 class="tts-title">SpeakEasy TTS <span class="premium-badge">Premium</span></h2>
      
      <!-- Theme toggle at top right -->
      <button class="theme-toggle" title="${settings.darkMode ? 'Switch to light mode' : 'Switch to dark mode'}">
        ${settings.darkMode ? '☀️' : '🌙'}
      </button>
      
      <textarea id="input-text" placeholder="Enter or paste text to be read aloud..."></textarea>
      
      <div class="playback-controls">
        <div class="playback-progress-container">
          <span id="current-time">00:00</span>
          <div class="progress-bar-container">
            <input type="range" id="playback-progress" min="0" max="100" value="0">
          </div>
          <span id="total-time">00:00</span>
        </div>
        
        <!-- Rewind button moved to side -->
        <button id="rewind-button" class="side-button rewind" title="Rewind 15 seconds">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"></path>
          </svg>
        </button>
        
        <div class="button-row">
          <div class="main-controls">
            <button id="speak-button" class="primary-button">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              Play
            </button>
            
            <button id="pause-button" class="primary-button" style="display: none;">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
              Pause
            </button>
          </div>
          
          <div style="display: flex; gap: 8px;">
            <button id="voice-options-button" class="secondary-button">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              Voice Options
            </button>
            
            <button id="reading-mode-button" class="secondary-button">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
              Reading Mode
            </button>
            
            <button id="fullscreen-button" class="secondary-button">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
              </svg>
              Full Screen
            </button>
          </div>
        </div>
        
        <!-- Forward button moved to side -->
        <button id="forward-button" class="side-button forward" title="Forward 15 seconds">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M13 17l5-5-5-5M6 17l5-5-5-5"></path>
          </svg>
        </button>
      </div>
      
      <!-- Voice options panel - initially hidden -->
      <div id="voice-options-panel" class="panel voice-panel" style="display: none;">
        <div class="panel-header">
          <h3>Voice Settings</h3>
        </div>
        
        <div class="setting-group">
          <label>Voice</label>
          <select id="voice-select" class="full-width-input"></select>
        </div>
        
        <div class="setting-group">
          <label>Speaking Rate <span id="rate-value">1.0</span></label>
          <div class="slider-container">
            <span class="slider-label">Slow</span>
            <input type="range" id="rate-slider" min="0.5" max="2" step="0.1" value="1">
            <span class="slider-label">Fast</span>
          </div>
        </div>
        
        <div class="setting-group">
          <label>Pitch <span id="pitch-value">1.0</span></label>
          <div class="slider-container">
            <span class="slider-label">Low</span>
            <input type="range" id="pitch-slider" min="0.5" max="1.5" step="0.1" value="1">
            <span class="slider-label">High</span>
          </div>
        </div>
        
        <div class="setting-group">
          <label>Natural Speech Enhancements</label>
          <div class="checkbox-setting">
            <input type="checkbox" id="enable-smart-pauses" ${settings.enableSmartPauses ? 'checked' : ''}>
            <label for="enable-smart-pauses">Smart pauses</label>
          </div>
        </div>
      </div>
      
      <!-- Reading display -->
      <div id="reading-display" class="reading-display" style="display: none;">
        <div class="reading-header">
          <h3>Text Content</h3>
          <div class="reading-controls">
            <button id="toggle-fullscreen" class="icon-button">⛶</button>
            <button id="exit-reading-mode" class="secondary-button">Exit Reading Mode</button>
          </div>
        </div>
        <p id="read-text">Text will appear here while being read...</p>
        
        <!-- Floating controls for fullscreen mode -->
        <div class="fullscreen-controls">
          <button id="fs-rewind-button" class="secondary-button" title="Rewind 15 seconds">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"></path>
            </svg>
          </button>
          
          <button id="fs-play-button" class="primary-button">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Play
          </button>
          
          <button id="fs-pause-button" class="primary-button" style="display: none;">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
            Pause
          </button>
          
          <button id="fs-forward-button" class="secondary-button" title="Forward 15 seconds">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M13 17l5-5-5-5M6 17l5-5-5-5"></path>
            </svg>
          </button>
          
          <!-- Exit Button for fullscreen mode -->
          <button id="fs-exit-button" class="exit-button">
            Exit
          </button>
        </div>
      </div>
      
      <!-- Add the burgundy exit button in the bottom right corner of main UI -->
      <button id="main-exit-button" class="exit-button-main">
        Exit
      </button>
      
      <!-- Bottom-right fullscreen exit button that's always visible -->
      <button id="fullscreen-exit-btn" class="exit-button-main fullscreen-exit-button" style="display: none;">
        Exit
      </button>
    </div>
  `;
  
  // Check if speech synthesis is supported
  if (!window.speechSynthesis) {
    showStatus("Your browser doesn't support speech synthesis. Try Chrome, Edge, or Safari.", "error");
  }
  
  // REPLACED EVENT HANDLERS FOR CORE BUTTONS WITH DIRECT ATTRIBUTES
  document.getElementById('speak-button').setAttribute('onclick', 'return false;');
  document.getElementById('pause-button').setAttribute('onclick', 'return false;');
  
  // Immediately create direct DOM event handlers
  const speakButton = document.getElementById('speak-button');
  if (speakButton) {
    speakButton.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      console.log("Direct speak button click handler fired");
      
      if (isPlaying) {
        console.log("Stopping speech...");
        
        // First immediately update UI to provide feedback
        isPlaying = false;
        isPaused = false;
        
        // Update button state
        this.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          Play
        `;
        
        // Hide pause button
        const pauseButton = document.getElementById('pause-button');
        if (pauseButton) {
          pauseButton.style.display = 'none';
        }
        
        // Cancel speech
        try {
          window.speechSynthesis.cancel();
        } catch (e) {
          console.error("Error cancelling speech:", e);
        }
        
        // Update fullscreen buttons if present
        const fsPlayButton = document.getElementById('fs-play-button');
        const fsPauseButton = document.getElementById('fs-pause-button');
        
        if (fsPlayButton) {
          fsPlayButton.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Play
          `;
        }
        
        if (fsPauseButton) {
          fsPauseButton.style.display = 'none';
        }
        
        // Remove speaking class from reading display
        const readingDisplay = document.getElementById('reading-display');
        if (readingDisplay) {
          readingDisplay.classList.remove('speaking');
        }
        
        // Stop progress tracking
        stopProgressTracking();
        
        // Reset progress display
        updateProgressBar(0, estimatedTotalDuration);
        
        // Reset all paragraph highlights
        document.querySelectorAll('#read-text p').forEach(p => {
          p.classList.remove('current-paragraph');
          p.style.color = '';
          p.style.fontWeight = '';
        });
        
        // Show status message
        showStatus("Speech stopped");
      } else {
        console.log("Starting speech...");
        startSpeaking();
      }
      
      return false; // Prevent default behavior
    };
  }
  
  // Pause button handler - direct DOM handler
  const pauseButton = document.getElementById('pause-button');
  if (pauseButton) {
    pauseButton.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      console.log("Direct pause button click handler fired");
      
      if (isPlaying) {
        if (isPaused) {
          // Resume speaking
          isPaused = false;
          
          try {
            window.speechSynthesis.resume();
          } catch (e) {
            console.error("Error resuming speech:", e);
          }
          
          // Update button
          this.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
            Pause
          `;
          
          // Update fullscreen button
          const fsPauseButton = document.getElementById('fs-pause-button');
          if (fsPauseButton) {
            fsPauseButton.innerHTML = `
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
              Pause
            `;
          }
          
          showStatus("Resuming speech...");
        } else {
          // Pause speaking
          isPaused = true;
          
          try {
            window.speechSynthesis.pause();
          } catch (e) {
            console.error("Error pausing speech:", e);
          }
          
          // Update button
          this.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Resume
          `;
          
          // Update fullscreen button
          const fsPauseButton = document.getElementById('fs-pause-button');
          if (fsPauseButton) {
            fsPauseButton.innerHTML = `
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              Resume
            `;
          }
          
          showStatus("Speech paused");
        }
      }
      
      return false; // Prevent default behavior
    };
  }
  
  // Add other event listeners using regular addEventListener
  document.getElementById('voice-options-button').addEventListener('click', toggleVoiceOptions);
  document.getElementById('main-exit-button').addEventListener('click', exitExtension);
  document.getElementById('fullscreen-exit-btn').addEventListener('click', exitExtension);
  
  // Handle playback progress
  const progressBar = document.getElementById('playback-progress');
  progressBar.addEventListener('input', function() {
    if (!isPlaying) return;
    
    const newPosition = parseFloat(this.value);
    const newTime = (newPosition / 100) * estimatedTotalDuration;
    
    // Update display
    updateProgressBar(newTime, estimatedTotalDuration);
    
    // Calculate new start position
    const allText = allParagraphs.join(' ');
    const jumpRatio = newPosition / 100;
    
    // Find appropriate paragraph
    let totalTextLength = 0;
    let newIndex = 0;
    
    for (let i = 0; i < allParagraphs.length; i++) {
      totalTextLength += allParagraphs[i].length;
      if (totalTextLength / allText.length > jumpRatio) {
        newIndex = i;
        break;
      }
    }
    
    // Stop current speech
    window.speechSynthesis.cancel();
    
    // Reset elapsed time
    startTime = Date.now() - (newTime * 1000);
    
    // Start speaking from new position
    currentParagraphIndex = newIndex;
    speakFromPosition(currentParagraphIndex);
  });
  
  // Handle jump backward and forward buttons
  document.getElementById('rewind-button').addEventListener('click', function() {
    jumpPlayback(-15); // Jump back 15 seconds
  });
  
  document.getElementById('forward-button').addEventListener('click', function() {
    jumpPlayback(15); // Jump forward 15 seconds
  });
  
  // Handle fullscreen controls
  document.getElementById('fs-rewind-button').addEventListener('click', function() {
    jumpPlayback(-15); // Jump back 15 seconds
  });
  
  document.getElementById('fs-forward-button').addEventListener('click', function() {
    jumpPlayback(15); // Jump forward 15 seconds
  });
  
  // Handle fullscreen play/pause buttons with direct DOM 0-level handlers
  const fsPlayButton = document.getElementById('fs-play-button');
  if (fsPlayButton) {
    fsPlayButton.onclick = function() {
      // Just delegate to the main play button
      const speakButton = document.getElementById('speak-button');
      if (speakButton && speakButton.onclick) {
        speakButton.onclick(new Event('click'));
      }
      return false;
    };
  }
  
  const fsPauseButton = document.getElementById('fs-pause-button');
  if (fsPauseButton) {
    fsPauseButton.onclick = function() {
      // Just delegate to the main pause button
      const pauseButton = document.getElementById('pause-button');
      if (pauseButton && pauseButton.onclick) {
        pauseButton.onclick(new Event('click'));
      }
      return false;
    };
  }
  
  document.getElementById('fs-exit-button').addEventListener('click', function() {
    exitFullScreenCompletely();
  });
  
  // Handle checkboxes
  document.getElementById('enable-smart-pauses').addEventListener('change', function() {
    settings.enableSmartPauses = this.checked;
    saveSettings();
  });
  
  // Handle sliders
  const rateSlider = document.getElementById('rate-slider');
  const pitchSlider = document.getElementById('pitch-slider');
  const rateValue = document.getElementById('rate-value');
  const pitchValue = document.getElementById('pitch-value');
  
  rateSlider.addEventListener('input', function() {
    settings.rate = parseFloat(this.value);
    rateValue.textContent = settings.rate.toFixed(1);
    saveSettings();
  });
  
  pitchSlider.addEventListener('input', function() {
    settings.pitch = parseFloat(this.value);
    pitchValue.textContent = settings.pitch.toFixed(1);
    saveSettings();
  });
  
  // Voice select change handler
  document.getElementById('voice-select').addEventListener('change', function() {
    settings.voice = this.value;
    saveSettings();
  });
  
  // Reading mode toggle
  document.getElementById('reading-mode-button').addEventListener('click', function() {
    enterReadingMode();
  });
  
  // Full screen toggle
  document.getElementById('fullscreen-button').addEventListener('click', function() {
    toggleFullScreen();
  });
  
  // Exit reading mode button
  document.getElementById('exit-reading-mode').addEventListener('click', function() {
    exitReadingMode();
  });
  
  // Toggle fullscreen in reading mode
  document.getElementById('toggle-fullscreen').addEventListener('click', function() {
    toggleFullScreen();
  });
  
  // Function to start speaking
  function startSpeaking() {
    const text = document.getElementById('input-text').value;
    if (!text) {
      showStatus("Please enter some text to speak", "error");
      return;
    }
    
    // Check if speech synthesis is available
    if (!window.speechSynthesis) {
      showStatus("Speech synthesis is not supported in your browser", "error");
      return;
    }
    
    // Ensure we're starting fresh
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      console.error("Error cancelling speech:", e);
    }
    
    // Get paragraphs
    allParagraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
    
    // If no paragraphs detected but there is text, treat as one paragraph
    if (allParagraphs.length === 0 && text.trim().length > 0) {
      allParagraphs.push(text.trim());
    }
    
    // Auto-enter reading mode if not already in it
    if (!readingMode) {
      enterReadingMode();
    }
    
    // Update button state
    const speakButton = document.getElementById('speak-button');
    const pauseButton = document.getElementById('pause-button');
    const fsPlayButton = document.getElementById('fs-play-button');
    const fsPauseButton = document.getElementById('fs-pause-button');
    
    isPlaying = true;
    isPaused = false;
    currentParagraphIndex = 0;
    
    speakButton.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      </svg>
      Stop
    `;
    
    if (fsPlayButton) {
      fsPlayButton.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        </svg>
        Stop
      `;
    }
    
    pauseButton.style.display = 'inline-flex';
    if (fsPauseButton) {
      fsPauseButton.style.display = 'inline-flex';
    }
    
    const readingDisplay = document.getElementById('reading-display');
    
    // Show processing status
    showStatus("Processing speech...");
    
    // Calculate estimated total duration
    const totalText = allParagraphs.join(' ');
    const totalDuration = estimateSpeakingTime(totalText);
    
    // Start progress tracking
    startProgressTracking(totalDuration);
    
    // Use setTimeout to simulate processing and give UI time to update
    setTimeout(() => {
      readingDisplay.classList.add('speaking');
      speakFromPosition(0); // Start from first paragraph
    }, 300);
  }
  
  // Add fullscreen exit button to the main UI
  function addFullscreenExitButton() {
    // Check if it already exists
    if (document.getElementById('fullscreen-exit-container')) {
      return;
    }
    
    // Create the exit button container
    const exitContainer = document.createElement('div');
    exitContainer.id = 'fullscreen-exit-container';
    exitContainer.className = 'fullscreen-exit-container';
    
    // Create the exit button
    const exitButton = document.createElement('button');
    exitButton.id = 'exit-fullscreen-main';
    exitButton.className = 'icon-button';
    exitButton.title = 'Exit Full Screen';
    exitButton.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
        <path d="M4 14h6m0 0v6m0-6l-7 7m17-11h-6m0 0V4m0 6l7-7"/>
      </svg>
    `;
    exitButton.onclick = exitFullScreenCompletely;
    
    // Add button to container
    exitContainer.appendChild(exitButton);
    
    // Add to body
    document.body.appendChild(exitContainer);
  }
  
  // Function to toggle full screen
  function toggleFullScreen() {
    fullScreenMode = !fullScreenMode;
    const readingDisplay = document.getElementById('reading-display');
    
    if (fullScreenMode) {
      // Enter full screen
      readingDisplay.classList.add('full-screen');
      document.body.classList.add('fullscreen-active');
      
      // If not in reading mode, enter reading mode first
      if (!readingMode) {
        enterReadingMode(false); // Don't notify parent again
      }
      
      // Update fullscreen button icon
      document.getElementById('toggle-fullscreen').innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
          <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
        </svg>
      `;
      
      // Show the main exit button
      addFullscreenExitButton();
      const exitContainer = document.getElementById('fullscreen-exit-container');
      if (exitContainer) {
        exitContainer.classList.add('visible');
      }
      
      // Update fullscreen buttons to match main play button state
      syncFullscreenControlsState();
      
      // Notify parent
      window.parent.postMessage({
        from: 'speakeasy-tts-sidebar',
        action: 'enterFullScreen'
      }, '*');
    } else {
      // Exit full screen
      readingDisplay.classList.remove('full-screen');
      document.body.classList.remove('fullscreen-active');
      
      // Update fullscreen button icon
      document.getElementById('toggle-fullscreen').innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
        </svg>
      `;
      
      // Hide the main exit button
      const exitContainer = document.getElementById('fullscreen-exit-container');
      if (exitContainer) {
        exitContainer.classList.remove('visible');
      }
      
      // Notify parent
      window.parent.postMessage({
        from: 'speakeasy-tts-sidebar',
        action: 'exitFullScreen'
      }, '*');
    }
  }
  
  // Sync fullscreen controls with main controls
  function syncFullscreenControlsState() {
    const speakButton = document.getElementById('speak-button');
    const pauseButton = document.getElementById('pause-button');
    const fsPlayButton = document.getElementById('fs-play-button');
    const fsPauseButton = document.getElementById('fs-pause-button');
    
    if (isPlaying) {
      fsPlayButton.innerHTML = speakButton.innerHTML;
      fsPauseButton.style.display = pauseButton.style.display;
      fsPauseButton.innerHTML = pauseButton.innerHTML;
    } else {
      fsPlayButton.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Play
      `;
      fsPauseButton.style.display = 'none';
    }
  }
  
  // Function to enter reading mode
  function enterReadingMode(notifyParent = true) {
    readingMode = true;
    const readingDisplay = document.getElementById('reading-display');
    
    readingDisplay.style.display = 'block';
    document.getElementById('reading-mode-button').style.display = 'none';
    document.getElementById('exit-reading-mode').style.display = 'inline-block';
    
    // Get text from textarea and display in reading mode
    const text = document.getElementById('input-text').value;
    const readText = document.getElementById('read-text');
    
    // Format paragraphs for reading
    if (text) {
      // Split into paragraphs
      const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
      readText.innerHTML = ''; // Clear existing content
      
      if (paragraphs.length > 0) {
        paragraphs.forEach(paragraph => {
          const p = document.createElement('p');
          p.textContent = paragraph;
          readText.appendChild(p);
        });
      } else {
        // If no paragraphs, just use the text as is
        readText.textContent = text;
      }
    }
    
    // Notify parent if requested
    if (notifyParent) {
      window.parent.postMessage({
        from: 'speakeasy-tts-sidebar',
        action: 'enterReadingMode'
      }, '*');
    }
  }
  
  // Function to exit reading mode
  function exitReadingMode() {
    readingMode = false;
    fullScreenMode = false;
    
    const readingDisplay = document.getElementById('reading-display');
    readingDisplay.style.display = 'none';
    readingDisplay.classList.remove('full-screen');
    
    document.getElementById('reading-mode-button').style.display = 'inline-block';
    document.getElementById('exit-reading-mode').style.display = 'none';
    document.body.classList.remove('fullscreen-active');
    
    // Hide the main exit button
    const exitContainer = document.getElementById('fullscreen-exit-container');
    if (exitContainer) {
      exitContainer.classList.remove('visible');
    }
    
    // Notify parent
    window.parent.postMessage({
      from: 'speakeasy-tts-sidebar',
      action: 'exitReadingMode'
    }, '*');
  }
  
  // Function to exit full screen completely (back to input mode)
  function exitFullScreenCompletely() {
    // Exit full screen first
    fullScreenMode = false;
    const readingDisplay = document.getElementById('reading-display');
    readingDisplay.classList.remove('full-screen');
    document.body.classList.remove('fullscreen-active');
    
    // Hide the main exit button
    const exitContainer = document.getElementById('fullscreen-exit-container');
    if (exitContainer) {
      exitContainer.classList.remove('visible');
    }
    
    // Then exit reading mode
    readingMode = false;
    readingDisplay.style.display = 'none';
    document.getElementById('reading-mode-button').style.display = 'inline-block';
    document.getElementById('exit-reading-mode').style.display = 'none';
    
    // Reset fullscreen button icon
    document.getElementById('toggle-fullscreen').innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
      </svg>
    `;
    
    // Notify parent
    window.parent.postMessage({
      from: 'speakeasy-tts-sidebar',
      action: 'exitFullScreen'
    }, '*');
    window.parent.postMessage({
      from: 'speakeasy-tts-sidebar',
      action: 'exitReadingMode'
    }, '*');
  }
  
  // Add smart pauses to text
  function addSmartPauses(text) {
    if (!settings.enableSmartPauses) return text;
    
    let enhancedText = text;
    
    // Add different duration pauses after punctuation
    enhancedText = enhancedText.replace(/([.!?])\s+/g, '$1 \u200B \u200B \u200B '); // Long pauses for end of sentences
    enhancedText = enhancedText.replace(/([,;:])\s+/g, '$1 \u200B '); // Short pauses for commas, semicolons, colons
    
    // Add micro-pauses before transitional phrases and conjunctions
    const transitionWords = [
      'but', 'yet', 'however', 'nevertheless', 'though', 'although', 
      'therefore', 'thus', 'hence', 'consequently',
      'furthermore', 'moreover', 'additionally', 
      'alternatively', 'instead', 'rather',
      'meanwhile', 'simultaneously', 'subsequently',
      'for example', 'for instance', 'in particular',
      'in contrast', 'on the other hand', 'conversely'
    ];
    
    for (const word of transitionWords) {
      const regex = new RegExp(`\\s+(${word})\\s+`, 'gi');
      enhancedText = enhancedText.replace(regex, ' \u200B $1 ');
    }
    
    // Add pauses around parenthetical expressions
    enhancedText = enhancedText.replace(/\(([^)]+)\)/g, '\u200B ($1) \u200B');
    
    // Add pauses for quoted text
    enhancedText = enhancedText.replace(/(["'])(.*?)\1/g, '\u200B $1$2$1 \u200B');
    
    return enhancedText;
  }
  
  // Generate enhanced text with natural speech features
  function generateEnhancedText(originalText) {
    let enhancedText = originalText;
    
    // Apply enhancements
    enhancedText = addSmartPauses(enhancedText);
    
    return enhancedText;
  }
  
  // Populate voice dropdown when voices are available
  function loadVoices() {
    if (!window.speechSynthesis) {
      console.error('Speech synthesis not supported in this browser');
      return;
    }
    
    const voices = window.speechSynthesis.getVoices();
    const voiceSelect = document.getElementById('voice-select');
    
    if (voices.length > 0) {
      voiceSelect.innerHTML = '';
      
      voices.forEach((voice) => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = voice.name;
        
        // Try to select a good default voice
        if (voice.default) {
          option.selected = true;
          settings.voice = voice.name;
        }
        
        voiceSelect.appendChild(option);
      });
      
      // If no default voice was found, select the first one
      if (!settings.voice && voices.length > 0) {
        settings.voice = voices[0].name;
        if (voiceSelect.options.length > 0) {
          voiceSelect.options[0].selected = true;
        }
      } else if (settings.voice) {
        // Try to select the previously saved voice
        for (let i = 0; i < voiceSelect.options.length; i++) {
          if (voiceSelect.options[i].value === settings.voice) {
            voiceSelect.options[i].selected = true;
            break;
          }
        }
      }
    }
  }
  
  // Load voices when available
  if (window.speechSynthesis) {
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    // Try multiple times to load voices (helps with Chrome)
    setTimeout(loadVoices, 100);
    setTimeout(loadVoices, 500);
    setTimeout(loadVoices, 1000);
  }
  
  // Theme toggle handler
  document.querySelector('.theme-toggle').addEventListener('click', function() {
    settings.darkMode = !settings.darkMode;
    document.body.classList.toggle('dark', settings.darkMode);
    document.body.classList.toggle('light', !settings.darkMode);
    
    const container = document.querySelector('.tts-container');
    if (container) {
      container.classList.toggle('dark', settings.darkMode);
      container.classList.toggle('light', !settings.darkMode);
    }
    
    this.innerHTML = settings.darkMode ? '☀️' : '🌙';
    this.title = settings.darkMode ? 'Switch to light mode' : 'Switch to dark mode';
    
    // Save setting
    saveSettings();
    
    // Also notify parent to add dark mode class
    window.parent.postMessage({
      from: 'speakeasy-tts-sidebar',
      action: settings.darkMode ? 'enableDarkMode' : 'disableDarkMode'
    }, '*');
  });
  
  // Hide reading display and exit reading mode button initially
  document.getElementById('reading-display').style.display = 'none';
  document.getElementById('exit-reading-mode').style.display = 'none';
  
  // Apply initial settings
  applySettings();
  
  // Add button for emergency stop - can be triggered via browser console
  window.emergencyStop = function() {
    console.log("Emergency stop triggered");
    const speakButton = document.getElementById('speak-button');
    if (speakButton && speakButton.onclick) {
      isPlaying = true; // Force stop mode
      speakButton.onclick(new Event('click'));
    }
  };
  
  // Double-check the buttons after a delay to ensure they have onclick handlers
  setTimeout(function() {
    console.log("Checking button handlers after delay");
    
    const speakButton = document.getElementById('speak-button');
    if (speakButton && !speakButton.onclick) {
      console.log("Speak button missing onclick, adding it again");
      
      speakButton.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log("Delayed speak button click handler fired");
        
        if (isPlaying) {
          console.log("Stopping speech...");
          
          // First immediately update UI to provide feedback
          isPlaying = false;
          isPaused = false;
          
          // Update button state
          this.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Play
          `;
          
          // Hide pause button
          const pauseButton = document.getElementById('pause-button');
          if (pauseButton) {
            pauseButton.style.display = 'none';
          }
          
          // Cancel speech
          try {
            window.speechSynthesis.cancel();
          } catch (e) {
            console.error("Error cancelling speech:", e);
          }
          
          // Update fullscreen buttons if present
          const fsPlayButton = document.getElementById('fs-play-button');
          const fsPauseButton = document.getElementById('fs-pause-button');
          
          if (fsPlayButton) {
            fsPlayButton.innerHTML = `
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              Play
            `;
          }
          
          if (fsPauseButton) {
            fsPauseButton.style.display = 'none';
          }
          
          // Remove speaking class from reading display
          const readingDisplay = document.getElementById('reading-display');
          if (readingDisplay) {
            readingDisplay.classList.remove('speaking');
          }
          
          // Stop progress tracking
          stopProgressTracking();
          
          // Reset progress display
          updateProgressBar(0, estimatedTotalDuration);
          
          // Reset all paragraph highlights
          document.querySelectorAll('#read-text p').forEach(p => {
            p.classList.remove('current-paragraph');
            p.style.color = '';
            p.style.fontWeight = '';
          });
          
          // Show status message
          showStatus("Speech stopped");
        } else {
          console.log("Starting speech...");
          startSpeaking();
        }
        
        return false; // Prevent default behavior
      };
    }
    
    const pauseButton = document.getElementById('pause-button');
    if (pauseButton && !pauseButton.onclick) {
      console.log("Pause button missing onclick, adding it again");
      
      pauseButton.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log("Delayed pause button click handler fired");
        
        if (isPlaying) {
          if (isPaused) {
            // Resume speaking
            isPaused = false;
            
            try {
              window.speechSynthesis.resume();
            } catch (e) {
              console.error("Error resuming speech:", e);
            }
            
            // Update button
            this.innerHTML = `
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
              Pause
            `;
            
            // Update fullscreen button
            const fsPauseButton = document.getElementById('fs-pause-button');
            if (fsPauseButton) {
              fsPauseButton.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                  <rect x="6" y="4" width="4" height="16"></rect>
                  <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
                Pause
              `;
            }
            
            showStatus("Resuming speech...");
          } else {
            // Pause speaking
            isPaused = true;
            
            try {
              window.speechSynthesis.pause();
            } catch (e) {
              console.error("Error pausing speech:", e);
            }
            
            // Update button
            this.innerHTML = `
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              Resume
            `;
            
            // Update fullscreen button
            const fsPauseButton = document.getElementById('fs-pause-button');
            if (fsPauseButton) {
              fsPauseButton.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Resume
              `;
            }
            
            showStatus("Speech paused");
          }
        }
        
        return false; // Prevent default behavior
      };
    }
  }, 1000);
});