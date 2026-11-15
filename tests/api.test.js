// End-to-end API tests against a throwaway in-memory MongoDB. Never touches Atlas.
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const request = require('supertest');
const mongoose = require('mongoose');

const DROID_KEY = 'test-droid-key';
const droid = r => r.set('X-Droid-Key', DROID_KEY);
const uuid = () => crypto.randomUUID();
const as = (r, token) => r.set('Authorization', `Bearer ${token}`);

let replSet, app, models, emotionConn;
let adminToken, teacherA, teacherB, tokenA, tokenB, studentA, studentB, reportA, reportB;

async function login(path, email, password) {
  const res = await request(app).post(`/api/auth/${path}/login`).send({ email, password });
  assert.equal(res.status, 200, res.text);
  return res.body.token;
}

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    JWT_SECRET: 'test-secret',
    DROID_API_KEY: DROID_KEY,
    DNS_SERVERS: 'system',
    EMOTION_MONGO_URI: replSet.getUri(),
    EMOTION_DB_NAME: 'emotion_test',
  });
  app = require('../app');
  emotionConn = require('../db/emotion');
  await mongoose.connect(replSet.getUri(), { dbName: 'app_test' });
  await emotionConn.asPromise();

  models = {
    Admin: require('../models/Admin'),
    Teacher: require('../models/Teacher'),
    Student: require('../models/Student'),
    ClassGroup: require('../models/ClassGroup'),
    ClassSchedule: require('../models/ClassSchedule'),
    SessionReport: require('../models/SessionReport'),
    Notification: require('../models/Notification'),
    Droid: require('../models/Droid'),
    AuditLog: require('../models/AuditLog'),
    emotion: require('../models/emotion'),
  };
  await Promise.all(Object.values(models.emotion).map(m => m.createIndexes()));
  await Promise.all(['Teacher', 'Student', 'Droid'].map(n => models[n].init()));

  await models.Admin.create({ email: 'admin@test.my', password: 'admin-pass-1', role: 'super_admin' });
  teacherA = await models.Teacher.create({ name: 'Teacher A', email: 'a@test.my', password: 'teacher-pass-a', employeeId: 'EB-1', assignedClasses: ['5A'] });
  teacherB = await models.Teacher.create({ name: 'Teacher B', email: 'b@test.my', password: 'teacher-pass-b', employeeId: 'EB-2', assignedClasses: ['5B'] });

  adminToken = await login('admin', 'admin@test.my', 'admin-pass-1');
  tokenA = await login('teacher', 'a@test.my', 'teacher-pass-a');
  tokenB = await login('teacher', 'b@test.my', 'teacher-pass-b');

  studentA = await models.Student.create({ name: 'Ali', icNumber: '111111111111', classGroup: '5A', studentId: 'STU-00001' });
  studentB = await models.Student.create({ name: 'Bala', icNumber: '222222222222', classGroup: '5B', studentId: 'STU-00002' });
  reportA = await models.SessionReport.create({ date: '2026-11-02', subject: 'Maths', classGroup: '5A', startTime: '08:00' });
  reportB = await models.SessionReport.create({ date: '2026-11-02', subject: 'Maths', classGroup: '5B', startTime: '09:00' });
});

after(async () => {
  await mongoose.disconnect();
  await emotionConn.close();
  await replSet.stop();
});

