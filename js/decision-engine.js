/**
 * IRSDK SOF — Client-Side GO/NOGO Decision Engine
 * ==================================================
 * Evaluates whether a driver should enter a race session based on 8 weighted
 * criteria. Returns a composite score (0-100) and a recommendation of
 * "GO", "NEUTRAL", or "NOGO".
 *
 * Criteria (F.2.x from project specification):
 *   F.2.1  SOF ratio (my iR vs SOF)             — 20%
 *   F.2.2  Estimated finishing position           — 15%
 *   F.2.3  Probable iRating change                — 15%
 *   F.2.4  Field quality / track experience       — 15%
 *   F.2.5  Field danger score                     — 10%
 *   F.2.6  Track conditions (weather, temp)       — 10%
 *   F.2.7  Safety Rating risk                     — 10%
 *   F.2.8  Participant count                      — 5%
 *
 * Each criterion scores 0-100 independently, then the weighted sum gives
 * the final composite score.
 */

'use strict';

const decisionEngine = (() => {

  // =========================================================================
  // Default weights and thresholds (can be overridden via settings)
  // =========================================================================
  const DEFAULT_WEIGHTS = {
    sof_ratio:         0.20,
    estimated_position: 0.15,
    irating_change:    0.15,
    field_quality:     0.15,
    field_danger:      0.10,
    track_conditions:  0.10,
    sr_risk:           0.10,
    participant_count: 0.05,
  };

  const DEFAULT_THRESHOLDS = {
    go:   75,  // score >= 75 => GO
    nogo: 50,  // score <  50 => NOGO
  };

  // =========================================================================
  // Helper: clamp a value between 0 and 100
  // =========================================================================
  const _clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));

  // =========================================================================
  // F.2.1 — SOF Ratio (20%)
  // How does my iRating compare to the field SOF?
  // Ideal: my iR is close to or above SOF. Penalize if SOF is much higher.
  // =========================================================================
  const _scoreSofRatio = (myIrating, sof) => {
    if (!sof || sof === 0) return { score: 50, explanation: 'SOF not available' };

    const ratio = myIrating / sof;

    // ratio >= 1.2 : I am well above the field -> score 95
    // ratio == 1.0 : Perfectly matched -> score 75
    // ratio == 0.8 : Slightly below -> score 50
    // ratio <= 0.5 : Way below the field -> score 10
    let score;
    if (ratio >= 1.2) {
      score = 95;
    } else if (ratio >= 1.0) {
      // Linear interpolation from 75 to 95 across [1.0, 1.2]
      score = 75 + (ratio - 1.0) * (95 - 75) / 0.2;
    } else if (ratio >= 0.8) {
      // Linear from 50 to 75 across [0.8, 1.0]
      score = 50 + (ratio - 0.8) * (75 - 50) / 0.2;
    } else if (ratio >= 0.5) {
      // Linear from 10 to 50 across [0.5, 0.8]
      score = 10 + (ratio - 0.5) * (50 - 10) / 0.3;
    } else {
      score = 10;
    }

    const explanation = ratio >= 1.0
      ? `Your iRating is ${Math.round((ratio - 1) * 100)}% above SOF (${Math.round(sof)})`
      : `Your iRating is ${Math.round((1 - ratio) * 100)}% below SOF (${Math.round(sof)})`;

    return { score: _clamp(score), explanation };
  };

  // =========================================================================
  // F.2.2 — Estimated Finishing Position (15%)
  // Based on my iRating rank in the field, estimate where I will finish.
  // Higher rank = higher score.
  // =========================================================================
  const _scoreEstimatedPosition = (myIrating, drivers) => {
    if (!drivers || drivers.length === 0) {
      return { score: 50, explanation: 'No driver data available' };
    }

    const iratings = drivers
      .map((d) => Number(d.irating || d.iRating || d.IRating || 0))
      .filter((ir) => ir > 0);

    if (iratings.length === 0) {
      return { score: 50, explanation: 'No iRating data available' };
    }

    const sorted = [...iratings].sort((a, b) => b - a);
    const fieldSize = sorted.length;

    // Find my estimated position (1 = highest iRating)
    let position = sorted.findIndex((ir) => myIrating >= ir) + 1;
    if (position === 0) position = fieldSize;

    // Score: top 10% -> 95, top 25% -> 80, top 50% -> 60, bottom 25% -> 30, bottom 10% -> 15
    const percentile = (fieldSize - position) / fieldSize; // 1.0 = best, 0.0 = worst
    const score = 15 + percentile * 80; // Range: 15 to 95

    const explanation = `Estimated position: P${position}/${fieldSize}`;
    return { score: _clamp(score), explanation };
  };

  // =========================================================================
  // F.2.3 — Probable iRating Change (15%)
  // Estimate iRating gain/loss based on expected position vs SOF.
  // =========================================================================
  const _scoreIRatingChange = (myIrating, sof, drivers) => {
    if (!drivers || drivers.length === 0 || !sof) {
      return { score: 50, explanation: 'Cannot estimate iRating change' };
    }

    const fieldSize = drivers.length;

    // Estimate expected position based on iRating rank
    const iratings = drivers
      .map((d) => Number(d.irating || d.iRating || d.IRating || 0))
      .filter((ir) => ir > 0);
    const sorted = [...iratings].sort((a, b) => b - a);
    let expectedPos = sorted.findIndex((ir) => myIrating >= ir) + 1;
    if (expectedPos === 0) expectedPos = fieldSize;

    // Approximate iRating change using simplified Elo-like formula
    const change = estimateIRatingChange(myIrating, sof, expectedPos, fieldSize);

    // Score: large gain = high score, large loss = low score
    // +200 or more -> 95
    // +100 -> 80
    // 0 (break even) -> 55
    // -100 -> 30
    // -200 or worse -> 10
    let score;
    if (change >= 200) {
      score = 95;
    } else if (change >= 0) {
      score = 55 + (change / 200) * 40; // 55 to 95
    } else if (change >= -200) {
      score = 55 + (change / 200) * 45; // 55 down to 10
    } else {
      score = 10;
    }

    const sign = change >= 0 ? '+' : '';
    const explanation = `Estimated iRating change: ${sign}${Math.round(change)} (P${expectedPos}/${fieldSize})`;
    return { score: _clamp(score), explanation };
  };

  // =========================================================================
  // F.2.4 — Field Quality / Track Experience (15%)
  // Higher average license and more experienced drivers = safer race.
  // =========================================================================
  const _scoreFieldQuality = (drivers) => {
    if (!drivers || drivers.length === 0) {
      return { score: 50, explanation: 'No field data available' };
    }

    // Use iRating distribution to assess field quality
    const iratings = drivers
      .map((d) => Number(d.irating || d.iRating || d.IRating || 0))
      .filter((ir) => ir > 0);

    if (iratings.length === 0) {
      return { score: 50, explanation: 'No iRating data available' };
    }

    const avgIR = iratings.reduce((s, v) => s + v, 0) / iratings.length;

    // Higher average iRating = more experienced field = better
    // avg >= 3000 -> 90, avg ~2000 -> 65, avg ~1000 -> 40, avg <= 500 -> 20
    let score;
    if (avgIR >= 3000) {
      score = 90;
    } else if (avgIR >= 2000) {
      score = 65 + ((avgIR - 2000) / 1000) * 25;
    } else if (avgIR >= 1000) {
      score = 40 + ((avgIR - 1000) / 1000) * 25;
    } else {
      score = 20 + (avgIR / 1000) * 20;
    }

    const explanation = `Average field iRating: ${Math.round(avgIR)}`;
    return { score: _clamp(score), explanation };
  };

  // =========================================================================
  // F.2.5 — Field Danger Score (10%)
  // How many low-SR / incident-prone drivers are in the field?
  // =========================================================================
  const _scoreFieldDanger = (drivers) => {
    if (!drivers || drivers.length === 0) {
      return { score: 50, explanation: 'No field data for danger assessment' };
    }

    // Count drivers with low iRating (< 1000) as a proxy for incident-prone
    const iratings = drivers
      .map((d) => Number(d.irating || d.iRating || d.IRating || 0))
      .filter((ir) => ir > 0);

    const total = iratings.length;
    if (total === 0) return { score: 50, explanation: 'No iRating data' };

    const lowIRCount = iratings.filter((ir) => ir < 1000).length;
    const lowIRPct = lowIRCount / total;

    // Also check for SR data if available
    const srValues = drivers
      .map((d) => Number(d.sr || d.safety_rating || d.safetyRating || 0))
      .filter((sr) => sr > 0);

    let lowSRCount = 0;
    if (srValues.length > 0) {
      lowSRCount = srValues.filter((sr) => sr < 2.0).length;
    }

    // fewer low-IR / low-SR drivers = safer = higher score
    // 0% low-IR -> 90, 10% -> 70, 25% -> 50, 50%+ -> 20
    let score = 90 - (lowIRPct * 140); // 90 at 0% down to ~20 at 50%
    score = Math.max(score, 15);

    const explanation = `${lowIRCount}/${total} drivers below 1k iRating (${Math.round(lowIRPct * 100)}%)`;
    return { score: _clamp(score), explanation };
  };

  // =========================================================================
  // F.2.6 — Track Conditions (10%)
  // Weather, temperature, wind. Harsher conditions = lower score.
  // =========================================================================
  const _scoreTrackConditions = (conditions) => {
    if (!conditions) {
      return { score: 70, explanation: 'No weather data available (assuming normal)' };
    }

    let score = 80; // Start optimistic
    const notes = [];

    // Temperature penalty: ideal is 20-30C, penalize outside that range
    const temp = Number(conditions.track_temp || conditions.temperature || 25);
    if (temp < 10 || temp > 40) {
      score -= 20;
      notes.push(`extreme temp (${temp}\u00B0C)`);
    } else if (temp < 15 || temp > 35) {
      score -= 10;
      notes.push(`non-ideal temp (${temp}\u00B0C)`);
    }

    // Wind penalty
    const wind = Number(conditions.wind_speed || conditions.windSpeed || 0);
    if (wind > 8) {
      score -= 15;
      notes.push(`high wind (${wind.toFixed(1)} m/s)`);
    } else if (wind > 4) {
      score -= 5;
      notes.push(`moderate wind (${wind.toFixed(1)} m/s)`);
    }

    // Rain / wet conditions
    const isWet = conditions.is_wet || conditions.rain || false;
    if (isWet) {
      score -= 25;
      notes.push('wet/rain conditions');
    }

    const explanation = notes.length > 0
      ? `Conditions: ${notes.join(', ')}`
      : 'Conditions are favorable';

    return { score: _clamp(score), explanation };
  };

  // =========================================================================
  // F.2.7 — Safety Rating Risk (10%)
  // How much SR do I risk losing? Considers current SR level and license.
  // =========================================================================
  const _scoreSRRisk = (mySR, myLicense) => {
    if (mySR === null || mySR === undefined) {
      return { score: 60, explanation: 'SR data not available' };
    }

    const sr = Number(mySR);

    // High SR = more room to absorb incidents = higher score
    // SR >= 4.0 -> 90 (plenty of buffer)
    // SR ~3.0 -> 65 (moderate buffer)
    // SR ~2.0 -> 40 (risky)
    // SR < 1.5 -> 20 (very risky, could drop license)
    let score;
    if (sr >= 4.0) {
      score = 90;
    } else if (sr >= 3.0) {
      score = 65 + ((sr - 3.0) / 1.0) * 25;
    } else if (sr >= 2.0) {
      score = 40 + ((sr - 2.0) / 1.0) * 25;
    } else if (sr >= 1.0) {
      score = 15 + ((sr - 1.0) / 1.0) * 25;
    } else {
      score = 15;
    }

    // Proximity to license threshold (x.00) is dangerous
    const fractional = sr - Math.floor(sr);
    if (fractional < 0.2 && sr < 3.0) {
      score -= 10;
    }

    const explanation = `Current SR: ${sr.toFixed(2)} — ${sr >= 3.0 ? 'comfortable buffer' : 'limited buffer'}`;
    return { score: _clamp(score), explanation };
  };

  // =========================================================================
  // F.2.8 — Participant Count (5%)
  // Bigger fields = more exciting but also more chaotic at start.
  // Sweet spot: 16-24 drivers.
  // =========================================================================
  const _scoreParticipantCount = (drivers) => {
    if (!drivers || drivers.length === 0) {
      return { score: 30, explanation: 'No participants detected' };
    }

    const count = drivers.length;

    // Ideal: 16-24 drivers -> 90
    // 12-15 or 25-30 -> 70
    // 8-11 -> 50
    // <8 -> 30 (not enough for a good race)
    // >30 -> 55 (chaotic starts)
    let score;
    if (count >= 16 && count <= 24) {
      score = 90;
    } else if (count >= 12 && count <= 30) {
      score = 70;
    } else if (count >= 8) {
      score = 50;
    } else if (count >= 4) {
      score = 30;
    } else {
      score = 15;
    }

    const explanation = `${count} participants (ideal: 16-24)`;
    return { score: _clamp(score), explanation };
  };

  // =========================================================================
  // iRating Change Estimator
  // Simplified Elo/Glicko-style approximation for iRacing.
  // =========================================================================

  /**
   * Estimate the iRating change for a driver based on their finish position.
   *
   * iRacing uses a modified Glicko system. This is a simplified approximation:
   *   - Expected score = sum of win probabilities vs each opponent
   *   - Actual score = (fieldSize - position) / (fieldSize - 1)  [normalized]
   *   - Change = K * (actual - expected)
   *
   * @param {number} myIR - My iRating
   * @param {number} sof - Strength of Field
   * @param {number} position - Finishing position (1 = first)
   * @param {number} fieldSize - Number of drivers
   * @returns {number} Estimated iRating change (positive = gain)
   */
  const estimateIRatingChange = (myIR, sof, position, fieldSize) => {
    if (!fieldSize || fieldSize <= 1) return 0;

    // K-factor: higher for lower iRating drivers (they move faster)
    // iRacing K is roughly proportional to fieldSize and inversely to iRating
    const K = Math.max(40, Math.min(200, (fieldSize / 20) * 100));

    // Expected score: probability of beating an "average" opponent (SOF)
    // Using logistic function similar to Elo
    const expectedWinPct = 1 / (1 + Math.pow(10, (sof - myIR) / 400));

    // Actual score: normalized finish position (1st = 1.0, last = 0.0)
    const actualScore = (fieldSize - position) / (fieldSize - 1);

    // iRating change
    const change = K * (actualScore - expectedWinPct);

    return Math.round(change);
  };

  // =========================================================================
  // Main Decision Evaluator
  // =========================================================================

  /**
   * Evaluate all 8 criteria and produce a final GO/NEUTRAL/NOGO decision.
   *
   * @param {object} sessionData - Session data including drivers, conditions
   * @param {number} myIrating - The user's current iRating
   * @param {number} mySR - The user's current Safety Rating
   * @param {object} [settings={}] - Optional overrides for weights and thresholds
   * @returns {{
   *   score: number,
   *   recommendation: string,
   *   criteria: Array<{ name: string, score: number, weight: number, explanation: string }>,
   *   summary: string
   * }}
   */
  const evaluateDecision = (sessionData, myIrating, mySR, settings = {}) => {
    const weights = { ...DEFAULT_WEIGHTS, ...(settings.weights || {}) };
    const thresholds = { ...DEFAULT_THRESHOLDS, ...(settings.thresholds || {}) };

    const drivers = sessionData.drivers || sessionData.entries || [];
    const conditions = sessionData.conditions || sessionData.weather || null;
    const sof = sessionData.sof || (sofEngine ? sofEngine.calculateSOF(drivers).value : 0);
    const myLicense = sessionData.my_license || settings.myLicense || null;

    // Evaluate each criterion
    const c1 = _scoreSofRatio(myIrating, sof);
    const c2 = _scoreEstimatedPosition(myIrating, drivers);
    const c3 = _scoreIRatingChange(myIrating, sof, drivers);
    const c4 = _scoreFieldQuality(drivers);
    const c5 = _scoreFieldDanger(drivers);
    const c6 = _scoreTrackConditions(conditions);
    const c7 = _scoreSRRisk(mySR, myLicense);
    const c8 = _scoreParticipantCount(drivers);

    // Build criteria array with names and weights
    const criteria = [
      { name: 'SOF Ratio',            key: 'sof_ratio',          score: c1.score, weight: weights.sof_ratio,          explanation: c1.explanation },
      { name: 'Estimated Position',    key: 'estimated_position', score: c2.score, weight: weights.estimated_position, explanation: c2.explanation },
      { name: 'iRating Change',        key: 'irating_change',     score: c3.score, weight: weights.irating_change,     explanation: c3.explanation },
      { name: 'Field Quality',         key: 'field_quality',      score: c4.score, weight: weights.field_quality,       explanation: c4.explanation },
      { name: 'Field Danger',          key: 'field_danger',       score: c5.score, weight: weights.field_danger,        explanation: c5.explanation },
      { name: 'Track Conditions',      key: 'track_conditions',   score: c6.score, weight: weights.track_conditions,    explanation: c6.explanation },
      { name: 'Safety Rating Risk',    key: 'sr_risk',            score: c7.score, weight: weights.sr_risk,             explanation: c7.explanation },
      { name: 'Participant Count',     key: 'participant_count',  score: c8.score, weight: weights.participant_count,    explanation: c8.explanation },
    ];

    // Calculate weighted composite score
    const compositeScore = Math.round(
      criteria.reduce((sum, c) => sum + c.score * c.weight, 0)
    );

    // Determine recommendation
    let recommendation;
    if (compositeScore >= thresholds.go) {
      recommendation = 'GO';
    } else if (compositeScore >= thresholds.nogo) {
      recommendation = 'NEUTRAL';
    } else {
      recommendation = 'NOGO';
    }

    // Build human-readable summary
    const topPositive = criteria
      .filter((c) => c.score >= 70)
      .sort((a, b) => b.score * b.weight - a.score * a.weight)
      .slice(0, 2)
      .map((c) => c.name);

    const topNegative = criteria
      .filter((c) => c.score < 50)
      .sort((a, b) => a.score * a.weight - b.score * b.weight)
      .slice(0, 2)
      .map((c) => c.name);

    let summary = `Score: ${compositeScore}/100 — ${recommendation}.`;
    if (topPositive.length > 0) {
      summary += ` Strengths: ${topPositive.join(', ')}.`;
    }
    if (topNegative.length > 0) {
      summary += ` Risks: ${topNegative.join(', ')}.`;
    }

    return {
      score: compositeScore,
      recommendation,
      criteria,
      summary,
    };
  };

  // Public API
  return {
    evaluateDecision,
    estimateIRatingChange,
    DEFAULT_WEIGHTS,
    DEFAULT_THRESHOLDS,
  };

})();
