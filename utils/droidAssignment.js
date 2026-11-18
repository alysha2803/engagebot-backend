const Droid = require('../models/Droid');
const ClassGroup = require('../models/ClassGroup');

const UNASSIGNED = 'Unassigned';

// A droid's classroom is stored twice: Droid.assignedRoom (class name) and ClassGroup.droidId.
// Every change goes through here so both sides always agree, and one class has at most one droid.
async function assignDroidToClass(droidId, className) {
  const target = className && className !== UNASSIGNED ? className : null;

  await ClassGroup.updateMany(
    { droidId, ...(target ? { name: { $ne: target } } : {}) },
    { $unset: { droidId: 1 } },
  );

  if (target) {
    const cls = await ClassGroup.findOne({ name: target });
    if (cls) {
      if (cls.droidId && cls.droidId !== droidId) {
        await Droid.updateOne({ droidId: cls.droidId }, { assignedRoom: UNASSIGNED });
      }
      cls.droidId = droidId;
      await cls.save();
    }
  }

  await Droid.updateOne({ droidId }, { assignedRoom: target || UNASSIGNED });
}

module.exports = { assignDroidToClass, UNASSIGNED };
