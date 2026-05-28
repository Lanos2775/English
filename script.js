/**
 * AetherVocab - Pure JS Offline Vocabulary learning application.
 * Modular structure with classes for language detection, parsing, deck state, audio, and UI.
 */

// ==========================================
// 1. LANGUAGE DETECTION UTILITIES
// ==========================================
class LanguageDetector {
  static VIETNAMESE_DIACRITICS = /[àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
  
  static ENGLISH_STOPWORDS = new Set([
    "the", "and", "of", "to", "a", "in", "is", "that", "it", "he", "was", "for", "on", 
    "are", "as", "with", "his", "they", "i", "at", "be", "this", "have", "from", "or", 
    "one", "had", "by", "word", "but", "not", "what", "all", "were", "we", "when", 
    "your", "can", "said", "there", "use", "an", "each", "which", "she", "do", "how", 
    "their", "if", "will", "up", "other", "about", "out", "many", "then", "them", 
    "these", "so", "some", "her", "would", "make", "like", "him", "into", "has", 
    "look", "two", "more", "write", "go", "see", "number", "no", "way", "could", 
    "people", "my", "than", "first", "water", "been", "called", "who", "am", "its", 
    "now", "find", "long", "down", "day", "did", "get", "come", "made", "may", "part"
  ]);

  /**
   * Cleans text by stripping typical punctuation, numbers, and brackets.
   */
  static cleanText(text) {
    if (!text) return "";
    return text.replace(/[•–\-\*\:\;\t]+/g, "").trim();
  }

  /**
   * Detects whether text is English ('en') or Vietnamese ('vi') or Mixed/Unknown ('mixed')
   */
  static detectLanguage(text) {
    const clean = this.cleanText(text);
    if (!clean) return "mixed";

    // 1. Match Vietnamese diacritics
    if (this.VIETNAMESE_DIACRITICS.test(clean)) {
      return "vi";
    }

    // 2. Tokenize and check stopwords & character sets
    const words = clean.toLowerCase().split(/\s+/);
    let stopWordCount = 0;
    let asciiCharCount = 0;
    
    for (const w of words) {
      if (this.ENGLISH_STOPWORDS.has(w)) {
        stopWordCount++;
      }
    }

    for (let i = 0; i < clean.length; i++) {
      if (clean.charCodeAt(i) < 128) {
        asciiCharCount++;
      }
    }

    const asciiRatio = clean.length > 0 ? asciiCharCount / clean.length : 1;

    // Check if it looks like English: high stop word count or extremely high ASCII ratio
    if (stopWordCount > 0 || asciiRatio > 0.98) {
      return "en";
    }

    // If it's pure Vietnamese but without marks (e.g. "hoc tieng anh")
    // For safety, we classify short fragments without accents or stopwords as English by default 
    // unless they contain typical Vietnamese letters like 'đ' (handled above)
    return "en";
  }

  /**
   * Computes word-level Jaccard similarity between two strings.
   * Helps detect duplicates.
   */
  static getSimilarityScore(str1, str2) {
    const getWordSet = (str) => {
      return new Set(
        str.toLowerCase()
          .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
          .split(/\s+/)
          .filter(w => w.length > 0)
      );
    };

    const set1 = getWordSet(str1);
    const set2 = getWordSet(str2);

    if (set1.size === 0 || set2.size === 0) return 0;

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }
}

// ==========================================
// 2. HEURISTIC BILINGUAL TEXT PARSER
// ==========================================
class SmartParser {
  /**
   * Main entry point to parse raw string data into a list of draft cards.
   */
  static parse(rawText, existingDeck = []) {
    if (!rawText || !rawText.trim()) return [];

    const lines = rawText.split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => {
        // Discard empty lines, punctuation-only, or typical list headers
        if (line.length === 0) return false;
        if (/^[\p{P}\s]+$/u.test(line)) return false;
        if (/^(vocabulary|word list|bài học|từ vựng|chương|unit \d+)/i.test(line)) return false;
        return true;
      });

    const parsedPairs = [];
    const inlineSeparators = /[•–\t\:\;]|\s-\s/; // separating marks

    let unmatchedBuffer = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 1. Check if line is inline split (e.g., "hard work • công việc vất vả")
      if (inlineSeparators.test(line)) {
        // Find first splitting separator
        const match = line.match(inlineSeparators);
        const sepIdx = line.indexOf(match[0]);
        const left = line.substring(0, sepIdx).trim();
        const right = line.substring(sepIdx + match[0].length).trim();

        if (left && right) {
          const leftLang = LanguageDetector.detectLanguage(left);
          const rightLang = LanguageDetector.detectLanguage(right);

          let english = left;
          let vietnamese = right;

          if (leftLang === "vi" && rightLang === "en") {
            english = right;
            vietnamese = left;
          }

          parsedPairs.push({
            english: LanguageDetector.cleanText(english),
            vietnamese: LanguageDetector.cleanText(vietnamese),
            confidence: "high"
          });
          continue;
        }
      }

      // 2. If it's a single line, push to proximity buffer
      unmatchedBuffer.push({
        text: LanguageDetector.cleanText(line),
        lang: LanguageDetector.detectLanguage(line)
      });
    }

    // 3. Process the proximity buffer to match lines
    let bIdx = 0;
    while (bIdx < unmatchedBuffer.length) {
      const current = unmatchedBuffer[bIdx];

      // Try to find the next item of opposite language close by (up to 3 indices away)
      let matched = false;
      for (let lookAhead = 1; lookAhead <= 3; lookAhead++) {
        const nextIdx = bIdx + lookAhead;
        if (nextIdx >= unmatchedBuffer.length) break;

        const candidate = unmatchedBuffer[nextIdx];
        if (candidate.lang !== current.lang && candidate.lang !== "mixed") {
          // Found a match!
          let english = current.text;
          let vietnamese = candidate.text;

          if (current.lang === "vi") {
            english = candidate.text;
            vietnamese = current.text;
          }

          parsedPairs.push({
            english,
            vietnamese,
            confidence: lookAhead === 1 ? "high" : "medium"
          });

          // Remove both from buffer
          unmatchedBuffer.splice(nextIdx, 1);
          matched = true;
          break;
        }
      }

      if (!matched) {
        // No match found in proximity. Pair with empty and mark Low confidence.
        let english = "";
        let vietnamese = "";

        if (current.lang === "vi") {
          vietnamese = current.text;
        } else {
          english = current.text;
        }

        parsedPairs.push({
          english,
          vietnamese,
          confidence: "low"
        });
      }

      bIdx++;
    }

    // 4. Run Duplicate & Similarity Detection
    const finalCards = parsedPairs.map((pair, index) => {
      const card = {
        id: `draft_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
        english: pair.english || "",
        vietnamese: pair.vietnamese || "",
        status: "learning",
        confidence: pair.confidence,
        createdAt: Date.now(),
        lastReviewed: 0,
        reviewCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        duplicateWarning: false,
        duplicateCardId: null
      };

      // Check similarity with existing deck
      for (const existing of existingDeck) {
        if (card.english && existing.english) {
          const sim = LanguageDetector.getSimilarityScore(card.english, existing.english);
          if (sim > 0.8) {
            card.duplicateWarning = true;
            card.duplicateCardId = existing.id;
            card.confidence = "low"; // Degrade confidence if it looks duplicate
            break;
          }
        }
      }

      return card;
    });

    return finalCards;
  }
}

// ==========================================
// 3. DECK & STUDY STATE CONTROLLER
// ==========================================
class DeckController {
  constructor() {
    this.cards = [];
    this.streak = 0;
    this.lastReviewedDate = null;
    this.failedQueue = []; // Holds card IDs recently failed to repeat soon
    this.sessionReviews = 0;
    this.sessionCorrect = 0;
    this.sessionTimer = 0; // seconds
    this.timerInterval = null;

    this.loadFromStorage();
  }

  loadFromStorage() {
    try {
      const storedCards = localStorage.getItem("aethervocab_cards");
      if (storedCards) {
        this.cards = JSON.parse(storedCards);
      } else {
        this.cards = [];
      }

      this.streak = parseInt(localStorage.getItem("aethervocab_streak")) || 0;
      this.lastReviewedDate = localStorage.getItem("aethervocab_last_review_date");
    } catch (e) {
      console.error("Corrupted localStorage. Resetting data to safe state.", e);
      this.cards = [];
      this.streak = 0;
      this.lastReviewedDate = null;
      this.saveToStorage();
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem("aethervocab_cards", JSON.stringify(this.cards));
      localStorage.setItem("aethervocab_streak", this.streak.toString());
      if (this.lastReviewedDate) {
        localStorage.setItem("aethervocab_last_review_date", this.lastReviewedDate);
      }
    } catch (e) {
      alert("Lỗi lưu trữ LocalStorage: Có thể do bộ nhớ đầy.");
    }
  }

  importCards(newCards) {
    // Avoid importing direct duplicates
    const addedIds = new Set();
    const importedList = [];

    for (const card of newCards) {
      // Clean draft ID to make it standard
      card.id = `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      delete card.duplicateWarning;
      delete card.duplicateCardId;

      // Double check that we don't import empty text
      if (!card.english.trim() && !card.vietnamese.trim()) continue;

      importedList.push(card);
    }

    this.cards = [...this.cards, ...importedList];
    this.saveToStorage();
    return importedList.length;
  }

  deleteCard(id) {
    this.cards = this.cards.filter(c => c.id !== id);
    this.failedQueue = this.failedQueue.filter(fid => fid !== id);
    this.saveToStorage();
  }

  clearDeck() {
    this.cards = [];
    this.failedQueue = [];
    this.saveToStorage();
  }

  /**
   * Weighted random algorithm:
   * - weight difficult = 4
   * - weight learning = 2
   * - weight known = 0.5
   * - failed queue has a 40% priority chance to reappear in sequence
   */
  getNextCard(studyMode, statusFilter, searchQuery = "") {
    let eligible = this.cards;

    // Apply status filter
    if (statusFilter !== "all") {
      eligible = eligible.filter(c => c.status === statusFilter);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      eligible = eligible.filter(c => 
        c.english.toLowerCase().includes(q) || 
        c.vietnamese.toLowerCase().includes(q)
      );
    }

    if (eligible.length === 0) return null;

    // 40% probability to show a card from the failed queue if it exists and matches criteria
    if (this.failedQueue.length > 0 && Math.random() < 0.4) {
      const targetId = this.failedQueue[0];
      const foundCard = eligible.find(c => c.id === targetId);
      if (foundCard) {
        // Shift it to the back of queue to rotate, but study it now
        this.failedQueue.push(this.failedQueue.shift());
        return foundCard;
      } else {
        // Card was deleted or status filter no longer matches. Remove from queue.
        this.failedQueue = this.failedQueue.filter(id => id !== targetId);
      }
    }

    // Weighted random selection
    const weights = eligible.map(card => {
      if (card.status === "difficult") return 4.0;
      if (card.status === "learning") return 2.0;
      return 0.5; // known
    });

    const sumWeights = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * sumWeights;

    for (let i = 0; i < eligible.length; i++) {
      rand -= weights[i];
      if (rand <= 0) {
        return eligible[i];
      }
    }

    return eligible[eligible.length - 1];
  }

  updateCardReview(id, isCorrect, newStatus) {
    const card = this.cards.find(c => c.id === id);
    if (!card) return;

    card.reviewCount++;
    card.lastReviewed = Date.now();
    card.status = newStatus;

    if (isCorrect) {
      card.correctCount++;
      // Remove from failed queue if it was in there
      this.failedQueue = this.failedQueue.filter(fid => fid !== id);
      this.sessionCorrect++;
    } else {
      card.incorrectCount++;
      // Add to failed queue if not already there
      if (!this.failedQueue.includes(id)) {
        this.failedQueue.push(id);
      }
    }

    this.sessionReviews++;
    this.updateStreak();
    this.saveToStorage();
  }

  updateStreak() {
    const today = new Date().toISOString().split("T")[0];
    
    if (this.lastReviewedDate === today) {
      // Already reviewed today, keep streak
      return;
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    if (this.lastReviewedDate === yesterday) {
      // Reviewed yesterday, increment streak
      this.streak++;
    } else if (!this.lastReviewedDate) {
      // First review ever
      this.streak = 1;
    } else {
      // Streak broken, reset to 1
      this.streak = 1;
    }

    this.lastReviewedDate = today;
  }

  startSessionTimer() {
    this.sessionTimer = 0;
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.sessionTimer++;
      this.onTimerUpdate(this.getFormattedTime());
    }, 1000);
  }