describe('step 1: permissions', () => {
  test('a teacher cannot read another teacher\'s notifications', async () => {
    await models.Notification.create({ teacherId: teacherB.id, type: 'late', message: 'for B' });
    const res = await as(request(app).get(`/api/notifications?teacherId=${teacherB.id}`), tokenA);
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 0);
  });

  test('a teacher cannot mark another teacher\'s notification as read', async () => {
    const n = await models.Notification.create({ teacherId: teacherB.id, type: 'late', message: 'x' });
    const denied = await as(request(app).patch(`/api/notifications/${n.id}/read`), tokenA);
    assert.equal(denied.status, 403);
    const ok = await as(request(app).patch(`/api/notifications/${n.id}/read`), tokenB);
    assert.equal(ok.body.read, true);
  });

  test('a teacher cannot create notifications for someone else', async () => {
    const res = await as(request(app).post('/api/notifications'), tokenA)
      .send({ teacherId: teacherB.id, type: 'late', message: 'x' });
    assert.equal(res.status, 403);
  });

  test('teachers see only their own class and no IC numbers; admins see everything', async () => {
    const teacher = await as(request(app).get('/api/students'), tokenA);
    assert.deepEqual(teacher.body.map(s => s.name), ['Ali']);
    assert.equal(teacher.body[0].icNumber, undefined);
    assert.equal(teacher.body[0].personId, undefined);

    const denied = await as(request(app).get('/api/students?classGroup=5B'), tokenA);
    assert.equal(denied.status, 403);

    const admin = await as(request(app).get('/api/students'), adminToken);
    assert.equal(admin.body.length, 2);
    assert.equal(admin.body[0].icNumber, '111111111111');
  });

  test('query operators in the URL are not treated as database operators', async () => {
    const res = await as(request(app).get('/api/reports?date[$ne]=x'), adminToken);
    assert.equal(res.status, 400);
  });

  test('teachers can only correct names, and only in their class', async () => {
    const res = await as(request(app).patch(`/api/students/${studentA.id}`), tokenA)
      .send({ name: 'Ali Bin Abu', icNumber: '999', classGroup: '5B' });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Ali Bin Abu');
    assert.equal(res.body.icNumber, undefined);

    const stored = await models.Student.findById(studentA.id);
    assert.equal(stored.icNumber, '111111111111');
    assert.equal(stored.classGroup, '5A');

    const denied = await as(request(app).patch(`/api/students/${studentB.id}`), tokenA).send({ name: 'Hacked' });
    assert.equal(denied.status, 403);
  });

  test('teachers cannot read or change another class\'s reports', async () => {
    const list = await as(request(app).get('/api/reports?date=2026-11-02'), tokenA);
    assert.deepEqual(list.body.map(r => r.classGroup), ['5A']);

    const monthly = await as(request(app).get('/api/reports/monthly?month=11&year=2026'), tokenA);
    assert.equal(monthly.body.totalSessions, 1);

    assert.equal((await as(request(app).get('/api/reports/class/5B'), tokenA)).status, 403);
    assert.equal((await as(request(app).patch(`/api/reports/${reportB.id}`), tokenA).send({ avgFocusScore: 1 })).status, 403);
    assert.equal((await as(request(app).post('/api/reports'), tokenA).send({ date: '2026-11-02', subject: 'x', classGroup: '5B' })).status, 403);
  });

  test('droid-only routes reject a missing or wrong key', async () => {
    const segment = { segment_id: 'seg_nokey', session_id: reportA.id, person_id: uuid(), scene_type: 'classroom', session_start_time: new Date(), start_offset_sec: 0, end_offset_sec: 30 };
    assert.equal((await request(app).post('/api/emotion/segments').send({ segment })).status, 401);
    assert.equal((await request(app).post('/api/emotion/segments').set('X-Droid-Key', 'wrong').send({ segment })).status, 401);
    assert.equal((await request(app).post('/api/reports').set('X-Droid-Key', 'wrong').send({})).status, 401);
  });

  test('deactivated and deleted teachers lose access immediately', async () => {
    const temp = await models.Teacher.create({ name: 'Temp', email: 't@test.my', password: 'teacher-pass-t', employeeId: 'EB-9' });
    const token = await login('teacher', 't@test.my', 'teacher-pass-t');
    assert.equal((await as(request(app).get('/api/auth/me'), token)).status, 200);

    await models.Teacher.updateOne({ _id: temp.id }, { status: 'inactive' });
    assert.equal((await as(request(app).get('/api/auth/me'), token)).status, 401);

    await models.Teacher.deleteOne({ _id: temp.id });
    assert.equal((await as(request(app).get('/api/auth/me'), token)).status, 401);
  });
});

