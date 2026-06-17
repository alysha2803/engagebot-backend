const express = require('express');
const router = express.Router();
const Subject = require('../models/Subject');
const { verifyToken, adminOnly } = require('../middleware/auth');

router.get('/', verifyToken, async (req, res) => {
  try {
    const subjects = await Subject.find().sort('name').lean();
    res.json(subjects.map(s => ({ ...s, id: s._id.toString(), _id: undefined, __v: undefined })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', verifyToken, adminOnly, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Subject name is required' });
    const existing = await Subject.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
    if (existing) return res.status(400).json({ message: 'Subject already exists' });
    const subject = await Subject.create({ name: name.trim(), description: description || '' });
    res.status(201).json(subject.toPublic());
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    await Subject.findByIdAndDelete(req.params.id);
    res.json({ message: 'Subject deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