  getFormattedTime() {
    const hrs = String(Math.floor(this.sessionTimer / 3600)).padStart(2, '0');
    const mins = String(Math.floor((this.sessionTimer % 3600) / 60)).padStart(2, '0');
    const secs = String(this.sessionTimer % 60).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  }

  getStats() {
    const total = this.cards.length;
    const known = this.cards.filter(c => c.status === "known").length;
    const learning = this.cards.filter(c => c.status === "learning").length;
    const difficult = this.cards.filter(c => c.status === "difficult").length;
    const progressPercent = total > 0 ? Math.round((known / total) * 100) : 0;

    return { total, known, learning, difficult, progressPercent };
  }
}

// ==========================================
// 4. TTS SPEECH SYNTHESIS CONTROLLER
// ==========================================
class TTSController {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voice = null;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.autoplayDelay = 3; // seconds
    this.autoplayTimer = null;
    this.isAutoplayActive = false;

    this.initVoices();
    if (this.synth && this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.initVoices();
    }
  }

  initVoices() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    // Default to first English voice found, otherwise fallback
    this.voice = voices.find(v => v.lang.startsWith("en")) || voices[0] || null;
    if (this.onVoicesLoaded) {
      this.onVoicesLoaded(voices);
    }
  }

  setVoice(voiceName) {
    if (!this.synth) return;
    this.voice = this.synth.getVoices().find(v => v.name === voiceName) || this.voice;
  }

  speak(text, lang = "en", callback) {
    if (!this.synth || !text) {
      if (callback) callback();
      return;
    }

    this.synth.cancel(); // Stop active speaking

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = this.voice;
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    
    if (lang === "vi") {
      // Find Vietnamese voice if speaking Vietnamese translation
      const viVoice = this.synth.getVoices().find(v => v.lang.startsWith("vi"));
      if (viVoice) utterance.voice = viVoice;
      utterance.lang = "vi-VN";
    } else {
      utterance.lang = "en-US";
    }

    utterance.onend = () => {
      if (callback) callback();
    };
    utterance.onerror = () => {
      if (callback) callback();
    };

    this.synth.speak(utterance);
  }
}


// ==========================================
// 4.5. FUZZY MATCHER & QUIZ CONTROLLER
// ==========================================
class FuzzyMatcher {
  static normalize(str) {
    if (!str) return "";
    return str.toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()!?•–]/g, '');
  }

  static match(userAns, correctAns) {
    return this.normalize(userAns) === this.normalize(correctAns);
  }
}

class QuizController {
  constructor(deckController, ttsController) {
    this.deck = deckController;
    this.tts = ttsController;
    
    this.mode = "mc-en-vi";
    this.scope = "all";
    this.limit = 10;
    
    this.questions = [];
    this.currentIndex = 0;
    this.score = 0;
    this.streak = 0;
    this.maxSessionStreak = 0;
    
    this.startTime = null;
    this.questionStartTime = null;
    this.answersLog = [];
    this.speedChallengeTimer = null;
    this.speedChallengeRemaining = 60; // seconds

    this.stats = {
      totalAnswers: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      bestStreak: 0,
      averageResponseTime: 0,
      mistakeHistory: []
    };

    this.loadStats();
  }

  loadStats() {
    try {
      const stored = localStorage.getItem("aethervocab_quiz_stats");
      if (stored) {
        this.stats = JSON.parse(stored);
      }
    } catch (e) {
      console.error("Corrupted quiz stats. Resetting.", e);
      this.saveStats();
    }
  }

  saveStats() {
    localStorage.setItem("aethervocab_quiz_stats", JSON.stringify(this.stats));
  }

  clearStats() {
    this.stats = {
      totalAnswers: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      bestStreak: 0,
      averageResponseTime: 0,
      mistakeHistory: []
    };
    this.saveStats();
  }

  generateQuestions() {
    let pool = this.deck.cards;

    if (this.scope === "difficult") {
      pool = pool.filter(c => c.status === "difficult");
    } else if (this.scope === "mistakes") {
      pool = pool.filter(c => this.stats.mistakeHistory.includes(c.id));
    }

    if (pool.length === 0) return false;

    // Shuffle pool
    const shuffledPool = [...pool].sort(() => Math.random() - 0.5);

    // Limit count
    let count = 0;
    if (this.mode === "speed-challenge") {
      // Speed run has unlimited questions in 60s
      count = shuffledPool.length;
    } else {
      count = this.limit === "all" ? shuffledPool.length : Math.min(parseInt(this.limit), shuffledPool.length);
    }
    const selected = shuffledPool.slice(0, count);

    this.questions = selected.map(card => {
      const isListening = this.mode.startsWith("listening");
      const isMc = this.mode.startsWith("mc") || this.mode === "listening-mc";
      
      // Determine prompt and correct answer
      let prompt = "";
      let correctAnswer = "";
      let lang = "en"; // language of correct answer

      if (this.mode === "mc-en-vi") {
        prompt = card.english;
        correctAnswer = card.vietnamese;
        lang = "vi";
      } else if (this.mode === "mc-vi-en") {
        prompt = card.vietnamese;
        correctAnswer = card.english;
        lang = "en";
      } else if (this.mode === "typing-en-vi") {
        prompt = card.english;
        correctAnswer = card.vietnamese;
        lang = "vi";
      } else if (this.mode === "typing-vi-en") {
        prompt = card.vietnamese;
        correctAnswer = card.english;
        lang = "en";
      } else if (isListening) {
        prompt = card.english; 
        correctAnswer = card.vietnamese;
        lang = "vi";
      } else {
        // Speed challenge defaults to Eng -> Vi
        prompt = card.english;
        correctAnswer = card.vietnamese;
        lang = "vi";
      }

      // Generate Multiple Choice distractors if needed
      let choices = [];
      if (isMc) {
        const correctVal = correctAnswer;
        
        // Find other card translations for distractors
        const filterKey = lang === "en" ? "english" : "vietnamese";
        const allDistractors = this.deck.cards
          .filter(c => c.id !== card.id && c[filterKey])
          .map(c => c[filterKey]);

        // Get unique distractors
        const uniqueDistractors = Array.from(new Set(allDistractors));

        // Shuffle distractors and pick 3
        uniqueDistractors.sort(() => Math.random() - 0.5);
        const selectedDistractors = uniqueDistractors.slice(0, 3);

        // Fill up to 3 distractors with fake ones if deck has too few words
        while (selectedDistractors.length < 3) {
          selectedDistractors.push(`Distractor Option ${selectedDistractors.length + 1}`);
        }

        // Add correct option and shuffle options
        choices = [correctVal, ...selectedDistractors].sort(() => Math.random() - 0.5);
      }

      return {
        card,
        prompt,
        correctAnswer,
        choices,
        lang
      };
    });

    this.currentIndex = 0;
    this.score = 0;
    this.streak = 0;
    this.maxSessionStreak = 0;
    this.answersLog = [];
    this.startTime = Date.now();
    this.questionStartTime = Date.now();

    return true;
  }

  submitAnswer(userAnswer) {
    const q = this.questions[this.currentIndex];
    const isMc = this.mode.startsWith("mc") || this.mode === "listening-mc";
    
    let isCorrect = false;

    if (isMc) {
      isCorrect = userAnswer === q.correctAnswer;
    } else {
      isCorrect = FuzzyMatcher.match(userAnswer, q.correctAnswer);
    }

    const respTime = (Date.now() - this.questionStartTime) / 1000; // in seconds

    // Update session metrics
    if (isCorrect) {
      this.score++;
      this.streak++;
      if (this.streak > this.maxSessionStreak) {
        this.maxSessionStreak = this.streak;
      }
    } else {
      this.streak = 0;
    }

    // Record logs
    this.answersLog.push({
      cardId: q.card.id,
      prompt: q.prompt,
      correct: isCorrect,
      userAns: userAnswer || "(Empty)",
      correctAns: q.correctAnswer,
      responseTime: respTime
    });

    // Update global persistent statistics
    this.stats.totalAnswers++;
    if (isCorrect) {
      this.stats.correctAnswers++;
    } else {
      this.stats.incorrectAnswers++;
      // Add card ID to mistakes history if not already there
      if (!this.stats.mistakeHistory.includes(q.card.id)) {
        this.stats.mistakeHistory.push(q.card.id);
      }
    }

    // Update best streak
    if (this.streak > this.stats.bestStreak) {
      this.stats.bestStreak = this.streak;
    }

    // Recalculate average response time
    const count = this.stats.totalAnswers;
    const avg = this.stats.averageResponseTime;
    this.stats.averageResponseTime = ((avg * (count - 1)) + respTime) / count;

    this.saveStats();
    return { isCorrect, correctAnswer: q.correctAnswer };
  }

