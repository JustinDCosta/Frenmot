/* =================================================================
   SRS — Spaced repetition with a simplified SM-2 + customizable
   ladder of intervals from settings.
   Grade scale: 0=Again, 1=Hard, 2=Good, 3=Easy
   ================================================================= */
(function (global) {
  'use strict';
  const { now, DAY, clamp, todayKey } = global.U;

  const STATUS = {
    NEW: 'new',
    LEARNING: 'learning',
    REVIEW: 'review',
    MASTERED: 'mastered'
  };

  function makeInitial() {
    return {
      ease: 2.5,
      interval: 0,
      repetitions: 0,
      dueAt: now(),
      lastReviewedAt: null,
      correct: 0,
      incorrect: 0,
      status: STATUS.NEW
    };
  }

  /** Predict the next interval (in days) for a given grade — used to label buttons */
  function predictInterval(srs, grade, settings) {
    const ladder = (settings?.intervals && settings.intervals.length)
      ? settings.intervals
      : [1, 3, 7, 14, 30, 60];
    const easyBonus = settings?.easyBonus ?? 1.3;
    const hardPenalty = settings?.hardPenalty ?? 0.6;

    const reps = srs?.repetitions || 0;
    if (grade === 0) return 0;                     // Again -> due today
    if (grade === 1) {
      if (reps < 1) return Math.max(1, ladder[0] * hardPenalty);
      const cur = srs.interval || ladder[0];
      return Math.max(1, Math.round(cur * hardPenalty));
    }
    if (grade === 2) {
      if (reps < ladder.length) return ladder[Math.min(reps, ladder.length - 1)];
      const ease = srs.ease ?? 2.5;
      return Math.round((srs.interval || ladder[ladder.length - 1]) * ease);
    }
    if (grade === 3) {
      if (reps < ladder.length) return Math.round(ladder[Math.min(reps, ladder.length - 1)] * easyBonus);
      const ease = (srs.ease ?? 2.5) * easyBonus;
      return Math.round((srs.interval || ladder[ladder.length - 1]) * ease);
    }
    return 1;
  }

  /** Apply a grade (0..3) to a word's SRS state. Returns updated word. */
  function applyGrade(word, grade, settings) {
    if (!word.srs) word.srs = makeInitial();
    const srs = word.srs;
    const days = predictInterval(srs, grade, settings);

    if (grade === 0) {
      srs.repetitions = 0;
      srs.ease = clamp((srs.ease ?? 2.5) - 0.2, 1.3, 3.0);
      srs.interval = 0;
      srs.dueAt = now() + 10 * 60 * 1000; // 10 minutes
      srs.incorrect = (srs.incorrect || 0) + 1;
      srs.status = STATUS.LEARNING;
    } else {
      if (grade === 1) srs.ease = clamp((srs.ease ?? 2.5) - 0.15, 1.3, 3.0);
      if (grade === 3) srs.ease = clamp((srs.ease ?? 2.5) + 0.10, 1.3, 3.0);
      srs.repetitions = (srs.repetitions || 0) + 1;
      srs.interval = days;
      srs.dueAt = now() + days * DAY;
      srs.correct = (srs.correct || 0) + 1;
      srs.status = days >= 21 ? STATUS.MASTERED : STATUS.REVIEW;
    }
    srs.lastReviewedAt = now();
    word.updatedAt = now();
    return word;
  }

  /** Get words due today, prioritized: overdue first, then weak words. */
  function getDueWords(allWords, limit = Infinity) {
    const t = now();
    const due = (allWords || []).filter(w => {
      const d = w.srs?.dueAt ?? 0;
      return d <= t;
    });
    due.sort((a, b) => {
      // weakest (lowest ease) and oldest due first
      const ea = a.srs?.ease ?? 2.5;
      const eb = b.srs?.ease ?? 2.5;
      if (ea !== eb) return ea - eb;
      return (a.srs?.dueAt ?? 0) - (b.srs?.dueAt ?? 0);
    });
    return due.slice(0, limit);
  }

  function getNewWords(allWords, dailyCap = 20) {
    const news = (allWords || []).filter(w => (w.srs?.status || 'new') === STATUS.NEW);
    return news.slice(0, dailyCap);
  }

  function getWeakWords(allWords, threshold = 2.0) {
    return (allWords || []).filter(w => (w.srs?.ease ?? 2.5) <= threshold);
  }

  /** Stats summary used by dashboard. */
  function summary(allWords) {
    const t = now();
    let due = 0, mastered = 0, learning = 0, weak = 0, total = allWords.length, correct = 0, attempts = 0;
    for (const w of allWords) {
      const s = w.srs || makeInitial();
      if (s.dueAt <= t) due++;
      if (s.status === STATUS.MASTERED) mastered++;
      if (s.status === STATUS.LEARNING || s.status === STATUS.NEW) learning++;
      if ((s.ease ?? 2.5) <= 2.0 && s.repetitions > 1) weak++;
      correct += s.correct || 0;
      attempts += (s.correct || 0) + (s.incorrect || 0);
    }
    return {
      total, due, mastered, learning, weak,
      accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : 0
    };
  }

  /** Mark a review event for streak / activity. */
  function recordReviewActivity(grade) {
    global.State.update(s => {
      const today = todayKey();
      if (!s.review.activeDays.includes(today)) {
        s.review.activeDays.push(today);
        // streak update
        const last = s.review.lastReviewedDay;
        if (last) {
          const lastDate = new Date(last);
          const diff = (new Date(today) - lastDate) / DAY;
          if (diff === 1) s.review.streak += 1;
          else if (diff === 0) { /* same day */ }
          else s.review.streak = 1;
        } else {
          s.review.streak = 1;
        }
        s.review.lastReviewedDay = today;
        s.review.longestStreak = Math.max(s.review.longestStreak, s.review.streak);
      }
      s.review.totalReviews += 1;
      if (grade >= 2) s.review.correctReviews += 1;

      // weekly history bookkeeping
      const wh = s.stats.weekHistory;
      let entry = wh.find(e => e.day === today);
      if (!entry) {
        entry = { day: today, reviewed: 0, correct: 0, added: 0 };
        wh.push(entry);
      }
      entry.reviewed += 1;
      if (grade >= 2) entry.correct += 1;
      // keep last 60 days
      while (wh.length > 60) wh.shift();
    });
  }

  global.SRS = { STATUS, makeInitial, applyGrade, predictInterval, getDueWords, getNewWords, getWeakWords, summary, recordReviewActivity };
})(window);
