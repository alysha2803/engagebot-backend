const SessionReport = require('../models/SessionReport');
const Student = require('../models/Student');
const { Segment, EmotionPrediction, VoiceFeature } = require('../models/emotion');

const CLASSROOM_PERSON = 'classroom';
// Labels counted as paying attention. Update when the final emotion classes are agreed.
const FOCUSED_LABELS = ['focused', 'engaged'];
const DISTRACTED_LABELS = ['distracted'];
const LOW_CONFIDENCE_WEIGHT = 0.5; // UC-11.1: low-confidence results count for less

// Same thresholds as the engagement categories in routes/students.js
function scoreToLevel(score) {
  if (score >= 65) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

const average = values => values.reduce((a, b) => a + b, 0) / values.length;

// A teacher's correction always wins over the model, at full weight.
function readPrediction(prediction) {
  return {
    label: (prediction.teacher_label || prediction.predicted_label).toLowerCase(),
    weight: !prediction.teacher_label && prediction.low_confidence ? LOW_CONFIDENCE_WEIGHT : 1,
  };
}

function summarizeStudent(personId, segments, predictionBySegment, student) {
  const expressionDistribution = {};
  const timeline = [];
  let distractedCount = 0;
  let focusedWeight = 0;
  let totalWeight = 0;

  for (const segment of segments) {
    const prediction = predictionBySegment.get(segment.segment_id);
    if (!prediction) continue;
    const { label, weight } = readPrediction(prediction);
    const focused = FOCUSED_LABELS.includes(label);

    expressionDistribution[label] = (expressionDistribution[label] || 0) + 1;
    if (DISTRACTED_LABELS.includes(label)) distractedCount++;
    if (focused) focusedWeight += weight;
    totalWeight += weight;
    timeline.push({ t: segment.start_offset_sec, score: focused ? 100 : 0 });
  }
  if (totalWeight === 0) return null;

  const focusScore = Math.round((focusedWeight / totalWeight) * 100);
  return {
    // Unmatched people stay anonymous; a teacher can name them later (UC-9).
    studentId: student ? student._id.toString() : personId,
    studentName: student ? student.name : `Student ${personId.slice(0, 8)}`,
    engagementLevel: scoreToLevel(focusScore),
    focusScore,
    distractedCount,
    expressionDistribution,
    timeline,
  };
}

// Rebuilds a SessionReport's results from the droid's research data. session_id must be the report's id.
// Returns null when the report does not exist. A report with no predictions yet keeps its existing results.
async function summarizeSession(reportId, { complete = false } = {}) {
  const report = await SessionReport.findById(reportId);
  if (!report) return null;

  const segments = await Segment.find({ session_id: reportId }).sort({ start_offset_sec: 1 }).lean();
  const segmentIds = segments.map(s => s.segment_id);
  const predictions = await EmotionPrediction.find({ segment_id: { $in: segmentIds } }).lean();
  const predictionBySegment = new Map(predictions.map(p => [p.segment_id, p]));

  const segmentsByPerson = new Map();
  for (const segment of segments) {
    if (segment.person_id === CLASSROOM_PERSON) continue;
    if (!segmentsByPerson.has(segment.person_id)) segmentsByPerson.set(segment.person_id, []);
    segmentsByPerson.get(segment.person_id).push(segment);
  }

  const students = await Student.find({ personId: { $in: [...segmentsByPerson.keys()] } })
    .select('+personId name').lean();
  const studentByPerson = new Map(students.map(s => [s.personId, s]));

  const engagements = [...segmentsByPerson.entries()]
    .map(([personId, personSegments]) =>
      summarizeStudent(personId, personSegments, predictionBySegment, studentByPerson.get(personId)))
    .filter(Boolean);

  if (engagements.length > 0) {
    report.studentEngagements = engagements;
    report.avgFocusScore = Math.round(average(engagements.map(e => e.focusScore)));
    report.overallEngagement = scoreToLevel(report.avgFocusScore);
  }

  const classroomIds = segments.filter(s => s.person_id === CLASSROOM_PERSON).map(s => s.segment_id);
  const noise = await VoiceFeature.find({ segment_id: { $in: classroomIds } }, 'energy_mean').lean();
  if (noise.length > 0) report.avgNoiseEnergy = average(noise.map(n => n.energy_mean));

  if (complete) report.status = 'completed';
  await report.save();
  return report;
}

module.exports = { summarizeSession };
