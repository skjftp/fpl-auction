const { getActiveDraftId } = require('../utils/draft');

// Middleware to attach draft ID to request
async function attachDraftId(req, res, next) {
  try {
    req.activeDraftId = await getActiveDraftId();
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to get active draft' });
  }
}

module.exports = {
  getActiveDraftId,
  attachDraftId
};