describe('step 2: data fixes', () => {
  test('finishing a session through PATCH fills in endedAt', async () => {
    const res = await droid(request(app).patch(`/api/reports/${reportA.id}`)).send({ endTime: '09:00' });
    assert.equal(res.status, 200);
    assert.equal(new Date(res.body.endedAt).toISOString(), '2026-11-02T01:00:00.000Z');
  });

  test('students sharing a name in a class do not receive each other\'s scores', async () => {
    const twin1 = await models.Student.create({ name: 'Same Name', icNumber: '3', classGroup: '5C', studentId: 'STU-00031' });
    const twin2 = await models.Student.create({ name: 'Same Name', icNumber: '4', classGroup: '5C', studentId: 'STU-00032' });
    await models.SessionReport.create({
      date: '2026-11-03', subject: 'x', classGroup: '5C',
      studentEngagements: [{ studentName: 'Same Name', focusScore: 90 }, { studentId: twin2.id, studentName: 'Same Name', focusScore: 10 }],
    });
    const res = await as(request(app).get('/api/students?classGroup=5C'), adminToken);
    const level = id => res.body.find(s => s.id === id).engagementLevel;
    assert.equal(level(twin1.id), null);
    assert.equal(level(twin2.id), 'flagged');
  });

  test('renaming and deleting a class updates teachers\' class lists', async () => {
    const created = await as(request(app).post('/api/class-groups'), adminToken).send({ name: 'OLD', academicYear: 2026 });
    await models.Teacher.updateOne({ _id: teacherA.id }, { $addToSet: { assignedClasses: 'OLD' } });

    await as(request(app).patch(`/api/class-groups/${created.body.id}`), adminToken).send({ name: 'NEW' });
    let teacher = await models.Teacher.findById(teacherA.id);
    assert.ok(teacher.assignedClasses.includes('NEW'));
    assert.ok(!teacher.assignedClasses.includes('OLD'));

    await as(request(app).delete(`/api/class-groups/${created.body.id}`), adminToken);
    teacher = await models.Teacher.findById(teacherA.id);
    assert.ok(!teacher.assignedClasses.includes('NEW'));
  });

  test('renaming a teacher updates their schedules', async () => {
    const slot = await models.ClassSchedule.create({ subject: 'x', teacherId: teacherB.id, teacherName: 'Teacher B', classGroup: '5B', startTime: '08:00', endTime: '09:00', day: 'monday' });
    await as(request(app).patch(`/api/teachers/${teacherB.id}`), adminToken).send({ name: 'Teacher B2' });
    assert.equal((await models.ClassSchedule.findById(slot.id)).teacherName, 'Teacher B2');
  });

  test('subject names with special characters work', async () => {
    const res = await as(request(app).post('/api/subjects'), adminToken).send({ name: 'C++' });
    assert.equal(res.status, 201);
    const again = await as(request(app).post('/api/subjects'), adminToken).send({ name: 'c++' });
    assert.equal(again.status, 400);
  });

  test('invalid values and malformed IDs get a 400, not a 500', async () => {
    assert.equal((await as(request(app).patch(`/api/teachers/${teacherA.id}`), adminToken).send({ status: 'nonsense' })).status, 400);
    assert.equal((await as(request(app).patch('/api/droids/not-an-id'), adminToken).send({ battery: 5 })).status, 400);
  });

  test('concurrent student creates get unique IDs that do not reuse existing ones', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) =>
      as(request(app).post('/api/students'), adminToken).send({ name: `N${i}`, icNumber: `${i}`, classGroup: '5D' })));
    assert.ok(results.every(r => r.status === 201), results.map(r => r.status).join());
    const ids = results.map(r => r.body.studentId);
    assert.equal(new Set(ids).size, 8);
    assert.ok(ids.every(id => id > 'STU-00032'));
  });

  test('schedules can be filtered by day', async () => {
    await models.ClassSchedule.create({ subject: 'x', teacherId: teacherA.id, teacherName: 'A', classGroup: '5A', startTime: '08:00', endTime: '09:00', day: 'friday' });
    const res = await as(request(app).get('/api/schedules?day=friday'), adminToken);
    assert.ok(res.body.length > 0);
    assert.ok(res.body.every(s => s.day === 'friday'));
  });
});