  nextQuestion() {
    this.currentIndex++;
    this.questionStartTime = Date.now();
    
    if (this.mode === "speed-challenge" && this.currentIndex >= this.questions.length) {
      // Loop questions for Speed Challenge if user runs through all words
      const shuffledPool = [...this.questions].sort(() => Math.random() - 0.5);
      this.questions = [...this.questions, ...shuffledPool];
    }
    
    return this.currentIndex < this.questions.length;
  }

  getAccuracy() {
    const total = this.answersLog.length;
    if (total === 0) return 0;
    return Math.round((this.score / total) * 100);
  }

  getAverageResponseTime() {
    if (this.answersLog.length === 0) return 0;
    const sum = this.answersLog.reduce((acc, log) => acc + log.responseTime, 0);
    return (sum / this.answersLog.length).toFixed(1);
  }

  getMistakes() {
    return this.answersLog.filter(log => !log.correct).map(log => {
      const card = this.deck.cards.find(c => c.id === log.cardId);
      return {
        card,
        userAns: log.userAns,
        correctAns: log.correctAns
      };
    }).filter(m => m.card !== undefined);
  }
}

// ==========================================
// 5. MASTER UI CONTROLLER
// ==========================================
class UIController {
  constructor() {
    this.deck = new DeckController();
    this.tts = new TTSController();

    this.activeCard = null;
    this.isCardFlipped = false;
    this.currentFilter = "all";
    this.currentSearch = "";
    
    // Draft cards parsed and waiting for import
    this.draftCards = [];

    // Touch/Mouse swipe coordinates
    this.swipeStartX = 0;
    this.swipeStartY = 0;
    this.isSwiping = false;

    this.bindDOM();
    this.init();
  }

  bindDOM() {
    // Buttons
    this.themeToggleBtn = document.getElementById("theme-toggle-btn");
    this.btnOpenParser = document.getElementById("btn-open-parser");
    this.btnExportData = document.getElementById("btn-export-data");
    this.btnImportFile = document.getElementById("btn-import-file");
    this.btnClearDeck = document.getElementById("btn-clear-deck");
    this.fileInputHidden = document.getElementById("file-input-hidden");
    
    // Tabs switcher DOM
    this.tabFlashcards = document.getElementById("tab-flashcards");
    this.tabQuiz = document.getElementById("tab-quiz");
    this.flashcardsKeyboardLegend = document.getElementById("flashcards-keyboard-legend");

    // Quiz container & panels
    this.quizContainer = document.getElementById("quiz-container");
    this.quizSetupScreen = document.getElementById("quiz-setup-screen");
    this.quizActiveScreen = document.getElementById("quiz-active-screen");
    this.quizResultsScreen = document.getElementById("quiz-results-screen");

    // Quiz config inputs
    this.selectQuizMode = document.getElementById("select-quiz-mode");
    this.selectQuizScope = document.getElementById("select-quiz-scope");
    this.selectQuizLimit = document.getElementById("select-quiz-limit");
    this.btnStartQuiz = document.getElementById("btn-start-quiz");
    
    // Quiz stats dashboard
    this.quizStatTotal = document.getElementById("quiz-stat-total");
    this.quizStatAccuracy = document.getElementById("quiz-stat-accuracy");
    this.quizStatStreak = document.getElementById("quiz-stat-streak");
    this.quizStatTime = document.getElementById("quiz-stat-time");
    this.btnClearQuizHistory = document.getElementById("btn-clear-quiz-history");
    this.btnQuizReviewMistakes = document.getElementById("btn-quiz-review-mistakes");

    // Quiz active screen controls
    this.quizProgressText = document.getElementById("quiz-progress-text");
    this.quizProgressBarFill = document.getElementById("quiz-progress-bar-fill");
    this.quizTimerText = document.getElementById("quiz-timer-text");
    this.quizLiveStreak = document.getElementById("quiz-live-streak");
    this.quizQuestionText = document.getElementById("quiz-question-text");
    this.btnQuizListeningSpeak = document.getElementById("btn-quiz-listening-speak");
    this.quizChoiceGrid = document.getElementById("quiz-choice-grid");
    this.quizTypingBlock = document.getElementById("quiz-typing-block");
    this.quizTypingInput = document.getElementById("quiz-typing-input");
    this.btnQuizTypingSubmit = document.getElementById("btn-quiz-typing-submit");
    this.quizFeedbackBlock = document.getElementById("quiz-feedback-block");
    this.quizFeedbackTitle = document.getElementById("quiz-feedback-title");
    this.quizFeedbackUserAns = document.getElementById("quiz-feedback-user-ans");
    this.quizFeedbackCorrectAns = document.getElementById("quiz-feedback-correct-ans");
    this.btnQuizFeedbackNext = document.getElementById("btn-quiz-feedback-next");
    this.btnQuizAbort = document.getElementById("btn-quiz-abort");

    // Quiz results screen controls
    this.quizResPercent = document.getElementById("quiz-res-percent");
    this.quizResCorrect = document.getElementById("quiz-res-correct");
    this.quizResStreak = document.getElementById("quiz-res-streak");
    this.quizResTime = document.getElementById("quiz-res-time");
    this.quizResMistakesSection = document.getElementById("quiz-res-mistakes-section");
    this.quizResMistakesCount = document.getElementById("quiz-res-mistakes-count");
    this.quizResMistakesList = document.getElementById("quiz-res-mistakes-list");
    this.btnQuizResMistakesReview = document.getElementById("btn-quiz-res-mistakes-review");
    this.btnQuizResRestart = document.getElementById("btn-quiz-res-restart");
    this.btnQuizResExit = document.getElementById("btn-quiz-res-exit");

    // Filter controls
    this.searchBox = document.getElementById("deck-search");
    this.filterAll = document.getElementById("filter-all");
    this.filterLearning = document.getElementById("filter-learning");
    this.filterDifficult = document.getElementById("filter-difficult");
    this.sortAlpha = document.getElementById("sort-alpha");
    this.actionShuffle = document.getElementById("action-shuffle");

    // Modal UI
    this.parserModal = document.getElementById("parser-modal");
    this.btnCloseParser = document.getElementById("btn-close-parser");
    this.rawImportTextarea = document.getElementById("raw-import-textarea");
    this.btnClearRaw = document.getElementById("btn-clear-raw");
    this.btnExecuteParse = document.getElementById("btn-execute-parse");
    
    this.previewBlock = document.getElementById("parser-preview-block");
    this.previewTableBody = document.getElementById("preview-table-body");
    this.previewCount = document.getElementById("preview-count");
    this.previewSearchInput = document.getElementById("preview-search-input");
    this.previewConfidenceFilter = document.getElementById("preview-confidence-filter");
    this.btnAcceptImport = document.getElementById("btn-accept-import");
    this.btnReParse = document.getElementById("btn-re-parse");
    this.checkSelectAllPreview = document.getElementById("check-select-all-preview");
    this.btnPreviewBulkDelete = document.getElementById("btn-preview-bulk-delete");
    this.duplicateWarningBanner = document.getElementById("duplicate-warning-banner");
    this.duplicateWarningText = document.getElementById("duplicate-warning-text");
    this.btnResolveDuplicates = document.getElementById("btn-resolve-duplicates");

    // Export Modal
    this.exportModal = document.getElementById("export-modal");
    this.btnCloseExport = document.getElementById("btn-close-export");
    this.btnExportJson = document.getElementById("btn-export-json");
    this.btnExportCsv = document.getElementById("btn-export-csv");
    this.btnExportTxt = document.getElementById("btn-export-txt");
    this.btnExportStats = document.getElementById("btn-export-stats");
    this.exportTextareaCopy = document.getElementById("export-textarea-copy");
    this.btnCopyClipboardAll = document.getElementById("btn-copy-clipboard-all");

    // Workspace & Session controls
    this.selectStudyMode = document.getElementById("select-study-mode");
    this.btnToggleVoiceSettings = document.getElementById("btn-toggle-voice-settings");
    this.voiceSettingsDropdown = document.getElementById("voice-settings-dropdown");
    this.selectTtsVoice = document.getElementById("select-tts-voice");
    this.rangeTtsRate = document.getElementById("range-tts-rate");
    this.rangeTtsPitch = document.getElementById("range-tts-pitch");
    this.rangeAutoplayDelay = document.getElementById("range-autoplay-delay");
    
    this.ttsRateVal = document.getElementById("tts-rate-val");
    this.ttsPitchVal = document.getElementById("tts-pitch-val");
    this.autoplayDelayVal = document.getElementById("autoplay-delay-val");

    // Study Panel
    this.deckEmptyState = document.getElementById("deck-empty-state");
    this.btnEmptyStateParse = document.getElementById("btn-empty-state-parse");
    this.flashcardContainer = document.getElementById("flashcard-container");
    this.flashcardElement = document.getElementById("flashcard-element");
    
    this.cardTextFront = document.getElementById("card-text-front");
    this.cardTextBack = document.getElementById("card-text-back");
    this.cardStatusIndicatorFront = document.getElementById("card-status-indicator-front");
    this.cardStatusIndicatorBack = document.getElementById("card-status-indicator-back");
    this.btnSpeakFront = document.getElementById("btn-speak-front");
    this.btnSpeakBack = document.getElementById("btn-speak-back");

    // Actions & controls
    this.btnPrevCard = document.getElementById("btn-prev-card");
    this.btnNextCard = document.getElementById("btn-next-card");
    this.currentCardIndexIndicator = document.getElementById("current-card-index-indicator");
    this.btnMarkDifficult = document.getElementById("btn-mark-difficult");
    this.btnMarkLearning = document.getElementById("btn-mark-learning");
    this.btnMarkKnown = document.getElementById("btn-mark-known");
    
    this.btnAutoplayToggle = document.getElementById("btn-autoplay-toggle");
    this.iconPlay = this.btnAutoplayToggle.querySelector(".icon-play");
    this.iconPause = this.btnAutoplayToggle.querySelector(".icon-pause");

    // Dashboard Stats elements
    this.streakCounter = document.getElementById("streak-counter");
    this.statTotal = document.getElementById("stat-total");
    this.statKnown = document.getElementById("stat-known");
    this.statLearning = document.getElementById("stat-learning");
    this.statDifficult = document.getElementById("stat-difficult");
    this.progressPercent = document.getElementById("progress-percent");
    this.progressBarFill = document.getElementById("progress-bar-fill");
    this.studyTimer = document.getElementById("study-timer");
  }

