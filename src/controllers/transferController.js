const Transfer = require('../models/Transfer');

const getTransfers = async (req, res, next) => {
  try {
    const transfers = await Transfer.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: transfers.length, transfers });
  } catch (error) {
    next(error);
  }
};

const createTransfer = async (req, res, next) => {
  try {
    const { player, position, fromClub, toClub, fee, status, probability } = req.body;
    if (!player || !fromClub || !toClub) {
      return res.status(400).json({ success: false, message: 'Player name, fromClub, and toClub are required' });
    }

    const transfer = await Transfer.create({
      player,
      position: position || 'FW',
      fromClub,
      toClub,
      fee: fee || 'Undisclosed Fee',
      status: status || 'HOT RUMOR',
      probability: probability || '80%',
      createdBy: req.user?._id
    });

    res.status(201).json({ success: true, message: 'Transfer record created', transfer });
  } catch (error) {
    next(error);
  }
};

const updateTransfer = async (req, res, next) => {
  try {
    const transfer = await Transfer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!transfer) return res.status(404).json({ success: false, message: 'Transfer record not found' });
    res.status(200).json({ success: true, message: 'Transfer record updated', transfer });
  } catch (error) {
    next(error);
  }
};

const deleteTransfer = async (req, res, next) => {
  try {
    const transfer = await Transfer.findByIdAndDelete(req.params.id);
    if (!transfer) return res.status(404).json({ success: false, message: 'Transfer record not found' });
    res.status(200).json({ success: true, message: 'Transfer record deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTransfers,
  createTransfer,
  updateTransfer,
  deleteTransfer
};