describe('step 3-4: droid flow', () => {
  let personA;
  const segment = (id, personId, start, sessionId) => ({
    segment_id: id, session_id: sessionId, person_id: personId, scene_type: 'classroom',
    session_start_time: new Date(), start_offset_sec: start, end_offset_sec: start + 30,
  });
  const prediction = (label, extra = {}) => ({
    model_version: 'v0', predicted_label: label, probabilities: { [label]: 0.9 }, confidence: 0.9, ...extra,
  });

  test('the droid gets anonymous IDs with no names or ICs, and they stay stable', async () => {
    const first = await droid(request(app).get('/api/students/person-ids?classGroup=5A'));
    assert.equal(first.status, 200);
    assert.equal(first.body[0].name, undefined);
    assert.equal(first.body[0].icNumber, undefined);
    personA = first.body[0].personId;
    assert.match(personA, /^[0-9a-f-]{36}$/);

    const second = await droid(request(app).get('/api/students/person-ids?classGroup=5A'));
    assert.equal(second.body[0].personId, personA);
  });

  test('heartbeat updates the droid, and a silent droid shows as offline', async () => {
    const created = await as(request(app).post('/api/droids'), adminToken).send({ serialNumber: 'SN1' });
    const { droidId, id } = created.body;

    const beat = await droid(request(app).post(`/api/droids/${droidId}/heartbeat`)).send({ battery: 80, secret: 'ignored' });
    assert.equal(beat.status, 200);
    assert.equal(beat.body.battery, 80);
    assert.equal(beat.body.status, 'active');

    await models.Droid.updateOne({ _id: id }, { lastPingAt: new Date(Date.now() - 10 * 60 * 1000) });
    const list = await as(request(app).get('/api/droids'), adminToken);
    assert.equal(list.body.find(d => d.id === id).status, 'offline');

    assert.equal((await droid(request(app).post('/api/droids/DRD-999/heartbeat')).send({})).status, 404);
  });

  test('a full upload is stored in every collection; a resend gets 409 and adds nothing', async () => {
    const landmarks = Array.from({ length: 478 }, () => [0.5, 0.5, 0]);
    const body = {
      segment: segment('seg_full', personA, 0, reportA.id),
      modalities: { video_available: true, audio_available: false },
      openface: { pose_Rx_mean: 0.1, schema: 'v2.0' },
      pose: { hand_raise_ratio: 0, schema: 'v1.0-eb', upper_body_keypoints: Array.from({ length: 11 }, () => [0, 0, 1]), fidget_score: 0.2 },
      landmarks: { landmarks, blendshapes: { browInnerUp: 0.6 }, schema: 'v1.0' },
      prediction: prediction('focused'),
    };
    const res = await droid(request(app).post('/api/emotion/segments')).send(body);
    assert.equal(res.status, 201, res.text);
    assert.equal(await models.emotion.FaceLandmark.countDocuments({ segment_id: 'seg_full' }), 1);
    assert.equal(await models.emotion.EmotionPrediction.countDocuments({ segment_id: 'seg_full' }), 1);

    const resend = await droid(request(app).post('/api/emotion/segments')).send(body);
    assert.equal(resend.status, 409);
    assert.equal(await models.emotion.Segment.countDocuments({ segment_id: 'seg_full' }), 1);
  });

  test('a failed feature rolls the whole segment back', async () => {
    const res = await droid(request(app).post('/api/emotion/segments')).send({
      segment: segment('seg_bad', personA, 30, reportA.id),
      landmarks: { landmarks: [[0, 0, 0]] },
    });
    assert.equal(res.status, 400);
    assert.equal(await models.emotion.Segment.countDocuments({ segment_id: 'seg_bad' }), 0);
  });

  test('names cannot be stored as person_id, and unknown fields are rejected', async () => {
    const named = await droid(request(app).post('/api/emotion/segments')).send({ segment: segment('seg_name', 'Ali Bin Abu', 0, reportA.id) });
    assert.equal(named.status, 400);
    const extra = await droid(request(app).post('/api/emotion/segments')).send({ segment: { ...segment('seg_x', personA, 0, reportA.id), face_image: 'data:...' } });
    assert.equal(extra.status, 400);
    assert.match(extra.body.message, /face_image/);
  });

  test('summarize writes predictions, teacher corrections and noise into the report', async () => {
    const send = body => droid(request(app).post('/api/emotion/segments')).send(body);
    const anonymous = uuid();
    assert.equal((await send({ segment: segment('seg_d1', personA, 30, reportA.id), prediction: prediction('distracted') })).status, 201);
    assert.equal((await send({ segment: segment('seg_d2', personA, 60, reportA.id), prediction: prediction('distracted') })).status, 201);
    assert.equal((await send({ segment: segment('seg_u1', anonymous, 0, reportA.id), prediction: prediction('focused') })).status, 201);
    assert.equal((await send({ segment: segment('seg_voice_1', 'classroom', 0, reportA.id), voice: { energy_mean: 0.02, energy_std: 0.01 } })).status, 201);

    // The teacher corrects one prediction: 2 of 3 segments are now focused.
    const corrected = await as(request(app).patch('/api/emotion/predictions/seg_d1/label'), tokenA).send({ label: 'focused' });
    assert.equal(corrected.status, 200);

    const res = await droid(request(app).post(`/api/emotion/sessions/${reportA.id}/summarize`)).send({ complete: true });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.status, 'completed');
    assert.equal(res.body.avgNoiseEnergy, 0.02);

    const ali = res.body.studentEngagements.find(e => e.studentId === studentA.id);
    assert.equal(ali.studentName, 'Ali Bin Abu');
    assert.equal(ali.focusScore, 67);
    assert.equal(ali.engagementLevel, 'high');
    assert.equal(ali.distractedCount, 1);
    assert.deepEqual(ali.timeline.map(p => p.t), [0, 30, 60]);

    const unknown = res.body.studentEngagements.find(e => e.studentId === anonymous);
    assert.equal(unknown.studentName, `Student ${anonymous.slice(0, 8)}`);

    assert.equal(res.body.avgFocusScore, 84);
    assert.equal(res.body.overallEngagement, 'high');
  });

  test('teachers only reach emotion data for their own class', async () => {
    assert.equal((await as(request(app).get(`/api/emotion/sessions/${reportA.id}`), tokenA)).status, 200);
    assert.equal((await as(request(app).get(`/api/emotion/sessions/${reportA.id}`), tokenB)).status, 403);
    assert.equal((await as(request(app).patch('/api/emotion/predictions/seg_d2/label'), tokenB).send({ label: 'x' })).status, 403);
    assert.equal((await as(request(app).post(`/api/emotion/sessions/${reportA.id}/summarize`), tokenB).send({})).status, 403);
    assert.equal((await as(request(app).get('/api/emotion/storage'), tokenA)).status, 403);
    assert.equal((await as(request(app).get('/api/emotion/storage'), adminToken)).status, 200);
  });
});