  init() {
    // 1. Setup session timer
    this.deck.onTimerUpdate = (formattedTime) => {
      this.studyTimer.innerText = formattedTime;
    };
    this.deck.startSessionTimer();

    // 1.5. Setup quiz controller
    this.quiz = new QuizController(this.deck, this.tts);

    // 2. Setup voices callbacks
    this.tts.onVoicesLoaded = (voices) => {
      this.selectTtsVoice.innerHTML = "";
      voices.forEach(voice => {
        const option = document.createElement("option");
        option.value = voice.name;
        option.innerText = `${voice.name} (${voice.lang})`;
        if (voice.name === this.tts.voice?.name) {
          option.selected = true;
        }
        this.selectTtsVoice.appendChild(option);
      });
    };

    // 3. Setup event listeners
    this.setupEventListeners();

    // 4. Init theme
    const savedTheme = localStorage.getItem("aethervocab_theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);

    // 5. Initial draw
    this.renderStats();
    this.loadNewCard();
    this.renderQuizStats();
  }

  setupEventListeners() {
    // Theme toggle
    this.themeToggleBtn.addEventListener("click", () => this.toggleTheme());

    // Search and filters
    this.searchBox.addEventListener("input", (e) => {
      this.currentSearch = e.target.value;
      this.loadNewCard();
    });

    this.filterAll.addEventListener("click", () => this.setFilter("all"));
    this.filterLearning.addEventListener("click", () => this.setFilter("learning"));
    this.filterDifficult.addEventListener("click", () => this.setFilter("difficult"));

    // Sorting & shuffling
    this.sortAlpha.addEventListener("click", () => {
      this.deck.cards.sort((a, b) => a.english.localeCompare(b.english));
      this.deck.saveToStorage();
      this.renderStats();
      this.loadNewCard();
      alert("Đã sắp xếp thẻ theo thứ tự Alphabet.");
    });
    this.actionShuffle.addEventListener("click", () => {
      // Simple shuffle in place
      for (let i = this.deck.cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.deck.cards[i], this.deck.cards[j]] = [this.deck.cards[j], this.deck.cards[i]];
      }
      this.deck.saveToStorage();
      this.loadNewCard();
      this.triggerCardShuffleEffect();
    });

    // Opening modals
    this.btnOpenParser.addEventListener("click", () => this.openParserModal());
    this.btnEmptyStateParse.addEventListener("click", () => this.openParserModal());
    this.btnCloseParser.addEventListener("click", () => this.closeParserModal());

    this.btnClearRaw.addEventListener("click", () => {
      this.rawImportTextarea.value = "";
    });

    this.btnExecuteParse.addEventListener("click", () => this.executeParse());

    // Import confirmation
    this.btnAcceptImport.addEventListener("click", () => this.acceptImport());
    this.btnReParse.addEventListener("click", () => {
      this.previewBlock.classList.add("hidden");
      this.rawImportTextarea.focus();
    });

    // Export Modal Controls
    this.btnExportData.addEventListener("click", () => this.openExportModal());
    this.btnCloseExport.addEventListener("click", () => this.closeExportModal());
    this.btnExportJson.addEventListener("click", () => this.exportDeck("json"));
    this.btnExportCsv.addEventListener("click", () => this.exportDeck("csv"));
    this.btnExportTxt.addEventListener("click", () => this.exportDeck("txt"));
    this.btnExportStats.addEventListener("click", () => this.exportStatsReport());
    this.btnCopyClipboardAll.addEventListener("click", () => this.copyExportToClipboard());

    // File Import trigger
    this.btnImportFile.addEventListener("click", () => this.fileInputHidden.click());
    this.fileInputHidden.addEventListener("change", (e) => this.handleFileImport(e));

    // Clear Deck
    this.btnClearDeck.addEventListener("click", () => {
      if (confirm("Bạn có chắc chắn muốn XÓA TOÀN BỘ thẻ học trong bộ nhớ không? Hành động này không thể hoàn tác.")) {
        this.deck.clearDeck();
        this.renderStats();
        this.loadNewCard();
      }
    });

    // Voice popover
    this.btnToggleVoiceSettings.addEventListener("click", (e) => {
      e.stopPropagation();
      this.voiceSettingsDropdown.classList.toggle("hidden");
    });
    document.addEventListener("click", (e) => {
      if (!this.voiceSettingsDropdown.classList.contains("hidden") && 
          !this.voiceSettingsDropdown.contains(e.target) && 
          e.target !== this.btnToggleVoiceSettings) {
        this.voiceSettingsDropdown.classList.add("hidden");
      }
    });

    // Voice controls values sync
    this.selectTtsVoice.addEventListener("change", (e) => this.tts.setVoice(e.target.value));
    this.rangeTtsRate.addEventListener("input", (e) => {
      this.tts.rate = parseFloat(e.target.value);
      this.ttsRateVal.innerText = e.target.value;
    });
    this.rangeTtsPitch.addEventListener("input", (e) => {
      this.tts.pitch = parseFloat(e.target.value);
      this.ttsPitchVal.innerText = e.target.value;
    });
    this.rangeAutoplayDelay.addEventListener("input", (e) => {
      this.tts.autoplayDelay = parseInt(e.target.value);
      this.autoplayDelayVal.innerText = e.target.value;
    });

    // Flashcard Flip & Swipe
    this.flashcardElement.addEventListener("click", (e) => {
      // Don't flip if clicking inner buttons
      if (e.target.closest("button")) return;
      this.flipCard();
    });

    // Swipe Event listeners (Mouse and Touch)
    this.setupSwipeHandlers();

    // Voice speakers inside card
    this.btnSpeakFront.addEventListener("click", (e) => {
      e.stopPropagation();
      this.speakActiveFace("front");
    });
    this.btnSpeakBack.addEventListener("click", (e) => {
      e.stopPropagation();
      this.speakActiveFace("back");
    });

    // Navigation and status markers
    this.btnPrevCard.addEventListener("click", () => this.navigateDeck(-1));
    this.btnNextCard.addEventListener("click", () => this.navigateDeck(1));

    this.btnMarkDifficult.addEventListener("click", () => this.markCardStatus("difficult"));
    this.btnMarkLearning.addEventListener("click", () => this.markCardStatus("learning"));
    this.btnMarkKnown.addEventListener("click", () => this.markCardStatus("known"));

    this.btnAutoplayToggle.addEventListener("click", () => this.toggleAutoplay());

    // Preview Table Bulk Actions
    this.checkSelectAllPreview.addEventListener("change", (e) => {
      const checkboxes = this.previewTableBody.querySelectorAll("input[type='checkbox']");
      checkboxes.forEach(c => c.checked = e.target.checked);
    });

    this.btnPreviewBulkDelete.addEventListener("click", () => this.handleBulkDelete());

    // Search and filter inside preview editor
    this.previewSearchInput.addEventListener("input", () => this.renderPreviewTable());
    this.previewConfidenceFilter.addEventListener("change", () => this.renderPreviewTable());

    this.btnResolveDuplicates.addEventListener("click", () => this.resolveDuplicatesMerge());

    // Tabs Toggles
    this.tabFlashcards.addEventListener("click", () => this.switchTab("flashcards"));
    this.tabQuiz.addEventListener("click", () => this.switchTab("quiz"));

    // Quiz Setup Event Listeners
    this.btnStartQuiz.addEventListener("click", () => this.startQuiz());
    this.btnClearQuizHistory.addEventListener("click", () => {
      if (confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử và thống kê Quiz không?")) {
        this.quiz.clearStats();
        this.renderQuizStats();
      }
    });
    this.btnQuizReviewMistakes.addEventListener("click", () => {
      this.selectQuizScope.value = "mistakes";
      this.startQuiz();
    });

    // Quiz Active Screen Event Listeners
    this.btnQuizListeningSpeak.addEventListener("click", () => {
      const q = this.quiz.questions[this.quiz.currentIndex];
      if (q) this.tts.speak(q.prompt, "en");
    });
    this.btnQuizTypingSubmit.addEventListener("click", () => {
      const val = this.quizTypingInput.value.trim();
      this.submitQuizAnswer(val);
    });
    this.quizTypingInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.btnQuizTypingSubmit.click();
      }
    });
    this.btnQuizFeedbackNext.addEventListener("click", () => this.nextQuizQuestion());
    this.btnQuizAbort.addEventListener("click", () => {
      if (confirm("Bạn muốn hủy phiên kiểm tra hiện tại? Điểm số phiên này sẽ không được lưu.")) {
        this.stopSpeedChallengeTimer();
        this.switchTab("quiz");
      }
    });

    // Option Buttons Click Listeners
    const choiceButtons = this.quizChoiceGrid.querySelectorAll(".choice-btn");
    choiceButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const choiceText = btn.querySelector(".choice-text").innerText;
        this.submitQuizAnswer(choiceText);
      });
    });

    // Quiz Results Event Listeners
    this.btnQuizResRestart.addEventListener("click", () => {
      this.switchTab("quiz");
      this.startQuiz();
    });
    this.btnQuizResExit.addEventListener("click", () => this.switchTab("flashcards"));
    this.btnQuizResMistakesReview.addEventListener("click", () => this.startQuizMistakesOnly());

    // Keyboard Shortcuts
    window.addEventListener("keydown", (e) => this.handleKeyboardShortcuts(e));
  }

  switchTab(tabName) {
    if (tabName === "flashcards") {
      this.tabFlashcards.classList.add("active");
      this.tabQuiz.classList.remove("active");
      
      // Stop quiz speed challenge timers if active
      this.stopSpeedChallengeTimer();

      // Toggle views visibility
      document.querySelector(".flashcard-playground").classList.remove("hidden");
      document.querySelector(".study-actions-container").classList.remove("hidden");
      this.flashcardsKeyboardLegend.classList.remove("hidden");
      this.quizContainer.classList.add("hidden");
      
      this.loadNewCard();
    } else if (tabName === "quiz") {
      this.tabFlashcards.classList.remove("active");
      this.tabQuiz.classList.add("active");
      
      // Stop flashcard autoplay
      if (this.tts.isAutoplayActive) {
        this.toggleAutoplay();
      }

      document.querySelector(".flashcard-playground").classList.add("hidden");
      document.querySelector(".study-actions-container").classList.add("hidden");
      this.flashcardsKeyboardLegend.classList.add("hidden");
      
      this.quizContainer.classList.remove("hidden");
      this.quizSetupScreen.classList.remove("hidden");
      this.quizActiveScreen.classList.add("hidden");
      this.quizResultsScreen.classList.add("hidden");
      
      this.renderQuizStats();
    }
  }

  renderQuizStats() {
    const s = this.quiz.stats;
    this.quizStatTotal.innerText = s.totalAnswers;
    
    const accuracy = s.totalAnswers > 0 ? Math.round((s.correctAnswers / s.totalAnswers) * 100) : 0;
    this.quizStatAccuracy.innerText = `${accuracy}%`;
    this.quizStatStreak.innerText = s.bestStreak;
    this.quizStatTime.innerText = `${s.averageResponseTime.toFixed(1)}s`;

    if (s.mistakeHistory && s.mistakeHistory.length > 0) {
      this.btnQuizReviewMistakes.classList.remove("hidden");
    } else {
      this.btnQuizReviewMistakes.classList.add("hidden");
    }
  }

  startQuiz() {
    this.quiz.mode = this.selectQuizMode.value;
    this.quiz.scope = this.selectQuizScope.value;
    this.quiz.limit = this.selectQuizLimit.value;

    const ok = this.quiz.generateQuestions();
    if (!ok) {
      alert("Không có đủ từ trong kho từ vựng thỏa mãn điều kiện lọc của bạn để tạo Quiz. Hãy thêm nhiều từ hơn!");
      return;
    }

    this.quizSetupScreen.classList.add("hidden");
    this.quizResultsScreen.classList.add("hidden");
    this.quizActiveScreen.classList.remove("hidden");

    this.drawQuestion();

    if (this.quiz.mode === "speed-challenge") {
      this.startSpeedChallengeTimer();
    } else {
      this.stopSpeedChallengeTimer();
      document.getElementById("quiz-live-timer-container").classList.remove("hidden");
      this.quizTimerText.innerText = "0.0s";
      
      if (this.questionTimerInterval) clearInterval(this.questionTimerInterval);
      this.questionTimerInterval = setInterval(() => {
        const elapsed = (Date.now() - this.quiz.questionStartTime) / 1000;
        this.quizTimerText.innerText = `${elapsed.toFixed(1)}s`;
      }, 100);
    }
  }

  startSpeedChallengeTimer() {
    this.quiz.speedChallengeRemaining = 60;
    this.quizTimerText.innerText = "60s";
    
    if (this.questionTimerInterval) clearInterval(this.questionTimerInterval);
    if (this.speedChallengeInterval) clearInterval(this.speedChallengeInterval);
    
    this.speedChallengeInterval = setInterval(() => {
      this.quiz.speedChallengeRemaining--;
      this.quizTimerText.innerText = `${this.quiz.speedChallengeRemaining}s`;
      
      // Update progress bar to represent time countdown
      const percent = (this.quiz.speedChallengeRemaining / 60) * 100;
      this.quizProgressBarFill.style.width = `${percent}%`;
      this.quizProgressText.innerText = `Time Remaining: ${this.quiz.speedChallengeRemaining}s`;

      if (this.quiz.speedChallengeRemaining <= 0) {
        this.stopSpeedChallengeTimer();
        this.showQuizResults();
      }
    }, 1000);
  }

  stopSpeedChallengeTimer() {
    if (this.speedChallengeInterval) clearInterval(this.speedChallengeInterval);
    if (this.questionTimerInterval) clearInterval(this.questionTimerInterval);
    this.speedChallengeInterval = null;
    this.questionTimerInterval = null;
  }

  drawQuestion() {
    const q = this.quiz.questions[this.quiz.currentIndex];
    if (!q) return;

    this.quizFeedbackBlock.classList.add("hidden");
    this.quizLiveStreak.innerText = this.quiz.streak;

    if (this.quiz.mode !== "speed-challenge") {
      const qNum = this.quiz.currentIndex + 1;
      const qTotal = this.quiz.questions.length;
      this.quizProgressText.innerText = `Question ${qNum} of ${qTotal}`;
      this.quizProgressBarFill.style.width = `${(qNum / qTotal) * 100}%`;
    }

    const isListening = this.quiz.mode.startsWith("listening");
    if (isListening) {
      this.btnQuizListeningSpeak.classList.remove("hidden");
      this.quizQuestionText.classList.add("hidden");
      this.tts.speak(q.prompt, "en"); // Speak automatically
    } else {
      this.btnQuizListeningSpeak.classList.add("hidden");
      this.quizQuestionText.classList.remove("hidden");
      this.quizQuestionText.innerText = q.prompt;
    }

    const isMc = this.quiz.mode.startsWith("mc") || this.quiz.mode === "listening-mc";
    if (isMc) {
      this.quizChoiceGrid.classList.remove("hidden");
      this.quizTypingBlock.classList.add("hidden");
      
      const buttons = this.quizChoiceGrid.querySelectorAll(".choice-btn");
      buttons.forEach((btn, idx) => {
        btn.className = "choice-btn";
        btn.disabled = false;
        
        const val = q.choices[idx];
        if (val !== undefined) {
          btn.style.display = "flex";
          btn.querySelector(".choice-text").innerText = val;
        } else {
          btn.style.display = "none";
        }
      });
    } else {
      this.quizChoiceGrid.classList.add("hidden");
      this.quizTypingBlock.classList.remove("hidden");
      
      this.quizTypingInput.value = "";
      this.quizTypingInput.disabled = false;
      this.btnQuizTypingSubmit.disabled = false;
      
      setTimeout(() => this.quizTypingInput.focus(), 100);
    }
  }

  submitQuizAnswer(userAnswer) {
    const q = this.quiz.questions[this.quiz.currentIndex];
    if (!q) return;

    if (!this.quizFeedbackBlock.classList.contains("hidden")) return;

    if (this.quiz.mode !== "speed-challenge") {
      if (this.questionTimerInterval) clearInterval(this.questionTimerInterval);
    }

    const { isCorrect, correctAnswer } = this.quiz.submitAnswer(userAnswer);

    const isMc = this.quiz.mode.startsWith("mc") || this.quiz.mode === "listening-mc";
    if (isMc) {
      const buttons = this.quizChoiceGrid.querySelectorAll(".choice-btn");
      buttons.forEach(btn => {
        btn.disabled = true;
        const text = btn.querySelector(".choice-text").innerText;
        if (text === correctAnswer) {
          btn.classList.add("correct");
        } else if (text === userAnswer && !isCorrect) {
          btn.classList.add("incorrect");
        }
      });
    } else {
      this.quizTypingInput.disabled = true;
      this.btnQuizTypingSubmit.disabled = true;
    }

    this.quizFeedbackBlock.className = "quiz-feedback-block glass-panel";
    
    const iconSuccess = this.quizFeedbackBlock.querySelector(".icon-success");
    const iconError = this.quizFeedbackBlock.querySelector(".icon-error");

    if (isCorrect) {
      this.quizFeedbackBlock.classList.add("correct");
      this.quizFeedbackTitle.innerText = "Correct Answer!";
      iconSuccess.classList.remove("hidden");
      iconError.classList.add("hidden");
    } else {
      this.quizFeedbackBlock.classList.add("incorrect");
      this.quizFeedbackTitle.innerText = "Incorrect Answer!";
      iconSuccess.classList.add("hidden");
      iconError.classList.remove("hidden");
    }

    this.quizFeedbackUserAns.innerText = userAnswer || "(Blank)";
    this.quizFeedbackCorrectAns.innerText = correctAnswer;
    this.quizFeedbackBlock.classList.remove("hidden");

    this.quizLiveStreak.innerText = this.quiz.streak;

    if (this.quiz.mode === "speed-challenge") {
      setTimeout(() => {
        this.nextQuizQuestion();
      }, 800);
    }
  }

  nextQuizQuestion() {
    if (this.quiz.nextQuestion()) {
      this.drawQuestion();
      
      if (this.quiz.mode !== "speed-challenge") {
        this.quizTimerText.innerText = "0.0s";
        if (this.questionTimerInterval) clearInterval(this.questionTimerInterval);
        this.questionTimerInterval = setInterval(() => {
          const elapsed = (Date.now() - this.quiz.questionStartTime) / 1000;
          this.quizTimerText.innerText = `${elapsed.toFixed(1)}s`;
        }, 100);
      }
    } else {
      this.stopSpeedChallengeTimer();
      this.showQuizResults();
    }
  }

  showQuizResults() {
    this.stopSpeedChallengeTimer();

    this.quizActiveScreen.classList.add("hidden");
    this.quizResultsScreen.classList.remove("hidden");

    this.quizResPercent.innerText = `${this.quiz.getAccuracy()}%`;
    this.quizResCorrect.innerText = `${this.quiz.score} / ${this.quiz.answersLog.length}`;
    this.quizResStreak.innerText = this.quiz.maxSessionStreak;
    this.quizResTime.innerText = `${this.quiz.getAverageResponseTime()}s`;

    this.quizResMistakesList.innerHTML = "";
    const mistakes = this.quiz.getMistakes();
    this.quizResMistakesCount.innerText = mistakes.length;

    if (mistakes.length === 0) {
      this.quizResMistakesSection.classList.add("hidden");
      this.btnQuizResMistakesReview.classList.add("hidden");
    } else {
      this.quizResMistakesSection.classList.remove("hidden");
      this.btnQuizResMistakesReview.classList.remove("hidden");

      mistakes.forEach(m => {
        const li = document.createElement("li");
        li.innerHTML = `
          <div style="width: 100%;">
            <strong>${m.card.english}</strong>: ${m.correctAns}
            <div style="font-size: 0.75rem; color: var(--color-difficult); margin-top: 2px;">Your answer: "${m.userAns}"</div>
          </div>
        `;
        this.quizResMistakesList.appendChild(li);
      });
    }

    this.renderQuizStats();
  }

  startQuizMistakesOnly() {
    this.selectQuizScope.value = "mistakes";
    this.startQuiz();
  }

  // ==========================================
  // VIEW RENDER & THEME METHODS
  // ==========================================
  toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("aethervocab_theme", next);
  }

  setFilter(status) {
    this.currentFilter = status;
    [this.filterAll, this.filterLearning, this.filterDifficult].forEach(b => b.classList.remove("active"));
    
    if (status === "all") this.filterAll.classList.add("active");
    if (status === "learning") this.filterLearning.classList.add("active");
    if (status === "difficult") this.filterDifficult.classList.add("active");

    this.loadNewCard();
  }

  renderStats() {
    const stats = this.deck.getStats();
    
    this.streakCounter.innerText = `${this.deck.streak} ${this.deck.streak === 1 ? 'Day' : 'Days'}`;
    this.statTotal.innerText = stats.total;
    this.statKnown.innerText = stats.known;
    this.statLearning.innerText = stats.learning;
    this.statDifficult.innerText = stats.difficult;
    this.progressPercent.innerText = `${stats.progressPercent}%`;
    this.progressBarFill.style.width = `${stats.progressPercent}%`;

    // Empty state trigger
    if (stats.total === 0) {
      this.deckEmptyState.classList.remove("hidden");
      this.flashcardContainer.classList.add("hidden");
      this.currentCardIndexIndicator.innerText = "0 / 0";
    } else {
      this.deckEmptyState.classList.add("hidden");
      this.flashcardContainer.classList.remove("hidden");
    }
  }

  // ==========================================
  // FLASHCARD MANAGEMENT & PLAYING
  // ==========================================
  loadNewCard(card = null) {
    // Reset flip state
    this.isCardFlipped = false;
    this.flashcardElement.classList.remove("flipped");

    const activeCard = card || this.deck.getNextCard(
      this.selectStudyMode.value, 
      this.currentFilter, 
      this.currentSearch
    );

    if (!activeCard) {
      this.activeCard = null;
      this.renderStats();
      return;
    }

    this.activeCard = activeCard;

    // Apply study mode configuration
    const mode = this.selectStudyMode.value;
    let frontText = "";
    let backText = "";

    if (mode === "en-vi") {
      frontText = activeCard.english;
      backText = activeCard.vietnamese;
    } else if (mode === "vi-en") {
      frontText = activeCard.vietnamese;
      backText = activeCard.english;
    } else {
      // Mixed mode
      const isEnglishFront = Math.random() < 0.5;
      frontText = isEnglishFront ? activeCard.english : activeCard.vietnamese;
      backText = isEnglishFront ? activeCard.vietnamese : activeCard.english;
    }

    this.cardTextFront.innerText = frontText;
    this.cardTextBack.innerText = backText;

    // Badges update
    const statusUpper = activeCard.status.toUpperCase();
    [this.cardStatusIndicatorFront, this.cardStatusIndicatorBack].forEach(el => {
      el.innerText = statusUpper;
      el.className = "card-status-pill";
      if (activeCard.status === "known") el.classList.add("known");
      if (activeCard.status === "difficult") el.classList.add("difficult");
    });

    // Update indexes display
    const visibleCards = this.deck.cards.filter(c => {
      const matchStatus = this.currentFilter === "all" || c.status === this.currentFilter;
      const matchSearch = !this.currentSearch || 
        c.english.toLowerCase().includes(this.currentSearch.toLowerCase()) ||
        c.vietnamese.toLowerCase().includes(this.currentSearch.toLowerCase());
      return matchStatus && matchSearch;
    });

    const index = visibleCards.findIndex(c => c.id === activeCard.id);
    this.currentCardIndexIndicator.innerText = `${index + 1} / ${visibleCards.length}`;

    this.renderStats();
  }

  flipCard() {
    this.isCardFlipped = !this.isCardFlipped;

    // Choose Y or X flipping directions randomly for tactile effect
    const directions = ["flip-y-cw", "flip-y-ccw", "flip-x-cw", "flip-x-ccw"];
    const chosen = directions[Math.floor(Math.random() * directions.length)];
    
    // Apply styling transition rotation directions inline dynamically
    if (this.isCardFlipped) {
      this.flashcardElement.classList.add("flipped");
    } else {
      this.flashcardElement.classList.remove("flipped");
    }

    // Speak aloud automatically if auto-play is running
    if (this.tts.isAutoplayActive) {
      // Coordinated auto-play updates handled in runAutoplayCycle()
    }
  }

  navigateDeck(dir) {
    const visibleCards = this.deck.cards.filter(c => {
      const matchStatus = this.currentFilter === "all" || c.status === this.currentFilter;
      const matchSearch = !this.currentSearch || 
        c.english.toLowerCase().includes(this.currentSearch.toLowerCase()) ||
        c.vietnamese.toLowerCase().includes(this.currentSearch.toLowerCase());
      return matchStatus && matchSearch;
    });

    if (visibleCards.length <= 1) return;

    let idx = visibleCards.findIndex(c => c.id === this.activeCard?.id);
    idx = (idx + dir + visibleCards.length) % visibleCards.length;
    this.loadNewCard(visibleCards[idx]);
  }

  markCardStatus(newStatus) {
    if (!this.activeCard) return;
    
    const wasCorrect = newStatus === "known";
    this.deck.updateCardReview(this.activeCard.id, wasCorrect, newStatus);
    
    // Apply micro-animation classes based on action
    let animClass = "swiping-up";
    if (newStatus === "known") animClass = "swiping-right";
    if (newStatus === "difficult") animClass = "swiping-left";

    this.flashcardElement.classList.add(animClass);
    
    setTimeout(() => {
      this.loadNewCard();
      this.flashcardElement.className = "flashcard-element"; // Reset classes
    }, 300);
  }

  // ==========================================
  // SWIPE ENGINE (TOUCH & MOUSE DRAGGING)
  // ==========================================
  setupSwipeHandlers() {
    const handleStart = (clientX, clientY) => {
      if (!this.activeCard) return;
      this.swipeStartX = clientX;
      this.swipeStartY = clientY;
      this.isSwiping = true;
      this.flashcardElement.style.transition = "none";
    };

    const handleMove = (clientX, clientY) => {
      if (!this.isSwiping) return;

      const deltaX = clientX - this.swipeStartX;
      const deltaY = clientY - this.swipeStartY;

      // Apply dynamic translation and rotation styles
      const rot = deltaX * 0.08;
      this.flashcardElement.style.transform = `translate(${deltaX}px, ${deltaY}px) rotate(${rot}deg)`;

      // Show swipe indicator text based on thresholds
      const swipeLeftIndicator = this.flashcardElement.querySelector(".swipe-left-overlay");
      const swipeRightIndicator = this.flashcardElement.querySelector(".swipe-right-overlay");

      if (deltaX > 80) {
        swipeRightIndicator.style.opacity = Math.min((deltaX - 80) / 100, 1);
        swipeLeftIndicator.style.opacity = 0;
      } else if (deltaX < -80) {
        swipeLeftIndicator.style.opacity = Math.min((-deltaX - 80) / 100, 1);
        swipeRightIndicator.style.opacity = 0;
      } else {
        swipeLeftIndicator.style.opacity = 0;
        swipeRightIndicator.style.opacity = 0;
      }
    };

    const handleEnd = (clientX, clientY) => {
      if (!this.isSwiping) return;
      this.isSwiping = false;

      const deltaX = clientX - this.swipeStartX;
      const deltaY = clientY - this.swipeStartY;

      // Reset style overlays
      this.flashcardElement.querySelector(".swipe-left-overlay").style.opacity = 0;
      this.flashcardElement.querySelector(".swipe-right-overlay").style.opacity = 0;

      this.flashcardElement.style.transition = "transform 0.4s ease, opacity 0.4s ease";

      if (deltaX > 150) {
        // Swipe Right -> Known
        this.markCardStatus("known");
      } else if (deltaX < -150) {
        // Swipe Left -> Difficult
        this.markCardStatus("difficult");
      } else if (deltaY < -120) {
        // Swipe Up -> Learning
        this.markCardStatus("learning");
      } else {
        // Snap back to center
        this.flashcardElement.style.transform = "";
      }
    };

    // Touch binds
    this.flashcardElement.addEventListener("touchstart", (e) => {
      handleStart(e.touches[0].clientX, e.touches[0].clientY);
    });
    this.flashcardElement.addEventListener("touchmove", (e) => {
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    });
    this.flashcardElement.addEventListener("touchend", (e) => {
      handleEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    });

    // Mouse drag binds (enabling swipes on desktop)
    let isMouseDown = false;
    this.flashcardElement.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      isMouseDown = true;
      handleStart(e.clientX, e.clientY);
    });
    window.addEventListener("mousemove", (e) => {
      if (!isMouseDown) return;
      handleMove(e.clientX, e.clientY);
    });
    window.addEventListener("mouseup", (e) => {
      if (!isMouseDown) return;
      isMouseDown = false;
      handleEnd(e.clientX, e.clientY);
    });
  }

  // ==========================================
  // SPEECH & AUTOPLAY CONTROLLER
  // ==========================================
  speakActiveFace(side) {
    if (!this.activeCard) return;
    
    const isEnVi = this.selectStudyMode.value === "en-vi";
    const speakEn = (side === "front" && isEnVi) || (side === "back" && !isEnVi);
    
    const text = side === "front" ? this.cardTextFront.innerText : this.cardTextBack.innerText;
    this.tts.speak(text, speakEn ? "en" : "vi");
  }

  toggleAutoplay() {
    this.tts.isAutoplayActive = !this.tts.isAutoplayActive;
    
    if (this.tts.isAutoplayActive) {
      this.btnAutoplayToggle.classList.add("playing");
      this.iconPlay.classList.add("hidden");
      this.iconPause.classList.remove("hidden");
      this.runAutoplayCycle();
    } else {
      this.btnAutoplayToggle.classList.remove("playing");
      this.iconPlay.classList.remove("hidden");
      this.iconPause.classList.add("hidden");
      if (this.tts.autoplayTimer) clearTimeout(this.tts.autoplayTimer);
    }
  }

  runAutoplayCycle() {
    if (!this.tts.isAutoplayActive || !this.activeCard) return;

    // Step 1: Speak front face text
    this.speakActiveFace("front");

    // Step 2: Wait delay duration, then flip card
    this.tts.autoplayTimer = setTimeout(() => {
      if (!this.tts.isAutoplayActive) return;
      
      this.flipCard();

      // Step 3: Speak back face text
      setTimeout(() => {
        if (!this.tts.isAutoplayActive) return;
        this.speakActiveFace("back");

        // Step 4: Wait, then load next card
        this.tts.autoplayTimer = setTimeout(() => {
          if (!this.tts.isAutoplayActive) return;
          
          this.navigateDeck(1);
          
          // Re-trigger cycle
          setTimeout(() => {
            this.runAutoplayCycle();
          }, 600); // short wait to settle visual cards loading
        }, this.tts.autoplayDelay * 1000);

      }, 1000); // Wait for card flip animation to finish before speaking back

    }, this.tts.autoplayDelay * 1000);
  }

  // ==========================================
  // PARSER MODAL & EDITING
  // ==========================================
  openParserModal() {
    this.parserModal.classList.remove("hidden");
    this.rawImportTextarea.focus();
  }

  closeParserModal() {
    this.parserModal.classList.add("hidden");
    this.draftCards = [];
    this.rawImportTextarea.value = "";
    this.previewBlock.classList.add("hidden");
  }

  executeParse() {
    const raw = this.rawImportTextarea.value;
    if (!raw.trim()) {
      alert("Hãy nhập dữ liệu thô vào hộp thoại trước khi bấm Parse.");
      return;
    }

    // Call parser engine passes current deck to flag warning duplicates
    this.draftCards = SmartParser.parse(raw, this.deck.cards);

    if (this.draftCards.length === 0) {
      alert("Không phát hiện dữ liệu cụm từ hợp lệ. Hãy kiểm tra định dạng.");
      return;
    }

    this.previewBlock.classList.remove("hidden");
    this.renderPreviewTable();
    this.rawImportTextarea.blur();
  }

  renderPreviewTable() {
    this.previewTableBody.innerHTML = "";
    
    // Apply filters inside preview
    const query = this.previewSearchInput.value.toLowerCase();
    const confFilter = this.previewConfidenceFilter.value;

    const filtered = this.draftCards.filter(c => {
      const matchSearch = c.english.toLowerCase().includes(query) || 
                          c.vietnamese.toLowerCase().includes(query);
      const matchConf = confFilter === "all" || c.confidence === confFilter;
      return matchSearch && matchConf;
    });

    this.previewCount.innerText = filtered.length;
    this.checkSelectAllPreview.checked = false;

    if (filtered.length === 0) {
      this.previewTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Không tìm thấy bản ghi nháp nào khớp.</td></tr>`;
      this.duplicateWarningBanner.classList.add("hidden");
      return;
    }

    // Check duplicate counts
    const duplicatesCount = filtered.filter(c => c.duplicateWarning).length;
    if (duplicatesCount > 0) {
      this.duplicateWarningBanner.classList.remove("hidden");
      this.duplicateWarningText.innerText = `Phát hiện ${duplicatesCount} thẻ có khả năng trùng với từ vựng hiện có (Độ khớp > 80%).`;
    } else {
      this.duplicateWarningBanner.classList.add("hidden");
    }

    filtered.forEach((card, index) => {
      const row = document.createElement("tr");
      row.className = card.confidence === "low" ? "row-low-confidence draggable-row" : "draggable-row";
      row.draggable = true;
      row.dataset.id = card.id;

      // Badges classes
      let confBadge = `<span class="badge badge-success">High</span>`;
      if (card.confidence === "medium") confBadge = `<span class="badge badge-warning">Medium</span>`;
      if (card.confidence === "low") {
        confBadge = card.duplicateWarning 
          ? `<span class="badge badge-danger" title="Duplicate warning">Duplicate?</span>`
          : `<span class="badge badge-danger">Low</span>`;
      }

      row.innerHTML = `
        <td><input type="checkbox" data-id="${card.id}"></td>
        <td>${confBadge}</td>
        <td class="editable-cell text-english-cell" contenteditable="true" data-field="english" data-id="${card.id}">${card.english}</td>
        <td class="editable-cell text-vietnamese-cell" contenteditable="true" data-field="vietnamese" data-id="${card.id}">${card.vietnamese}</td>
        <td>
          <div style="display: flex; gap: 4px;">
            <button class="action-btn-secondary btn-row-split" data-id="${card.id}" title="Split phrase" style="padding: 4px 6px;">Split</button>
            <button class="action-btn-secondary btn-row-merge" data-id="${card.id}" title="Merge with below" style="padding: 4px 6px;">Merge</button>
            <button class="danger-btn btn-row-delete" data-id="${card.id}" title="Delete" style="padding: 4px 6px;">&times;</button>
          </div>
        </td>
      `;

      // Set up inline editing saves
      const engCell = row.querySelector("[data-field='english']");
      const viCell = row.querySelector("[data-field='vietnamese']");

      const handleCellBlur = (e, field) => {
        const text = e.target.innerText.trim();
        const cid = e.target.dataset.id;
        const dCard = this.draftCards.find(c => c.id === cid);
        if (dCard) {
          dCard[field] = text;
        }
      };

      engCell.addEventListener("blur", (e) => handleCellBlur(e, "english"));
      viCell.addEventListener("blur", (e) => handleCellBlur(e, "vietnamese"));

      // Set up row inline button triggers
      row.querySelector(".btn-row-split").addEventListener("click", () => this.splitCardRow(card.id));
      row.querySelector(".btn-row-merge").addEventListener("click", () => this.mergeCardRow(card.id));
      row.querySelector(".btn-row-delete").addEventListener("click", () => this.deleteDraftCard(card.id));

      // Setup Drag & Drop handlers
      this.setupRowDragAndDrop(row);

      this.previewTableBody.appendChild(row);
    });
  }

  // Row operations inside preview editor
  deleteDraftCard(id) {
    this.draftCards = this.draftCards.filter(c => c.id !== id);
    this.renderPreviewTable();
  }

  splitCardRow(id) {
    const idx = this.draftCards.findIndex(c => c.id === id);
    if (idx === -1) return;
    
    const target = this.draftCards[idx];
    
    // Prompt split text index
    const splitText = prompt("Nhập từ/cụm từ phân chia hoặc vị trí cắt. Ví dụ, chia tiếng Anh thành hai:");
    if (!splitText) return;

    if (target.english.includes(splitText)) {
      const parts = target.english.split(splitText);
      const part1 = parts[0].trim();
      const part2 = (splitText + (parts[1] || "")).trim();

      target.english = part1;
      
      const newCard = {
        ...target,
        id: `draft_${Date.now()}_split_${Math.random()}`,
        english: part2,
        confidence: "medium"
      };

      this.draftCards.splice(idx + 1, 0, newCard);
      this.renderPreviewTable();
    } else {
      alert("Không tìm thấy từ phân chia trong ô tiếng Anh.");
    }
  }

  mergeCardRow(id) {
    const idx = this.draftCards.findIndex(c => c.id === id);
    if (idx === -1 || idx === this.draftCards.length - 1) {
      alert("Không có hàng bên dưới để gộp.");
      return;
    }

    const current = this.draftCards[idx];
    const next = this.draftCards[idx + 1];

    current.english = `${current.english} / ${next.english}`.trim();
    current.vietnamese = `${current.vietnamese} / ${next.vietnamese}`.trim();
    current.confidence = "medium";

    // Remove next card
    this.draftCards.splice(idx + 1, 1);
    this.renderPreviewTable();
  }

  // HTML5 Drag and Drop reordering
  setupRowDragAndDrop(row) {
    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", row.dataset.id);
      row.classList.add("dragging");
    });

    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      const draggingRow = this.previewTableBody.querySelector(".dragging");
      const targetRow = e.target.closest("tr");
      if (draggingRow && targetRow && targetRow !== draggingRow) {
        const bounding = targetRow.getBoundingClientRect();
        const offset = e.clientY - bounding.top - bounding.height / 2;
        if (offset > 0) {
          this.previewTableBody.insertBefore(draggingRow, targetRow.nextSibling);
        } else {
          this.previewTableBody.insertBefore(draggingRow, targetRow);
        }
      }
    });

    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      this.syncDraggedOrder();
    });
  }

  syncDraggedOrder() {
    // Read the current DOM rows order and reorder draftCards array accordingly
    const domRows = Array.from(this.previewTableBody.querySelectorAll("tr"));
    const reorderedDrafts = [];

    domRows.forEach(row => {
      const cid = row.dataset.id;
      const card = this.draftCards.find(c => c.id === cid);
      if (card) {
        reorderedDrafts.push(card);
      }
    });

    this.draftCards = reorderedDrafts;
  }

  // Bulk actions
  handleBulkDelete() {
    const selectedCheckboxes = this.previewTableBody.querySelectorAll("input[type='checkbox']:checked");
    if (selectedCheckboxes.length === 0) {
      alert("Hãy chọn các thẻ muốn xóa hàng loạt.");
      return;
    }

    if (confirm(`Bạn có chắc chắn muốn xóa ${selectedCheckboxes.length} thẻ nháp đã chọn?`)) {
      const idsToDelete = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);
      this.draftCards = this.draftCards.filter(c => !idsToDelete.includes(c.id));
      this.renderPreviewTable();
    }
  }

  resolveDuplicatesMerge() {
    // Auto merge or skip duplicates flagged in preview
    this.draftCards.forEach(c => {
      if (c.duplicateWarning && c.duplicateCardId) {
        const existing = this.deck.cards.find(ec => ec.id === c.duplicateCardId);
        if (existing) {
          // Append Vietnamese translations together if they are different
          if (!existing.vietnamese.toLowerCase().includes(c.vietnamese.toLowerCase())) {
            existing.vietnamese = `${existing.vietnamese} / ${c.vietnamese}`;
          }
          // Mark draft card for exclusion by emptying it
          c.english = "";
          c.vietnamese = "";
        }
      }
    });

    // Remove empty cards
    this.draftCards = this.draftCards.filter(c => c.english.trim() && c.vietnamese.trim());
    this.deck.saveToStorage();
    this.renderPreviewTable();
    alert("Đã gộp nghĩa các thẻ trùng lặp vào bộ nhớ. Các ô trùng trong nháp đã bị xóa.");
  }

  acceptImport() {
    // Validate final checks
    const finalToImport = this.draftCards.filter(c => c.english.trim() || c.vietnamese.trim());
    if (finalToImport.length === 0) {
      alert("Không có thẻ nào hợp lệ để thêm vào bộ nhớ.");
      return;
    }

    const count = this.deck.importCards(finalToImport);
    this.closeParserModal();
    this.renderStats();
    this.loadNewCard();
    alert(`Đã thêm thành công ${count} thẻ vào bộ học của bạn!`);
  }

  // ==========================================
  // IMPORT & EXPORT DRAWER LOGIC
  // ==========================================
  openExportModal() {
    this.exportModal.classList.remove("hidden");
    
    // Put txt preview inside textarea by default
    const txtContent = this.deck.cards.map(c => `${c.english} • ${c.vietnamese}`).join("\n");
    this.exportTextareaCopy.value = txtContent;
  }

  closeExportModal() {
    this.exportModal.classList.add("hidden");
    this.exportTextareaCopy.value = "";
  }

  copyExportToClipboard() {
    this.exportTextareaCopy.select();
    document.execCommand("copy");
    alert("Đã sao chép toàn bộ dữ liệu từ vựng vào clipboard!");
  }

  exportDeck(format) {
    if (this.deck.cards.length === 0) {
      alert("Thư mục thẻ trống, không thể xuất.");
      return;
    }

    let content = "";
    let mime = "text/plain";
    let filename = `aethervocab_export_${Date.now()}`;

    if (format === "json") {
      content = JSON.stringify(this.deck.cards, null, 2);
      mime = "application/json";
      filename += ".json";
    } else if (format === "csv") {
      const headers = "id,english,vietnamese,status,confidence,createdAt,lastReviewed,reviewCount,correctCount,incorrectCount\n";
      const rows = this.deck.cards.map(c => {
        // Escape quotes
        const escapeStr = (s) => `"${String(s).replace(/"/g, '""')}"`;
        return `${c.id},${escapeStr(c.english)},${escapeStr(c.vietnamese)},${c.status},${c.confidence},${c.createdAt},${c.lastReviewed},${c.reviewCount},${c.correctCount},${c.incorrectCount}`;
      }).join("\n");
      content = headers + rows;
      mime = "text/csv";
      filename += ".csv";
    } else {
      // txt format
      content = this.deck.cards.map(c => `${c.english} • ${c.vietnamese}`).join("\n");
      filename += ".txt";
    }

    const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  exportStatsReport() {
    const stats = this.deck.getStats();
    
    // Create detailed HTML report
    const htmlReport = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>AetherVocab Study Statistics</title>
        <style>
          body { font-family: sans-serif; padding: 40px; color: #334155; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 30px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
          h1 { color: #6366f1; margin-bottom: 5px; }
          h2 { border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-top: 30px; }
          .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
          .stat-card { background: white; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center; }
          .num { font-size: 24px; font-weight: bold; color: #0f172a; }
          .label { font-size: 12px; color: #64748b; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Báo Cáo Tiến Trình Học Tập</h1>
          <p>Xuất bản lúc: ${new Date().toLocaleString()}</p>
          <div class="stat-grid">
            <div class="stat-card"><div class="num">${this.deck.streak} ngày</div><div class="label">Streak Hiện Tại</div></div>
            <div class="stat-card"><div class="num">${stats.progressPercent}%</div><div class="label">Tiến Độ Thuộc Từ</div></div>
            <div class="stat-card"><div class="num">${stats.total}</div><div class="label">Tổng Số Thẻ</div></div>
            <div class="stat-card"><div class="num">${stats.known}</div><div class="label">Đã Thuộc (Known)</div></div>
            <div class="stat-card"><div class="num">${stats.learning}</div><div class="label">Đang Học (Learning)</div></div>
            <div class="stat-card"><div class="num">${stats.difficult}</div><div class="label">Từ Khó (Difficult)</div></div>
          </div>
          <h2>Review Thống Kê Phiên Này</h2>
          <ul>
            <li>Thời gian tích lũy phiên học này: ${this.deck.getFormattedTime()}</li>
            <li>Tổng số lượt trả lời: ${this.deck.sessionReviews}</li>
            <li>Độ chính xác: ${this.deck.sessionReviews > 0 ? Math.round((this.deck.sessionCorrect / this.deck.sessionReviews) * 100) : 0}%</li>
          </ul>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([htmlReport], { type: "text/html;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `aethervocab_report_${Date.now()}.html`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const extension = file.name.split('.').pop().toLowerCase();

      try {
        let cardsToImport = [];

        if (extension === "json") {
          cardsToImport = JSON.parse(text);
          if (!Array.isArray(cardsToImport)) throw new Error("JSON must be an array of card objects");
        } else if (extension === "csv") {
          // Simplistic CSV parser
          const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
          if (lines.length > 1) {
            // Check headers, skip first line if it looks like headers
            let startIdx = 0;
            if (lines[0].toLowerCase().includes("english") || lines[0].toLowerCase().includes("vietnamese")) {
              startIdx = 1;
            }

            for (let i = startIdx; i < lines.length; i++) {
              // regex splits csv values handling quotes
              const cols = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(",");
              if (cols.length >= 2) {
                const cleanCell = (c) => c.replace(/^"|"$/g, '').trim();
                cardsToImport.push({
                  english: cleanCell(cols[1] || cols[0]),
                  vietnamese: cleanCell(cols[2] || cols[1] || ""),
                  status: cleanCell(cols[3] || "learning"),
                  confidence: cleanCell(cols[4] || "high"),
                  createdAt: parseInt(cols[5]) || Date.now(),
                  lastReviewed: parseInt(cols[6]) || 0,
                  reviewCount: parseInt(cols[7]) || 0,
                  correctCount: parseInt(cols[8]) || 0,
                  incorrectCount: parseInt(cols[9]) || 0
                });
              }
            }
          }
        } else {
          // TXT file import -> Parse it via parser
          cardsToImport = SmartParser.parse(text, this.deck.cards);
        }

        if (cardsToImport.length === 0) {
          alert("Không tìm thấy dữ liệu thẻ hợp lệ trong tệp tin.");
          return;
        }

        const count = this.deck.importCards(cardsToImport);
        this.renderStats();
        this.loadNewCard();
        alert(`Đã nhập thành công ${count} thẻ từ tệp tin!`);

      } catch (err) {
        alert("Lỗi định dạng tệp tin: Không thể xử lý dữ liệu. Chi tiết: " + err.message);
      }
    };
    reader.readAsText(file);
    // Clear input
    this.fileInputHidden.value = "";
  }

  // ==========================================
  // ACCESSIBILITY & SHUTTLE ANIMATIONS
  // ==========================================
  triggerCardShuffleEffect() {
    this.flashcardElement.style.transition = "none";
    this.flashcardElement.style.transform = "scale(0.8) rotate(-10deg)";
    this.flashcardElement.style.opacity = "0.5";
    
    setTimeout(() => {
      this.flashcardElement.style.transition = "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.5s";
      this.flashcardElement.style.transform = "";
      this.flashcardElement.style.opacity = "1";
    }, 100);
  }

  handleKeyboardShortcuts(event) {
    const key = event.key.toLowerCase();

    // 1. Capture keys during active Quiz session
    if (this.quizContainer && !this.quizContainer.classList.contains("hidden")) {
      if (!this.quizActiveScreen.classList.contains("hidden")) {
        // If feedback correct/incorrect banner is visible, Space or Enter triggers Next
        if (!this.quizFeedbackBlock.classList.contains("hidden")) {
          if (event.code === "Space" || key === " " || key === "enter") {
            event.preventDefault();
            this.btnQuizFeedbackNext.click();
            return;
          }
        }
        // If typing input is focused, let Enter submit (handled natively via submit button binding)
        if (document.activeElement === this.quizTypingInput) {
          return;
        }
        // If multiple choice grid is active, keys 1/2/3/4 select choices
        if (!this.quizChoiceGrid.classList.contains("hidden") && this.quizFeedbackBlock.classList.contains("hidden")) {
          if (["1", "2", "3", "4"].includes(key)) {
            event.preventDefault();
            const buttons = this.quizChoiceGrid.querySelectorAll(".choice-btn");
            const idx = parseInt(key) - 1;
            if (buttons[idx] && buttons[idx].style.display !== "none") {
              buttons[idx].click();
            }
            return;
          }
          if (key === "s") {
            event.preventDefault();
            this.btnQuizListeningSpeak.click();
            return;
          }
        }
      }
      return; // Do not fall through to study shortcuts when in quiz tab
    }

    // 2. Fallback: Avoid capturing keyboard shortcuts if typing in input fields
    if (document.activeElement.tagName === "INPUT" || 
        document.activeElement.tagName === "TEXTAREA" ||
        document.activeElement.getAttribute("contenteditable") === "true") {
      return;
    }

    if (event.code === "Space" || key === " ") {
      event.preventDefault();
      this.flipCard();
    } else if (key === "arrowleft") {
      this.navigateDeck(-1);
    } else if (key === "arrowright") {
      this.navigateDeck(1);
    } else if (key === "d") {
      this.markCardStatus("difficult");
    } else if (key === "l") {
      this.markCardStatus("learning");
    } else if (key === "k") {
      this.markCardStatus("known");
    } else if (key === "s") {
      this.speakActiveFace(this.isCardFlipped ? "back" : "front");
    } else if (key === "r") {
      this.actionShuffle.click();
    } else if (key === "t") {
      this.themeToggleBtn.click();
    }
  }
}

// Initialize Application UI
window.addEventListener("DOMContentLoaded", () => {
  window.app = new UIController();
});