describe('step 5: new features', () => {
  test('teachers check in to their own session only, and the first time is kept', async () => {
    const slot = await models.ClassSchedule.create({ subject: 'x', teacherId: teacherA.id, teacherName: 'A', classGroup: '5A', startTime: '08:00', endTime: '09:00', day: 'monday' });
    assert.equal((await as(request(app).post(`/api/schedules/${slot.id}/check-in`), tokenB)).status, 403);

    const res = await as(request(app).post(`/api/schedules/${slot.id}/check-in`), tokenA);
    assert.equal(res.status, 200);
    assert.equal(res.body.checkedIn, true);
    assert.equal(res.body.status, 'ongoing');
    assert.match(res.body.checkInTime, /^\d{2}:\d{2}$/);

    await models.ClassSchedule.updateOne({ _id: slot.id }, { checkInTime: '07:59' });
    const again = await droid(request(app).post(`/api/schedules/${slot.id}/check-in`));
    assert.equal(again.body.checkInTime, '07:59');
  });

  test('a teacher can change their password, and the old one stops working', async () => {
    const wrong = await as(request(app).post('/api/auth/change-password'), tokenB).send({ currentPassword: 'nope', newPassword: 'new-password-1' });
    assert.equal(wrong.status, 401);
    const short = await as(request(app).post('/api/auth/change-password'), tokenB).send({ currentPassword: 'teacher-pass-b', newPassword: 'short' });
    assert.equal(short.status, 400);

    const ok = await as(request(app).post('/api/auth/change-password'), tokenB).send({ currentPassword: 'teacher-pass-b', newPassword: 'new-password-1' });
    assert.equal(ok.status, 200);
    assert.equal((await request(app).post('/api/auth/teacher/login').send({ email: 'b@test.my', password: 'teacher-pass-b' })).status, 401);
    await login('teacher', 'b@test.my', 'new-password-1');
  });

  test('admins can reset a teacher\'s password; teachers cannot', async () => {
    assert.equal((await as(request(app).post(`/api/teachers/${teacherB.id}/reset-password`), tokenA).send({ password: 'temp-password-2' })).status, 403);
    assert.equal((await as(request(app).post(`/api/teachers/${teacherB.id}/reset-password`), adminToken).send({ password: 'temp-password-2' })).status, 200);
    await login('teacher', 'b@test.my', 'temp-password-2');
  });

  test('deleting a student removes them and their report results', async () => {
    const student = await models.Student.create({ name: 'Gone', icNumber: '5', classGroup: '5E', studentId: 'STU-09001' });
    const report = await models.SessionReport.create({
      date: '2026-11-04', subject: 'x', classGroup: '5E',
      studentEngagements: [{ studentId: student.id, studentName: 'Gone', focusScore: 50 }, { studentId: 'other', studentName: 'Stays', focusScore: 50 }],
    });
    assert.equal((await as(request(app).delete(`/api/students/${student.id}`), tokenA)).status, 403);
    assert.equal((await as(request(app).delete(`/api/students/${student.id}`), adminToken)).status, 200);

    assert.equal(await models.Student.countDocuments({ _id: student.id }), 0);
    const stored = await models.SessionReport.findById(report.id);
    assert.deepEqual(stored.studentEngagements.map(e => e.studentName), ['Stays']);
  });

  test('deleting a droid unassigns it from its class', async () => {
    const created = await as(request(app).post('/api/droids'), adminToken).send({ serialNumber: 'SN2' });
    const group = await models.ClassGroup.create({ name: '5F', academicYear: 2026, droidId: created.body.droidId });
    assert.equal((await as(request(app).delete(`/api/droids/${created.body.id}`), adminToken)).status, 200);
    assert.equal((await models.ClassGroup.findById(group.id)).droidId, undefined);
  });

  test('the audit log records actions without bodies or query strings; admins only', async () => {
    const before = await models.AuditLog.countDocuments();
    await as(request(app).get('/api/students?classGroup=5A'), tokenA);
    await as(request(app).post('/api/subjects'), adminToken).send({ name: 'AuditSubject' });
    await request(app).post('/api/auth/admin/login').send({ email: 'admin@test.my', password: 'wrong-password' });
    await new Promise(r => setTimeout(r, 300));

    assert.ok((await models.AuditLog.countDocuments()) >= before + 3);
    const view = await models.AuditLog.findOne({ entity: 'students', action: 'view', userId: teacherA.id }).lean();
    assert.equal(view.targetId, null);
    assert.ok(!JSON.stringify(view).includes('classGroup'));
    const failed = await models.AuditLog.findOne({ action: 'login_failed', email: 'admin@test.my' }).lean();
    assert.ok(failed);
    assert.ok(!JSON.stringify(failed).includes('wrong-password'));

    assert.equal((await as(request(app).get('/api/audit-logs'), tokenA)).status, 403);
    const logs = await as(request(app).get('/api/audit-logs?entity=subjects'), adminToken);
    assert.equal(logs.status, 200);
    assert.ok(logs.body.some(l => l.action === 'create'));
  });

  test('error handling: bad JSON, unknown routes, blocked origins', async () => {
    const badJson = await request(app).post('/api/auth/admin/login').set('Content-Type', 'application/json').send('{bad');
    assert.equal(badJson.status, 400);
    assert.equal((await request(app).get('/api/nothing')).status, 404);
    assert.equal((await request(app).get('/api/health').set('Origin', 'https://evil.example')).status, 403);
    const health = await request(app).get('/api/health');
    assert.deepEqual(health.body, { status: 'ok', appDb: 'connected', emotionDb: 'connected' });
  });

  test('repeated failed logins are blocked (keep last: uses up the limit)', async () => {
    let last;
    for (let i = 0; i < 11; i++) {
      last = await request(app).post('/api/auth/teacher/login').send({ email: 'a@test.my', password: 'wrong' });
    }
    assert.equal(last.status, 429);
  });
});
